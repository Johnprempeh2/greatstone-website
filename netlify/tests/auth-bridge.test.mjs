// The auth bridge on Netlify Database (GRE-1795, migration 002_auth_bridge; the GRE-1703 plan, "How the rules stay
// in the database"). Applies every migration to a throwaway real Postgres (lib/postgres.mjs), loads the public
// catalogue seed (supabase/seed/seed.sql) and a few private rows, then proves:
//   * the claims and the role end with each transaction, on a pooled connection that the next request reuses;
//   * `anon` reads only public rows, in every table, and no policy opens any other row to it;
//   * the worker role (service_role, BYPASSRLS) sees every row under FORCE RLS, where anon and an unknown
//     signed-in user see none (a wrong role gives an empty app, not an error, so this is checked here);
//   * auth.users follows Better Auth's "user" table and keeps each uuid;
//   * 002 refuses an existing service_role without BYPASSRLS instead of building an app that sees nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip, OWNER } from './lib/postgres.mjs';

// The seed predates Supabase 0007's unique SKU per org and repeats a few SKUs; those variants are skipped here.
const SEED = readFileSync(new URL('../../supabase/seed/seed.sql', import.meta.url), 'utf8')
  .replace(/^(INSERT INTO offering_variants .*);$/gm, '$1 ON CONFLICT DO NOTHING;');
const ORG = '11111111-1111-4111-8111-111111111111';
const A = 'a0000000-0000-4000-8000-00000000000a';
const USER = { sub: '00000000-0000-4000-8000-0000000000a1', email: 'person.one@client-a.example.test' };
const STAFF = { sub: '00000000-0000-4000-8000-000000000002', email: 'editor@example.test' };

// The only rows anon may read: the published catalogue, the display rate, the permission names and the service
// popularity counts. A policy that opens anything else to anon fails 'no policy opens other rows to anon'.
const PUBLIC_ROWS = {
  vendors: `status = 'published' AND deleted_at IS NULL`,
  categories: `status = 'published' AND deleted_at IS NULL`,
  offerings: `status = 'published' AND deleted_at IS NULL`,
  offering_variants: `deleted_at IS NULL AND EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.status = 'published' AND o.deleted_at IS NULL)`,
  offering_specs: `EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.status = 'published' AND o.deleted_at IS NULL)`,
  offering_media: `EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.status = 'published' AND o.deleted_at IS NULL)`,
  pricing_rules: `active AND status = 'published' AND deleted_at IS NULL`,
  pricing_rule_targets: `EXISTS (SELECT 1 FROM pricing_rules r WHERE r.id = rule_id AND r.active AND r.status = 'published' AND r.deleted_at IS NULL)`,
  org_settings: 'true',
  permissions: 'true',
  service_popularity: 'true',
};

