// The one-time owner importer (GRE-2578, design: section 2 of the GRE-2567 cut-over plan, reviewed on GRE-2577).
// Netlify gives the owner (write) role only to code running in a deploy, so the two writes that are not migrations
// (the staging identity import for GRE-1991 and the production row move for GRE-2567) go through this one path.
//
// It runs only its own fixed transforms, never SQL, table or column names from the payload:
//   identities        the 052_better_auth/import-users.mjs checks and upserts, unchanged
//   tables            a data-only move into the hard-coded TABLES list below, positional rows checked against the catalog
//   mcp-token         registers a portal MCP token from its SHA-256 (GRE-3769, migration 064); never the token itself
//   mcp-token-revoke  revokes a portal MCP token by id (040's mcp_portal_revoke_token)
//   approver          registers the one portal approver (039's portal_approvers) from John's card (GRE-3964)
//   approver-link     links one GSAM person to that approver (067's portal_bridge_approvers) from John's card (GRE-3960)
//   staging-approver  staging only: a fake signed-in owner, made portal approver and linked to one GSAM person
//                     (067's portal_bridge_approvers), so the bridge's approve and publish can be proved (GRE-4081)
//   verify-test-account  staging only: marks the one throwaway audit account verified (staging sends no email), so
//                     the Next cutover can prove the signed-in pages; it takes an email of a fixed shape and nothing else
//   staging-test-approver(-off)  staging only: makes that verified audit account an active Greatstone owner and portal
//                     approver, or switches it off again, for the signed-in approve, accept and receipt check (GRE-2621)
//
// Guards, in order. Until the first three pass it reads nothing and writes nothing:
//   1. OWNER_IMPORT_UNTIL is set, in the future and at most 60 minutes away
//   2. the site is in the hard-coded SITES allow-list (name and id) and OWNER_IMPORT_SITE names it for this run
//   3. the deploy context is the one that site's entry names, and the deploy is not an unpublished one
//   4. a payload is in the private `owner-import` Blobs store, for a mode that site allows, before its notAfter
//   5. apply needs a passed dry run of the same payload hash in the same window; an applied hash never applies again
//      in that window
// Each run is one transaction as `netlifydb_owner` on a pool opened for that run and ended after it. The result blob
// and the log carry counts, status and a hash prefix only, never row values.
import { createHash, randomUUID } from 'node:crypto';
import { importUsers, validateImport } from '../../database/migrations/052_better_auth/import-users.mjs';

export const STORE = 'owner-import';
export const MAX_WINDOW_MS = 60 * 60 * 1000;
export const OWNER = 'netlifydb_owner';

// Reviewed targets. identityCount is the exact number of source identities a site accepts: eight on staging (the
// GRE-1991 export), ten on the rehearsal and production sites (Supabase auth.users, counted 3 Nov 2026, GRE-2567).
// The rehearsal site is a throwaway copy of the cut-over (GRE-1701 rule 3); remove its entry when the site is deleted.
export const SITES = Object.freeze({
  'gre1795-website-db-staging': { id: '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb', context: 'production', modes: ['identities', 'proof'], identityCount: 8 },
  'greatstone-home': { id: '3b1e97e6-e184-4251-badd-deed532be3ab', context: 'production', modes: ['tables', 'identities', 'mcp-token', 'mcp-token-revoke', 'approver', 'approver-link'], identityCount: 10 },
  'gre2567-cutover-rehearsal': { id: '6dce28c9-4b0d-4141-bf95-731dc0c4c843', context: 'production', modes: ['tables', 'identities'], identityCount: 10 },
  // The Next staging site's database starts empty (GRE-4222): the fake GRE-4103 org and test client, and the fake
  // approver for the bridge's approve and publish check (GRE-4081), and the signed-in test approver (GRE-2621).
  'gre3833-next-db-staging': { id: '6689e558-855b-40b1-be45-c530531fed45', context: 'production',
    modes: ['tables', 'staging-approver', 'verify-test-account', 'staging-test-approver', 'staging-test-approver-off'], identityCount: 0 },
});

// The Supabase tables with rows (cut-over plan, section 1), parents before children. The order is checked against the
// migrated schema's foreign keys in netlify/tests/owner-import.test.mjs.
export const TABLES = Object.freeze([
  'organisations', 'users', 'customer_tiers', 'org_settings', 'fx_rate_history', 'categories', 'vendors',
  'offerings', 'offering_variants', 'offering_specs', 'customers', 'customer_users', 'pricing_rules',
  'pricing_rule_targets', 'quotes', 'quote_items', 'orders', 'order_items', 'licence_keys', 'member_invite_requests',
  'engagements', 'deepdive_plans', 'deepdive_item_state', 'deepdive_log', 'service_inquiries', 'service_popularity',
  'service_popularity_hits',
]);

// Columns a Netlify-only migration added to a TABLES table. Supabase rows never carry them, so the move writes NULL
// (each is nullable with no default). Any other missing column still refuses. Found by the GRE-2567 rehearsal, 3 Nov.
export const NEW_ON_TARGET = Object.freeze({
  // 042_service_inquiry_size_band, 057_enquiry_client_link, 075_service_inquiry_contact_role
  service_inquiries: Object.freeze(['size_band', 'customer_id', 'contact_role']),
});

