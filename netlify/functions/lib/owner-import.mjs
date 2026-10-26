// The one-time owner importer (GRE-2578, design: section 2 of the GRE-2567 cut-over plan, reviewed on GRE-2577).
// Netlify gives the owner (write) role only to code running in a deploy, so the two writes that are not migrations
// (the staging identity import for GRE-1991 and the production row move for GRE-2567) go through this one path.
//
// It runs only its own two fixed transforms, never SQL, table or column names from the payload:
//   identities  the 052_better_auth/import-users.mjs checks and upserts, unchanged
//   tables      a data-only move into the hard-coded TABLES list below, positional rows checked against the catalog
//
// Guards, in order. Until the first three pass it reads nothing and writes nothing:
//   1. OWNER_IMPORT_UNTIL is set, in the future and at most 60 minutes away
//   2. the site is in the hard-coded SITES allow-list (name and id) and OWNER_IMPORT_SITE names it for this run
//   3. the deploy context is the one that site's entry names, and the deploy is not an unpublished one
//   4. a payload is in the private `owner-import` Blobs store, for a mode that site allows, before its notAfter
//   5. apply needs a passed dry run of the same payload hash; an applied hash never applies again
// Each run is one transaction as `netlifydb_owner` on a pool opened for that run and ended after it. The result blob
// and the log carry counts, status and a hash prefix only, never row values.
import { createHash, randomUUID } from 'node:crypto';
import { importUsers, validateImport } from '../../database/migrations/052_better_auth/import-users.mjs';

export const STORE = 'owner-import';
export const MAX_WINDOW_MS = 60 * 60 * 1000;
export const OWNER = 'netlifydb_owner';

// Reviewed targets. Production identities need a fresh export of ten and a reviewed change to the fixed count
// (IMPORT.md), so production takes only the table move for now. A rehearsal site is added here in its own PR.
export const SITES = Object.freeze({
  'gre1795-website-db-staging': { id: '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb', context: 'production', modes: ['identities', 'proof'] },
  'greatstone-home': { id: '3b1e97e6-e184-4251-badd-deed532be3ab', context: 'production', modes: ['tables'] },
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
 * order. Refuses a table outside TABLES that has rows, or a row missing a target column. Returns the source columns the
 * target does not take (generated ones, or a schema gap the operator must look at) by name only.
 */
export function buildTablesData(source, columns) {
  for (const [table, rows] of Object.entries(source))
    if (!TABLES.includes(table) && rows?.length) throw new Error(`Export has rows for ${table}, which is not in TABLES`);
  const dropped = {};
  const tables = TABLES.map((table) => {
    const cols = columns.get(table);
    const rows = source[table] || [];
    for (const row of rows) for (const c of cols) if (!Object.hasOwn(row, c)) throw new Error(`Export rows for ${table} lack column ${c}`);
    const extra = [...new Set(rows.flatMap(Object.keys))].filter((c) => !cols.includes(c));
    if (extra.length) dropped[table] = extra;
    return { columns: columnsHash(cols), rows: rows.map((row) => cols.map((c) => row[c])) };
  });
  return { data: { tables }, dropped };
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

async function moveIdentities(pool, data, apply) {
  // import-users.mjs throws fixed messages for its own checks; a pg error keeps its code and is reported by it
  const fixed = (error) => (error?.code ? error : new Refusal(error.message));
  let users;
  try { users = validateImport(data); } catch (error) { throw fixed(error); }
  try { return { identities: { source: users.length, imported: await importUsers(pool, users, apply) } }; }
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
      const inserted = await client.query(`INSERT INTO better_auth."user"
        ("id","name","email","emailVerified") VALUES ($1,'GRE-2805 staging fixture',$2,true)
        ON CONFLICT ("id") DO NOTHING RETURNING "id"`, [fixture.id, fixture.email]);
      if (!inserted.rowCount) {
        const { rows: existing } = await client.query(`SELECT "email" FROM better_auth."user" WHERE "id"=$1`, [fixture.id]);
        if (existing.length !== 1 || existing[0].email !== fixture.email) refuse('proof-fixture-conflict');
      }
      const { rows: accounts } = await client.query(`SELECT "password" FROM better_auth."account"
        WHERE "userId"=$1 AND "providerId"='credential'`, [fixture.id]);
      if (accounts.length) {
        if (accounts.length !== 1 || accounts[0].password !== fixture.passwordHash) refuse('proof-fixture-conflict');
      } else {
        await client.query(`INSERT INTO better_auth."account"
          ("id","accountId","providerId","userId","password")
          VALUES ($1,$2,'credential',$2,$3)`, [randomUUID(), fixture.id, fixture.passwordHash]);
      }
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { identities: { source: 8, matched }, checks, fixtureId: apply ? data.fixture.id : undefined };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
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
    const ledgerKey = `ledger/${hash}`;
    const ledger = (await store.get(ledgerKey, { type: 'json' })) || {};
    if (ledger.appliedAt) {
      Object.assign(result, { status: 'noop', reason: 'already-applied', counts: ledger.counts });
    } else {
      if (action === 'apply' && !ledger.dryRunAt) refuse('dry-run-required');
      const pool = openPool();
      let counts;
      try {
        counts = mode === 'identities' ? await moveIdentities(pool, data, action === 'apply')
          : mode === 'proof' ? await proveIdentities(pool, data, action === 'apply')
            : await moveTables(pool, data, action === 'apply');
      } finally { await pool.end(); }
      const at = new Date(now).toISOString();
      if (action === 'apply') Object.assign(ledger, { appliedAt: at, counts });
      else Object.assign(ledger, { dryRunAt: at, dryRunCounts: counts });
      await store.setJSON(ledgerKey, ledger);
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