let db;
let pool;
function ok(sql, user) {
  const r = db.psql(sql, user);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
// every table in the schemas a request can reach
const tables = () => ok(`SELECT n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'auth', 'storage') ORDER BY 1;`).split('\n');
/** Row count of `table` as `role` with `claims` in one transaction; 'denied' when the role has no grant. */
function countAs(role, table, claims = null) {
  const pre = role ? `SET LOCAL ROLE ${role};` : '';
  const set = claims ? `SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', true) \\g /dev/null\n` : '';
  const r = db.psql(`BEGIN; ${pre}\n${set}SELECT count(*) FROM ${table};\nCOMMIT;`);
  if (r.status !== 0) {
    assert.match(r.stderr, /permission denied/, `${role} on ${table}: ${r.stderr}`);
    return 'denied';
  }
  return r.stdout.trim();
}

before(async () => {
  if (skip) return;
  db = startPostgres('auth-bridge');
  await db.migrate();
  ok(SEED);
  // private rows next to the public ones: unpublished and deleted catalogue rows, a client, staff, an enquiry
  ok(`UPDATE vendors SET status = 'draft' WHERE slug = 'pdflib';
      UPDATE categories SET deleted_at = now() WHERE slug = 'email';
      UPDATE offerings SET status = 'draft' WHERE id IN (SELECT id FROM offerings ORDER BY slug LIMIT 3);
      UPDATE offerings SET deleted_at = now() WHERE id IN (SELECT id FROM offerings ORDER BY slug DESC LIMIT 2);
      INSERT INTO customers (id, org_id, slug, name) VALUES ('${A}', '${ORG}', 'test-client-a', 'Test Client A');
      INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject) VALUES ('${ORG}', '${A}', '${USER.email}', 'Test A One', '${USER.sub}');
      INSERT INTO users (org_id, email, full_name, role, auth_subject) VALUES ('${ORG}', '${STAFF.email}', 'Test Editor', 'editor', '${STAFF.sub}');
      INSERT INTO auth.users (id, email) VALUES ('${USER.sub}', '${USER.email}'), ('${STAFF.sub}', '${STAFF.email}');
      INSERT INTO service_inquiries (contact_email, source) VALUES ('enquiry@example.test', 'contact');
      INSERT INTO storage.buckets (id, name) VALUES ('test-bucket', 'test-bucket') ON CONFLICT DO NOTHING;
      INSERT INTO storage.objects (bucket_id, name) VALUES ('test-bucket', '${A}/test.pdf');`);
  pool = new pg.Pool({ connectionString: db.url, max: 1 });
});
after(async () => {
  await pool?.end();
  db?.stop();
});

// ── claims on a pooled connection ─────────────────────────────────────────────────────────────

/** What one request sees inside its transaction, the way a Netlify Function runs it. */
async function request(client, { role, claims, org, fail }) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    if (claims) await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    if (org) await client.query("SELECT set_config('app.current_org', $1, true)", [org]);
    const { rows } = await client.query('SELECT pg_backend_pid() AS pid, current_user AS who, auth.uid() AS uid, auth.jwt() AS jwt');
    if (fail) await client.query('SELECT 1 / 0');
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    if (!fail) throw e;
    return null;
  }
}
const between = async (client) =>
  (await client.query(`SELECT pg_backend_pid() AS pid, current_user AS who, auth.uid() AS uid, auth.jwt() AS jwt,
    coalesce(current_setting('app.current_org', true), '') AS org`)).rows[0];

test('claims, org and role end with the transaction; the next request on the same pooled connection starts clean', { skip }, async () => {
  const client = await pool.connect();
  try {
    const first = await request(client, { role: 'authenticated', claims: USER, org: ORG });
    assert.deepEqual([first.who, first.uid, first.jwt.email], ['authenticated', USER.sub, USER.email]);
    const next = await between(client);
    assert.equal(next.pid, first.pid, 'the same backend serves the next request');
    assert.deepEqual({ ...next, pid: 0 }, { pid: 0, who: OWNER, uid: null, jwt: {}, org: '' });
    // the next request is a visitor: it gets none of the previous user's identity
    const visitor = await request(client, { role: 'anon' });
    assert.deepEqual([visitor.pid, visitor.who, visitor.uid, visitor.jwt], [first.pid, 'anon', null, {}]);
    // a request that fails half-way leaves nothing behind either
    await request(client, { role: 'authenticated', claims: STAFF, org: ORG, fail: true });
    assert.deepEqual({ ...(await between(client)), pid: 0 }, { pid: 0, who: OWNER, uid: null, jwt: {}, org: '' });
  } finally {
    client.release();
  }
});

test('the check above can fail: a session-level set_config does leak to the next request', { skip }, async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(USER)]); // false = session
    await client.query('COMMIT');
    assert.equal((await between(client)).uid, USER.sub, 'leaked, as expected without is_local = true');
  } finally {
    await client.query('RESET ALL');
    client.release();
  }
  const again = await pool.connect();
  try {
    assert.equal((await between(again)).uid, null);
  } finally {
    again.release();
  }
});

// ── anon ──────────────────────────────────────────────────────────────────────────────────────