// A refusal with a fixed message. Anything else is reported by its Postgres code only, as pg messages carry values.
export class Refusal extends Error {}
const refuse = (reason) => { throw new Refusal(reason); };

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const payloadHash = (mode, data) => createHash('sha256').update(stableStringify({ mode, data })).digest('hex');
export const columnsHash = (columns) => createHash('sha256').update(columns.join(',')).digest('hex');
// The ledger lives in Blobs, so it outlives a database snapshot restore. Keyed by the window too: a replayed tick in
// the same window is a no-op, and a new window (prepare takes a fresh snapshot) applies again. Across windows the
// transforms' own checks refuse rows that already exist (rows-conflict, mcp-token-exists, identities must match).
// Found by the GRE-2567 re-rehearsal H6, 3 Nov: after the restore, H's ledger made the re-import a no-op on an empty
// database.
export const ledgerKey = (until, hash) => `ledger/${new Date(until).toISOString()}/${hash}`;

/** Guards 1-3. Returns the site entry, or a refusal reason. Reads only the environment and the function context. */
export function checkWindow({ env, context, now = Date.now(), sites = SITES }) {
  if (!env.OWNER_IMPORT_UNTIL) return { inert: true };
  const until = Date.parse(env.OWNER_IMPORT_UNTIL);
  if (!Number.isFinite(until)) return { reason: 'window-invalid' };
  if (until <= now) return { reason: 'window-expired' };
  if (until - now > MAX_WINDOW_MS) return { reason: 'window-too-long' };
  const name = context?.site?.name;
  const site = Object.hasOwn(sites, name || '') ? sites[name] : null;
  if (!site || context?.site?.id !== site.id) return { reason: 'site-not-allowed' };
  if (env.OWNER_IMPORT_SITE !== name) return { reason: 'site-not-targeted' };
  if (context?.deploy?.context !== site.context) return { reason: 'deploy-context' };
  if (context?.deploy?.published === false) return { reason: 'deploy-unpublished' };
  return { site, until };
}

function parseEnvelope(raw, site, until, now) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1) refuse('payload-invalid');
  const { mode, action, notAfter, data } = raw;
  if (!site.modes.includes(mode)) refuse('mode-not-allowed');
  if (action !== 'dry-run' && action !== 'apply') refuse('action-invalid');
  const deadline = Date.parse(notAfter);
  if (!Number.isFinite(deadline) || deadline <= now || deadline > until) refuse('payload-expired');
  return { mode, action, data };
}

/** The target's insertable columns for every TABLES entry, in attribute order, from the catalog. */
export async function targetColumns(client) {
  const { rows } = await client.query(`SELECT c.relname AS table, a.attname AS column
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname = ANY($1::text[])
       AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
     ORDER BY c.relname, a.attnum`, [TABLES]);
  const out = new Map(TABLES.map((t) => [t, []]));
  for (const r of rows) out.get(r.table).push(r.column);
  return out;
}

/**
 * For the runner: turn an export ({ table: [rowObject] }) into the tables payload, positional in the target's column
 * order. Refuses a table outside TABLES that has rows, or a row missing a target column other than its NEW_ON_TARGET
 * ones (written as NULL). Returns the source columns the target does not take (generated ones, or a schema gap the
 * operator must look at) by name only.
 */
export function buildTablesData(source, columns) {
  for (const [table, rows] of Object.entries(source))
    if (!TABLES.includes(table) && rows?.length) throw new Error(`Export has rows for ${table}, which is not in TABLES`);
  const dropped = {};
  const tables = TABLES.map((table) => {
    const cols = columns.get(table);
    const rows = source[table] || [];
    const fill = NEW_ON_TARGET[table] || [];
    for (const row of rows) for (const c of cols)
      if (!Object.hasOwn(row, c) && !fill.includes(c)) throw new Error(`Export rows for ${table} lack column ${c}`);
    const extra = [...new Set(rows.flatMap(Object.keys))].filter((c) => !cols.includes(c));
    if (extra.length) dropped[table] = extra;
    return { columns: columnsHash(cols), rows: rows.map((row) => cols.map((c) => (Object.hasOwn(row, c) ? row[c] : null))) };
  });
  return { data: { tables }, dropped };
}

/**
 * For the runner: recount a table apply through the read-only connection. netlifydb_readonly has no BYPASSRLS and most
 * TABLES force RLS, so its count(*) sees only what the policies allow: 0 on a client table (GRE-2567 rehearsal, 3 Nov).
 * Where count(*) differs, the second witness is Postgres's own live-row count (pg_stat_user_tables.n_live_tup), which
 * RLS does not filter. The statistics arrive a few seconds after the import's session goes idle, so a difference is
 * read again, at most `tries` times. Returns the tables that still differ (names only) and how many matched each way.
 */