test('anon reads only public rows, in every table', { skip }, () => {
  const seen = {};
  for (const t of tables()) {
    const name = t.replace(/^public\./, '');
    const expected = PUBLIC_ROWS[name] && t.startsWith('public.') ? ok(`SELECT count(*) FROM ${t} WHERE ${PUBLIC_ROWS[name]};`) : null;
    const got = countAs('anon', t);
    if (expected === null) assert.ok(got === 'denied' || got === '0', `anon read ${got} rows of ${t}`);
    else assert.equal(got, expected, `anon on ${t}`);
    seen[name] = got;
  }
  // and the data was there to be hidden: private catalogue rows exist next to the public ones
  assert.ok(Number(ok(`SELECT count(*) FROM offerings;`)) > Number(seen.offerings));
  assert.ok(Number(ok(`SELECT count(*) FROM vendors;`)) > Number(seen.vendors));
  assert.ok(Number(seen.offerings) > 100, 'the public catalogue is readable');
});

test('no policy opens other rows to anon', { skip }, () => {
  const policies = ok(`SELECT tablename || '|' || policyname || '|' || regexp_replace(qual, '\\s+', ' ', 'g') FROM pg_policies
    WHERE schemaname IN ('public', 'auth', 'storage') AND roles && ARRAY['public', 'anon']::name[] AND cmd IN ('SELECT', 'ALL')
    ORDER BY 1;`).split('\n');
  for (const line of policies) {
    const [table, name, qual] = line.split('|');
    // the org gate needs app.current_org, which no request sets for anon (proved in the claims test above)
    if (/^\(?(org_)?id = app_current_org\(\)\)?$/.test(qual)) continue;
    if (name === 'offerings_tenant_isolation' && qual.includes("current_setting('app.current_org'::text, true)")) continue;
    // 044: only the one recent lead the front door bound in its claims (front-door-rls.test.mjs proves it)
    if (table === 'front_door_leads' && name === 'anon_select_own'
      && qual === "((id = front_door_lead_id()) AND (created_at > (now() - '01:00:00'::interval)))") continue;
    // 045: only the quote the request made in this transaction (visitor-quote-rls.test.mjs proves it)
    if (table === 'quotes' && name === 'visitor_select_own' && qual === '((id = visitor_quote_id()) AND (created_at = now()))') continue;
    assert.ok(PUBLIC_ROWS[table], `${table}.${name} opens rows to anon: ${qual}`);
    assert.ok(name === 'public_read' || name === 'perms_read', `${table}.${name} is not a reviewed public read`);
  }
});

// ── the worker role ───────────────────────────────────────────────────────────────────────────

test('every table a request can reach has RLS on', { skip }, () => {
  assert.equal(ok(`SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', '), 'none') FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'auth', 'storage') AND NOT c.relrowsecurity;`), 'none');
});

test('only the worker role bypasses RLS; anon and authenticated do not', { skip }, () => {
  assert.equal(ok(`SELECT string_agg(rolname || ':' || rolbypassrls, ',' ORDER BY rolname) FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role');`), 'anon:false,authenticated:false,service_role:true');
});

test('the worker sees every row under FORCE RLS, where anon and an unknown user see none', { skip }, () => {
  const forced = ok(`SELECT n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND c.relforcerowsecurity AND n.nspname IN ('public', 'auth', 'storage') ORDER BY 1;`).split('\n');
  assert.ok(forced.length > 40, `FORCE RLS on ${forced.length} tables`);
  const withRows = [];
  const noGrant = [];
  for (const t of forced) {
    const all = ok(`SELECT count(*) FROM ${t};`);
    const worker = countAs('service_role', t);
    if (worker === 'denied') { noGrant.push(t); continue; }
    assert.equal(worker, all, `worker on ${t}`);
    if (all !== '0') withRows.push(t);
  }
  // the tables the ported migrations keep from the worker, as Supabase 0037 and 0038 revoke them from service_role,
  // and the GSAM admin bridge's audit and nonces, which only its own functions touch (048), and its change log,
  // idempotency keys and refund requests (049: the webhook reaches refund requests only through its trigger),
  // the private Deep Dive mapping, snapshots and pending answers (050), billing lines (055), and the client activity outbox and counter (056).
  assert.deepEqual(noGrant, ['public.admin_bridge_audit', 'public.admin_bridge_change', 'public.admin_bridge_idempotency',
    'public.admin_bridge_nonce', 'public.billing_lines', 'public.client_activity_outbox', 'public.client_activity_sequence',
    'public.deep_dive_answers', 'public.deep_dive_snapshots', 'public.deep_dive_tenant_links',
    'public.mcp_pdf_chunks', 'public.mcp_pdf_uploads', 'public.mcp_token_clients', 'public.mcp_tokens', 'public.portal_approvers',
    'public.refund_requests']);
  for (const t of ['public.customers', 'public.users', 'public.service_inquiries', 'public.offerings']) {
    assert.ok(withRows.includes(t), `${t} has rows the worker sees`);
    if (!PUBLIC_ROWS[t.slice(7)]) assert.ok(['0', 'denied'].includes(countAs('anon', t)), `anon on ${t}`);
    const stranger = countAs('authenticated', t, { sub: 'ffffffff-ffff-4fff-8fff-ffffffffffff', email: 'nobody@example.test' });
    if (!PUBLIC_ROWS[t.slice(7)]) assert.ok(['0', 'denied'].includes(stranger), `an unknown user on ${t}: ${stranger}`);
  }
  // the worker reads the whole of a table a client sees only part of
  assert.equal(countAs('authenticated', 'public.customers', USER), '1');
  assert.equal(countAs('service_role', 'public.customers'), ok('SELECT count(*) FROM customers;'));
});

// ── auth.users and Better Auth ────────────────────────────────────────────────────────────────

test('auth.users follows Better Auth\'s user table and keeps each uuid; a non-uuid id is refused', { skip }, () => {
  // Better Auth's core "user" table as the portal starter kit creates it, with the trigger step 6 adds
  ok(`CREATE TABLE "user" ("id" text PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL UNIQUE,
        "emailVerified" boolean NOT NULL DEFAULT false, "image" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
      CREATE TRIGGER trg_auth_users_sync AFTER INSERT OR UPDATE OR DELETE ON "user"
        FOR EACH ROW EXECUTE FUNCTION auth.sync_better_auth_user();`);
  const id = 'c0ffee00-0000-4000-8000-000000000001';
  ok(`INSERT INTO "user" ("id", "name", "email") VALUES ('${id}', 'Test Person', 'Test.Person@example.test');`);
  assert.equal(ok(`SELECT email || ':' || (email_confirmed_at IS NULL) FROM auth.users WHERE id = '${id}';`), 'Test.Person@example.test:true');
  ok(`UPDATE "user" SET "emailVerified" = true, "email" = 'test.person@example.test' WHERE "id" = '${id}';`);
  assert.equal(ok(`SELECT email || ':' || (email_confirmed_at IS NULL) FROM auth.users WHERE id = '${id}';`), 'test.person@example.test:false');
  // the signed-in user's auth.uid() is the same uuid the policies compare
  const r = db.psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${id}"}', true) \\g /dev/null\nSELECT auth.uid(); COMMIT;`);
  assert.equal(r.stdout.trim(), id);
  const bad = db.psql(`INSERT INTO "user" ("id", "name", "email") VALUES ('not-a-uuid', 'Bad', 'bad@example.test');`);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /not a uuid/);
  assert.equal(ok(`SELECT count(*) FROM "user" WHERE "id" = 'not-a-uuid';`), '0');
  ok(`DELETE FROM "user" WHERE "id" = '${id}';`);
  assert.equal(ok(`SELECT count(*) FROM auth.users WHERE id = '${id}';`), '0');
  // nobody but the owner and the worker reads auth.users
  for (const role of ['anon', 'authenticated']) assert.equal(countAs(role, 'auth.users', USER), 'denied');
});

test('002 refuses a service_role that exists without BYPASSRLS (an app that sees nothing is not built)', { skip }, async () => {
  const other = startPostgres('auth-bridge-guard');
  try {
    const r = other.psql('CREATE ROLE service_role NOLOGIN;', 'postgres', 'postgres');
    assert.equal(r.status, 0, r.stderr);
    await assert.rejects(other.migrate('002'), /service_role exists without BYPASSRLS/);
    assert.equal(other.psql('SELECT count(*) FROM netlify.migrations;').stdout.trim(), '1', 'only 001 is recorded');
  } finally {
    other.stop();
  }
});