export async function recountTables(client, counts, { tries = 4, waitMs = 5000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const { rows } = await client.query(
      `SELECT relname, n_live_tup::int AS n FROM pg_stat_user_tables WHERE schemaname = 'public'`);
    const live = new Map(rows.map((r) => [r.relname, r.n]));
    const out = { differs: [], byCount: 0, byStats: 0 };
    for (const c of counts) {
      if (await count(client, c.table) === c.after) out.byCount++;
      else if (live.get(c.table) === c.after) out.byStats++;
      else out.differs.push(c.table);
    }
    if (!out.differs.length || attempt >= tries) return out;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function validateTables(data, columns) {
  if (!data || !Array.isArray(data.tables) || data.tables.length !== TABLES.length) refuse('tables-shape');
  return TABLES.map((table, i) => {
    const entry = data.tables[i];
    const cols = columns.get(table);
    if (!cols.length) refuse('table-missing');
    if (!entry || entry.columns !== columnsHash(cols) || !Array.isArray(entry.rows)) refuse('columns-differ');
    for (const row of entry.rows) if (!Array.isArray(row) || row.length !== cols.length) refuse('row-shape');
    return { table, cols, rows: entry.rows };
  });
}

const count = async (client, table) =>
  (await client.query(`SELECT count(*)::int AS n FROM public.${quoteIdent(table)}`)).rows[0].n;
const quoteIdent = (name) => `"${String(name).replaceAll('"', '""')}"`;

/**
 * The table move in one transaction: user triggers that are on are turned off for the move and back on before the
 * transaction ends (so no trigger adds rows or rewrites values), every row must insert (a conflict refuses), each
 * table's count must rise by exactly its row count, and serial sequences move past the imported ids.
 */
export async function moveTables(pool, data, apply = false) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const { rows: [who] } = await client.query('SELECT current_user AS role');
    if (who?.role !== OWNER) refuse('owner-role-required');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('owner-import'))");
    const plan = validateTables(data, await targetColumns(client));
    const counts = [];
    for (const { table } of plan) counts.push({ table, before: await count(client, table) });
    const triggers = (await client.query(`SELECT c.relname AS table, t.tgname AS name FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])
         AND NOT t.tgisinternal AND t.tgenabled = 'O'`, [TABLES])).rows;
    for (const t of triggers) await client.query(`ALTER TABLE public.${quoteIdent(t.table)} DISABLE TRIGGER ${quoteIdent(t.name)}`);
    for (const [i, { table, cols, rows }] of plan.entries()) {
      if (!rows.length) { counts[i].rows = 0; continue; }
      const list = cols.map(quoteIdent).join(', ');
      const objects = rows.map((row) => Object.fromEntries(cols.map((c, k) => [c, row[k]])));
      const inserted = await client.query(`INSERT INTO public.${quoteIdent(table)} (${list})
        SELECT ${list} FROM json_populate_recordset(NULL::public.${quoteIdent(table)}, $1::json)
        ON CONFLICT DO NOTHING`, [JSON.stringify(objects)]);
      counts[i].rows = rows.length;
      if (inserted.rowCount !== rows.length) refuse('rows-conflict');
      const seqs = (await client.query(`SELECT a.attname AS column, pg_get_serial_sequence($1::text, a.attname) AS seq
          FROM pg_attribute a WHERE a.attrelid = $1::text::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
      [`public.${quoteIdent(table)}`])).rows.filter((s) => s.seq);
      for (const s of seqs) await client.query(`SELECT setval($1, GREATEST((SELECT max(${quoteIdent(s.column)}) FROM public.${quoteIdent(table)}), 1))`, [s.seq]);
    }
    for (const t of triggers) await client.query(`ALTER TABLE public.${quoteIdent(t.table)} ENABLE TRIGGER ${quoteIdent(t.name)}`);
    for (const c of counts) {
      c.after = await count(client, c.table);
      if (c.after !== c.before + c.rows) refuse('count-differs');
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { tables: counts };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function moveIdentities(pool, data, apply, expected) {
  // import-users.mjs throws fixed messages for its own checks; a pg error keeps its code and is reported by it
  const fixed = (error) => (error?.code ? error : new Refusal(error.message));
  let users;
  try { users = validateImport(data, expected); } catch (error) { throw fixed(error); }
  try { return { identities: { source: users.length, imported: await importUsers(pool, users, apply, expected) } }; }
  catch (error) { throw fixed(error); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const BCRYPT_10 = /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const APPROVED_PREFIXES = new Set([
  '079636cf', 'd814b01d', 'c3f9c60f', '2d47ada5',
  '7a0c5d8e', '681507c1', 'e81bc42a', '5a85a5ba',
]);

// This mode is deliberately limited to the eight approved staging identities and one new fixture.
// The payload travels through the private owner-import store; results contain prefixes and booleans only.
export function validateProof(data) {
  if (!data || !Array.isArray(data.source) || data.source.length !== 8) refuse('proof-source-count');
  const ids = new Set();
  for (const row of data.source) {
    if (!UUID.test(row?.id) || !APPROVED_PREFIXES.has(row.id.slice(0, 8))
      || !DIGEST.test(row.uuidDigest) || !DIGEST.test(row.emailDigest)
      || !DIGEST.test(row.bcryptDigest) || ids.has(row.id)) refuse('proof-source-shape');
    ids.add(row.id);
  }
  if (new Set([...ids].map((id) => id.slice(0, 8))).size !== 8) refuse('proof-source-shape');
  const fixture = data.fixture;
  if (!UUID.test(fixture?.id) || ids.has(fixture.id)
    || typeof fixture.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fixture.email)
    || fixture.email !== fixture.email.trim().toLowerCase()
    || !BCRYPT_10.test(fixture.passwordHash)) refuse('proof-fixture-shape');
  return data;
}

export async function proveIdentities(pool, data, apply) {
  validateProof(data);
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const { rows: [who] } = await client.query('SELECT current_user AS role');
    if (who?.role !== OWNER) refuse('owner-role-required');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('owner-import'))");
    const checks = [];
    for (const source of data.source) {
      const { rows } = await client.query(`SELECT u."id", u."email", a."password"
        FROM better_auth."user" u
        LEFT JOIN better_auth."account" a ON a."userId"=u."id" AND a."providerId"='credential'
        WHERE u."id"=$1`, [source.id]);
      const row = rows.length === 1 ? rows[0] : null;
      checks.push({
        prefix: source.id.slice(0, 8),
        uuid: !!row && sha256(row.id.toLowerCase()) === source.uuidDigest,
        email: !!row && sha256(row.email.trim().toLowerCase()) === source.emailDigest,
        bcrypt: !!row?.password && sha256(row.password) === source.bcryptDigest,
      });
    }
    const matched = checks.filter((row) => row.uuid && row.email && row.bcrypt).length;
    if (apply && matched !== 8) refuse('proof-mismatch');
    if (matched === 8) {
      const fixture = data.fixture;
      const { rows: existing } = await client.query(`SELECT "id" FROM better_auth."user"
        WHERE "id"=$1 OR "email"=$2`, [fixture.id, fixture.email]);
      if (existing.length) refuse('proof-fixture-conflict');
      await client.query(`INSERT INTO better_auth."user"
        ("id","name","email","emailVerified") VALUES ($1,'GRE-2805 staging fixture',$2,true)`,
      [fixture.id, fixture.email]);
      await client.query(`INSERT INTO better_auth."account"
        ("id","accountId","providerId","userId","password")
        VALUES ($1,$2,'credential',$2,$3)`, [randomUUID(), fixture.id, fixture.passwordHash]);
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { identities: { source: 8, matched }, checks };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// --- portal MCP tokens (GRE-3769) ---
// The token is made on John's computer (scripts/mcp-token-new.mjs) and goes only into the app's connection. The
// payload carries its SHA-256 and nothing else secret; a payload with any other field, or with a 'gspm_' value
// anywhere, is refused. The result carries the token id and the client count, never the hash.

const MCP_TOKEN_FIELDS = 'customerIds,label,tokenSha256';
export function validateMcpToken(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) refuse('mcp-token-shape');
  if (JSON.stringify(data).includes('gspm_')) refuse('mcp-token-raw-token');
  if (Object.keys(data).sort().join(',') !== MCP_TOKEN_FIELDS) refuse('mcp-token-fields');
  const { label, customerIds, tokenSha256 } = data;
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 120) refuse('mcp-token-label');
  if (!Array.isArray(customerIds) || !customerIds.length || customerIds.length > 50
    || !customerIds.every((id) => typeof id === 'string' && UUID.test(id))
    || new Set(customerIds).size !== customerIds.length) refuse('mcp-token-clients');
  if (typeof tokenSha256 !== 'string' || !DIGEST.test(tokenSha256)) refuse('mcp-token-hash');
  return data;
}

export function validateMcpTokenRevoke(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).join(',') !== 'tokenId' || typeof data.tokenId !== 'string' || !UUID.test(data.tokenId))
    refuse('mcp-token-revoke-shape');
  return data;
}

/** One transaction as the owner, under the importer's lock; rolled back unless apply. */
async function ownerTransaction(pool, apply, fn) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const { rows: [who] } = await client.query('SELECT current_user AS role');
    if (who?.role !== OWNER) refuse('owner-role-required');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('owner-import'))");
    const out = await fn(client);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return out;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function registerMcpToken(pool, data, apply) {
  const { label, customerIds, tokenSha256 } = validateMcpToken(data);
  return ownerTransaction(pool, apply, async (client) => {
    // the function checks these too; checking first gives a fixed reason instead of a bare SQLSTATE
    const { rows: [c] } = await client.query(`SELECT count(*)::int AS n, count(DISTINCT org_id)::int AS orgs
      FROM public.customers WHERE id = ANY($1::uuid[])`, [customerIds]);
    if (c.n !== customerIds.length) refuse('mcp-token-clients-unknown');
    if (c.orgs !== 1) refuse('mcp-token-clients-mixed-org');
    const { rows: [t] } = await client.query('SELECT count(*)::int AS n FROM public.mcp_tokens WHERE token_sha256 = $1', [tokenSha256]);
    if (t.n) refuse('mcp-token-exists');
    const { rows: [r] } = await client.query('SELECT mcp_portal_register_token($1, $2::uuid[], $3) AS id', [label, customerIds, tokenSha256]);
    const { rows: [k] } = await client.query('SELECT count(*)::int AS n FROM public.mcp_token_clients WHERE token_id = $1', [r.id]);
    if (k.n !== customerIds.length) refuse('mcp-token-clients-differ');
    // a dry run's id is rolled back with it, so only an apply reports one
    return { mcpToken: { ...(apply ? { id: r.id } : {}), clients: k.n } };
  });
}

export async function revokeMcpToken(pool, data, apply) {
  const { tokenId } = validateMcpTokenRevoke(data);
  return ownerTransaction(pool, apply, async (client) => {
    const { rows } = await client.query('SELECT revoked_at IS NOT NULL AS revoked FROM public.mcp_tokens WHERE id = $1 FOR UPDATE', [tokenId]);
    if (!rows.length) refuse('mcp-token-not-found');
    await client.query('SELECT mcp_portal_revoke_token($1)', [tokenId]);
    const { rows: [after] } = await client.query('SELECT revoked_at IS NOT NULL AS revoked FROM public.mcp_tokens WHERE id = $1', [tokenId]);
    if (!after.revoked) refuse('mcp-token-not-revoked');
    return { mcpTokenRevoke: { id: tokenId, alreadyRevoked: rows[0].revoked } };
  });
}

// --- the portal approver (GRE-3964) ---
// 039 left portal_approvers to John in the Supabase SQL editor, so no agent, staff owner or migration makes an
// approver. Netlify Database gives the owner role only to a deploy, so John names himself on the cut-over card and
// this mode writes that one row. It takes an email and a label, and only an active owner of the Greatstone org whose
// auth_subject is a sign-in (auth.users id) qualifies. While any approver row exists it refuses: one approver, John.
// The result carries counts only, never the email or an id.

// src/lib/staff-provision.mjs GREATSTONE_ORG_ID, the id the migrations seed
export const GREATSTONE_ORG_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateApprover(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) refuse('approver-shape');
  if (Object.keys(data).sort().join(',') !== 'email,label') refuse('approver-fields');
  const { email, label } = data;
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email)
    || email !== email.trim().toLowerCase()) refuse('approver-email');
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 120) refuse('approver-label');
  return data;
}

export async function registerApprover(pool, data, apply) {
  const { email, label } = validateApprover(data);
  return ownerTransaction(pool, apply, async (client) => {
    // nothing else writes this table, but the check and the insert must still see the same rows
    await client.query('LOCK TABLE public.portal_approvers IN SHARE ROW EXCLUSIVE MODE');
    const { rows: [a] } = await client.query('SELECT count(*)::int AS n FROM public.portal_approvers');
    if (a.n) refuse('approver-exists');
    const { rows } = await client.query(`SELECT u.role::text AS role, (u.is_active AND u.deleted_at IS NULL) AS active,
        (SELECT a.id FROM auth.users a WHERE a.id::text = lower(u.auth_subject)) AS auth_user_id
      FROM public.users u WHERE u.org_id = $1 AND u.email = $2`, [GREATSTONE_ORG_ID, email]);
    if (rows.length !== 1) refuse('approver-user-unknown');
    const [user] = rows;
    if (!user.active) refuse('approver-user-inactive');
    if (user.role !== 'owner') refuse('approver-not-owner');
    if (!user.auth_user_id) refuse('approver-no-sign-in');
    const inserted = await client.query('INSERT INTO public.portal_approvers (auth_user_id, label) VALUES ($1, $2)',
      [user.auth_user_id, label.trim()]);
    const { rows: [b] } = await client.query('SELECT count(*)::int AS n FROM public.portal_approvers');
    if (inserted.rowCount !== 1 || b.n !== 1) refuse('approver-count-differs');
    return { approver: { before: 0, inserted: 1, after: 1 } };
  });
}

// --- the GSAM link to the portal approver (GRE-3960) ---
// 067 publishes from GSAM only for a GSAM person (user:<id>) linked in portal_bridge_approvers to the registered
// approver, and left that row to John in an SQL editor Netlify Database does not give him. This mode writes it on
// John's card: the GSAM person and a label come from the payload; the approver is the one row the approver mode wrote,
// and it must be an active owner of the Greatstone org. While any link exists it refuses. Counts only in the result.

export function validateApproverLink(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) refuse('approver-link-shape');
  if (Object.keys(data).sort().join(',') !== 'gsamActor,label') refuse('approver-link-fields');
  if (typeof data.gsamActor !== 'string' || !GSAM_PERSON.test(data.gsamActor)) refuse('approver-link-actor');
  if (typeof data.label !== 'string' || !data.label.trim() || data.label.trim().length > 100) refuse('approver-link-label');
  return data;
}

export async function linkApprover(pool, data, apply) {
  const { gsamActor, label } = validateApproverLink(data);
  return ownerTransaction(pool, apply, async (client) => {
    await client.query('LOCK TABLE public.portal_approvers, public.portal_bridge_approvers IN SHARE ROW EXCLUSIVE MODE');
    const n = async (sql, params) => (await client.query(sql, params)).rows[0].n;
    if (await n('SELECT count(*)::int AS n FROM public.portal_bridge_approvers')) refuse('approver-link-exists');
    const { rows } = await client.query('SELECT auth_user_id FROM public.portal_approvers');
    if (rows.length !== 1) refuse('approver-link-no-approver');
    const [{ auth_user_id: authUserId }] = rows;
    if (await n(`SELECT count(*)::int AS n FROM public.users WHERE auth_subject = $1::text AND org_id = $2
        AND role = 'owner' AND is_active AND deleted_at IS NULL`, [authUserId, GREATSTONE_ORG_ID]) !== 1)
      refuse('approver-link-not-owner');
    await client.query('INSERT INTO public.portal_bridge_approvers (gsam_actor, auth_user_id, label) VALUES ($1, $2, $3)',
      [gsamActor, authUserId, label.trim()]);
    // the same join bridge_portal_approve_and_publish makes
    const linked = await n(`SELECT count(*)::int AS n FROM public.portal_bridge_approvers b
        JOIN public.portal_approvers r ON r.auth_user_id = b.auth_user_id
       WHERE b.gsam_actor = $1 AND EXISTS (SELECT 1 FROM public.users u WHERE u.auth_subject = b.auth_user_id::text
         AND u.org_id = $2 AND u.is_active AND u.deleted_at IS NULL)`, [gsamActor, GREATSTONE_ORG_ID]);
    if (linked !== 1) refuse('approver-link-differs');
    return { approverLink: { before: 0, inserted: 1, after: 1 } };
  });
}

// --- the staging audit account (Next cutover, 7 Nov 2026) ---
// Staging has no mail sender, so a Better Auth sign-up there can never verify. This mode verifies one throwaway
// account whose address has the fixed audit shape (STAGING_TEST_EMAIL in .env.example), and nothing else: it refuses
// any other address and refuses unless exactly one such unverified account exists. Allowed on gre3833 only.
export const STAGING_AUDIT_EMAIL = /^staging-audit\+\d{1,13}@example\.com$/;

export function validateTestAccount(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).join(',') !== 'email') refuse('test-account-fields');
  if (typeof data.email !== 'string' || !STAGING_AUDIT_EMAIL.test(data.email)) refuse('test-account-email');
  return data;
}

export async function verifyTestAccount(pool, data, apply) {
  const { email } = validateTestAccount(data);
  return ownerTransaction(pool, apply, async (client) => {
    const { rowCount } = await client.query(
      'UPDATE better_auth."user" SET "emailVerified" = true, "updatedAt" = now() WHERE email = $1 AND NOT "emailVerified"', [email]);
    if (rowCount !== 1) refuse('test-account-not-found');
    return { testAccount: { verified: 1 } };
  });
}

// --- the staging bridge approver (GRE-4081) ---
// A staging database has no real sign-ins, so this mode writes a fixed fake one: an auth.users row, an active owner
// of the Greatstone org signed in as it, that sign-in as the portal approver, and the 067 link from one GSAM person
// (user:<id>) to it. Only the GSAM actor and a label come from the payload; ids and email are the fixed ones below.
// It refuses while any approver or link exists, so it writes once per database. Allowed on staging sites only.

export const STAGING_APPROVER = Object.freeze({
  authUserId: '41030000-0000-4000-8000-0000000000a1',
  staffId: '41030000-0000-4000-8000-0000000000a2',
  email: 'gre-4103-approver@staging.invalid',
});
const GSAM_PERSON = /^user:[A-Za-z0-9_-]{1,64}$/; // 067's check on portal_bridge_approvers.gsam_actor

export function validateStagingApprover(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) refuse('staging-approver-shape');
  if (Object.keys(data).sort().join(',') !== 'gsamActor,label') refuse('staging-approver-fields');
  if (typeof data.gsamActor !== 'string' || !GSAM_PERSON.test(data.gsamActor)) refuse('staging-approver-actor');
  if (typeof data.label !== 'string' || !data.label.trim() || data.label.trim().length > 100) refuse('staging-approver-label');
  return data;
}

export async function registerStagingApprover(pool, data, apply) {
  const { gsamActor, label } = validateStagingApprover(data);
  const { authUserId, staffId, email } = STAGING_APPROVER;
  return ownerTransaction(pool, apply, async (client) => {
    await client.query('LOCK TABLE public.portal_approvers, public.portal_bridge_approvers IN SHARE ROW EXCLUSIVE MODE');
    const n = async (sql, params) => (await client.query(sql, params)).rows[0].n;
    if (await n('SELECT count(*)::int AS n FROM public.organisations WHERE id = $1', [GREATSTONE_ORG_ID]) !== 1)
      refuse('staging-approver-no-org');
    if (await n('SELECT count(*)::int AS n FROM public.portal_approvers') || await n('SELECT count(*)::int AS n FROM public.portal_bridge_approvers'))
      refuse('staging-approver-exists');
    if (await n('SELECT count(*)::int AS n FROM auth.users WHERE id = $1 OR email = $2', [authUserId, email])
      || await n('SELECT count(*)::int AS n FROM public.users WHERE id = $1 OR (org_id = $2 AND email = $3)', [staffId, GREATSTONE_ORG_ID, email]))
      refuse('staging-approver-fixture-exists');
    await client.query('INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, now())', [authUserId, email]);
    await client.query(`INSERT INTO public.users (id, org_id, email, full_name, role, auth_subject, is_active)
      VALUES ($1, $2, $3, $4, 'owner', $5, true)`, [staffId, GREATSTONE_ORG_ID, email, `${label.trim()} (staging approver)`, authUserId]);
    await client.query('INSERT INTO public.portal_approvers (auth_user_id, label) VALUES ($1, $2)', [authUserId, label.trim()]);
    await client.query('INSERT INTO public.portal_bridge_approvers (gsam_actor, auth_user_id, label) VALUES ($1, $2, $3)',
      [gsamActor, authUserId, label.trim()]);
    // the same join bridge_portal_approve_and_publish makes: the link must reach an active owner of the org
    const linked = await n(`SELECT count(*)::int AS n FROM public.portal_bridge_approvers b
        JOIN public.portal_approvers r ON r.auth_user_id = b.auth_user_id
       WHERE b.gsam_actor = $1 AND EXISTS (SELECT 1 FROM public.users u WHERE u.auth_subject = b.auth_user_id::text
         AND u.org_id = $2 AND u.is_active AND u.deleted_at IS NULL)`, [gsamActor, GREATSTONE_ORG_ID]);
    if (linked !== 1) refuse('staging-approver-link-differs');
    return { stagingApprover: { signIns: 1, staff: 1, approvers: 1, links: 1 } };
  });
}

// --- the staging test approver (GRE-2621) ---
// The bridge approver above cannot sign in, so a signed-in approve, accept and receipt check needs a real sign-in.
// This mode takes the one verified staging audit account (STAGING_AUDIT_EMAIL, made by verify-test-account) and makes
// it an active owner of the Greatstone org and a portal approver. It refuses any other address, an unverified or
// missing account, an address that was ever Greatstone staff, and any run while an active staging audit address is
// Greatstone staff: one active test approver at a time. staging-test-approver-off removes its approver row and marks
// the staff row inactive; nothing else is deleted, so approvals it made keep their history, and a later run needs a
// new audit address. Allowed on gre3833 only.

export function validateTestApprover(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) refuse('test-approver-shape');
  if (Object.keys(data).sort().join(',') !== 'email,label') refuse('test-approver-fields');
  if (typeof data.email !== 'string' || !STAGING_AUDIT_EMAIL.test(data.email)) refuse('test-approver-email');
  if (typeof data.label !== 'string' || !data.label.trim() || data.label.trim().length > 100) refuse('test-approver-label');
  return data;
}

export function validateTestApproverOff(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).join(',') !== 'email') refuse('test-approver-off-fields');
  if (typeof data.email !== 'string' || !STAGING_AUDIT_EMAIL.test(data.email)) refuse('test-approver-off-email');
  return data;
}

const AUDIT_EMAIL_SQL = '^staging-audit\\+[0-9]{1,13}@example\\.com$';

export async function registerTestApprover(pool, data, apply) {
  const { email, label } = validateTestApprover(data);
  return ownerTransaction(pool, apply, async (client) => {
    await client.query('LOCK TABLE public.portal_approvers, public.users IN SHARE ROW EXCLUSIVE MODE');
    const n = async (sql, params) => (await client.query(sql, params)).rows[0].n;
    if (await n('SELECT count(*)::int AS n FROM public.organisations WHERE id = $1', [GREATSTONE_ORG_ID]) !== 1)
      refuse('test-approver-no-org');
    if (await n(`SELECT count(*)::int AS n FROM public.users WHERE org_id = $1 AND email ~ $2 AND is_active AND deleted_at IS NULL`,
      [GREATSTONE_ORG_ID, AUDIT_EMAIL_SQL])) refuse('test-approver-exists');
    if (await n('SELECT count(*)::int AS n FROM public.users WHERE email = $1', [email])) refuse('test-approver-used');
    const { rows } = await client.query(`SELECT u."id" AS id FROM better_auth."user" u
      JOIN auth.users a ON a.id::text = u."id" WHERE u."email" = $1 AND u."emailVerified"`, [email]);
    if (rows.length !== 1) refuse('test-approver-no-sign-in');
    const [{ id }] = rows;
    if (await n('SELECT count(*)::int AS n FROM public.users WHERE auth_subject = $1', [id])) refuse('test-approver-sign-in-in-use');
    await client.query(`INSERT INTO public.users (org_id, email, full_name, role, auth_subject, is_active)
      VALUES ($1, $2, $3, 'owner', $4, true)`, [GREATSTONE_ORG_ID, email, `${label.trim()} (staging test approver)`, id]);
    await client.query('INSERT INTO public.portal_approvers (auth_user_id, label) VALUES ($1, $2)', [id, label.trim()]);
    // the two checks portal_approve_and_publish makes: a registered approver who is active staff of the org
    const ready = await n(`SELECT count(*)::int AS n FROM public.portal_approvers r JOIN public.users u
        ON u.auth_subject = r.auth_user_id::text AND u.org_id = $1 AND u.role = 'owner' AND u.is_active AND u.deleted_at IS NULL
       WHERE r.auth_user_id = $2`, [GREATSTONE_ORG_ID, id]);
    if (ready !== 1) refuse('test-approver-differs');
    return { testApprover: { staff: 1, approvers: 1 } };
  });
}

export async function removeTestApprover(pool, data, apply) {
  const { email } = validateTestApproverOff(data);
  return ownerTransaction(pool, apply, async (client) => {
    await client.query('LOCK TABLE public.portal_approvers, public.users IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query(`SELECT id, auth_subject, is_active FROM public.users
      WHERE org_id = $1 AND email = $2 FOR UPDATE`, [GREATSTONE_ORG_ID, email]);
    if (rows.length !== 1 || !rows[0].auth_subject) refuse('test-approver-not-found');
    const [user] = rows;
    const removed = await client.query('DELETE FROM public.portal_approvers WHERE auth_user_id::text = $1', [user.auth_subject]);
    await client.query('UPDATE public.users SET is_active = false WHERE id = $1', [user.id]);
    return { testApproverOff: { approvers: removed.rowCount, deactivated: user.is_active ? 1 : 0 } };
  });
}

// Counts and fixed reasons only: a pg error's message and detail can carry row values.
function safeError(error) {
  if (error instanceof Refusal) return { reason: error.message };
  return { reason: 'database-error', code: typeof error?.code === 'string' ? error.code : undefined,
    table: typeof error?.table === 'string' ? error.table : undefined,
    constraint: typeof error?.constraint === 'string' ? error.constraint : undefined };
}

/**
 * One scheduled tick. deps: env, context, store (get/setJSON/delete), openPool() -> pool (ended here), log, now.
 * Returns what it did, for tests; the scheduled handler ignores it.
 */
export async function runOwnerImport({ env, context, store, openPool, log = console.log, now = Date.now(), sites = SITES }) {
  const gate = checkWindow({ env, context, now, sites });
  if (gate.inert) return { status: 'inert' };
  if (gate.reason) {
    log(`owner-import: refused ${gate.reason}`);
    return { status: 'refused', reason: gate.reason };
  }
  const raw = await store.get('payload', { type: 'json' });
  if (raw == null) return { status: 'idle' };
  await store.delete('payload');

  let result;
  let hash = 'none';
  try {
    const { mode, action, data } = parseEnvelope(raw, gate.site, gate.until, now);
    hash = payloadHash(mode, data);
    result = { hash, mode, action };
    const key = ledgerKey(gate.until, hash);
    const ledger = (await store.get(key, { type: 'json' })) || {};
    if (ledger.appliedAt) {
      Object.assign(result, { status: 'noop', reason: 'already-applied', counts: ledger.counts });
    } else {
      if (action === 'apply' && !ledger.dryRunAt) refuse('dry-run-required');
      const pool = openPool();
      let counts;
      try {
        counts = mode === 'identities' ? await moveIdentities(pool, data, action === 'apply', gate.site.identityCount)
          : mode === 'proof' ? await proveIdentities(pool, data, action === 'apply')
            : mode === 'mcp-token' ? await registerMcpToken(pool, data, action === 'apply')
              : mode === 'mcp-token-revoke' ? await revokeMcpToken(pool, data, action === 'apply')
                : mode === 'approver' ? await registerApprover(pool, data, action === 'apply')
                  : mode === 'approver-link' ? await linkApprover(pool, data, action === 'apply')
                  : mode === 'staging-approver' ? await registerStagingApprover(pool, data, action === 'apply')
                    : mode === 'verify-test-account' ? await verifyTestAccount(pool, data, action === 'apply')
                      : mode === 'staging-test-approver' ? await registerTestApprover(pool, data, action === 'apply')
                        : mode === 'staging-test-approver-off' ? await removeTestApprover(pool, data, action === 'apply')
                          : await moveTables(pool, data, action === 'apply');
      } finally { await pool.end(); }
      const at = new Date(now).toISOString();
      if (action === 'apply') Object.assign(ledger, { appliedAt: at, counts });
      else Object.assign(ledger, { dryRunAt: at, dryRunCounts: counts });
      await store.setJSON(key, ledger);
      Object.assign(result, { status: action === 'apply' ? 'applied' : 'dry-run-ok', counts });
    }
  } catch (error) {
    result = { ...(result || { hash }), status: 'failed', ...safeError(error) };
  }
  result.at = new Date(now).toISOString();
  await store.setJSON(`results/${hash}/${result.action || 'unknown'}`, result);
  await store.setJSON('results/latest', result);
  log(`owner-import: ${result.status}${result.reason ? ` ${result.reason}` : ''} mode=${result.mode || '-'} action=${result.action || '-'} hash=${hash.slice(0, 12)}`);
  return result;
}
