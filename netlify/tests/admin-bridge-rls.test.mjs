// GSAM admin bridge under RLS (GRE-2323, migration 048_gsam_bridge). Applies netlify/database/migrations to a
// throwaway real Postgres (lib/postgres.mjs), adds rows in two organisations, then acts as gsam_bridge_read with and
// without the bridge claims to prove: it reads only the first organisation's rows and only the granted columns, it
// can write nothing, it cannot read staff, token, approver, audit or nonce tables, a nonce works once, the time
// window holds on the database clock, every call leaves an audit row, and the migration refuses a role that
// bypasses RLS. Without the Postgres server binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS, startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111'; // the first organisation: the one the bridge serves
const OTHER = '22222222-2222-4222-8222-222222222222';
const C = { mine: 'c0000000-0000-4000-8000-000000000001', other: 'c0000000-0000-4000-8000-000000000002' };
const U = { mine: 'c1000000-0000-4000-8000-000000000001', other: 'c1000000-0000-4000-8000-000000000002' };
const Q = { mine: 'c2000000-0000-4000-8000-000000000001', other: 'c2000000-0000-4000-8000-000000000002' };
const O = { mine: 'c3000000-0000-4000-8000-000000000001', other: 'c3000000-0000-4000-8000-000000000002' };
const L = { mine: 'c4000000-0000-4000-8000-000000000001', other: 'c4000000-0000-4000-8000-000000000002' };
const D = { mine: 'c5000000-0000-4000-8000-000000000001', other: 'c5000000-0000-4000-8000-000000000002' };
const SHA = 'b'.repeat(64);
const TABLES = ['customers', 'customer_users', 'quotes', 'quote_items', 'orders', 'order_items', 'licence_keys',
  'portal_documents', 'portal_acceptances', 'service_inquiries', 'front_door_leads'];

let db;
let n = 0;
const nonce = () => `n${String(++n).padStart(21, '0')}`;
const GOOD = { role: 'gsam_bridge', cap: 'read', org: ORG };

/** Run sql in one transaction as gsam_bridge_read with `claims` (or none), or as the owner when claims is null. */
function as(claims, sql) {
  const pre = claims === null ? '' : `SET LOCAL ROLE gsam_bridge_read;\n${claims === undefined ? ''
    : `SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', true) \\g /dev/null\n`}`;
  const r = db.psql(`BEGIN;\n${pre}${sql}\nCOMMIT;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}
function ok(claims, sql) {
  const r = as(claims, sql);
  assert.ok(r.ok, `expected success: ${r.err}`);
  return r.out;
}
function refused(claims, sql, pattern) {
  const r = as(claims, sql);
  assert.equal(r.ok, false, `expected refusal, got: ${r.out}`);
  if (pattern) assert.match(r.err, pattern);
}
const owner = (sql) => ok(null, sql);
const begin = (k, time = 'extract(epoch FROM now())::bigint') =>
  `SELECT org_id FROM admin_bridge_begin('stg-read-1', 'read', '${k}', ${time}, 'agent:ridge', NULL, 'GET', '/api/admin/v1/health');`;

// The portal's own triggers allow a published document only through its approval flow; the seed skips them.
function seedPortal(org, k) {
  return `SET session_replication_role = replica;
    INSERT INTO portal_documents (id, org_id, customer_id, kind, title, status, content_sha256, action, confirmation_text)
      VALUES ('${D[k]}', '${org}', '${C[k]}', 'nda', 'NDA', 'published', '${SHA}', 'accept', 'I accept');
    INSERT INTO portal_acceptances (org_id, customer_id, document_id, document_version, content_sha256, action, signer_name,
      signer_title, account_company_name, signer_email, auth_subject, confirmation_text, confirmed)
      VALUES ('${org}', '${C[k]}', '${D[k]}', 1, '${SHA}', 'accept', 'Sam', 'CEO', '${k} Co', '${k}@example.test', 'sub-${k}', 'I accept', true);
    SET session_replication_role = DEFAULT;`;
}

function seed(org, k) {
  const mine = k === 'mine';
  return `
    INSERT INTO customers (id, org_id, slug, name, stripe_customer_id) VALUES ('${C[k]}', '${org}', '${k}-co', '${k} Co', 'cus_${k}');
    INSERT INTO customer_users (id, org_id, customer_id, email, auth_subject) VALUES ('${U[k]}', '${org}', '${C[k]}', '${k}@example.test', 'sub-${k}');
    INSERT INTO quotes (id, org_id, reference, customer_id, contact_email, po_document_path)
      VALUES ('${Q[k]}', '${org}', 'Q-${k}', '${C[k]}', '${k}@example.test', '${C[k]}/po.pdf');
    INSERT INTO quote_items (org_id, quote_id, offering_name) VALUES ('${org}', '${Q[k]}', 'Thing');
    INSERT INTO orders (id, org_id, reference, customer_id, invoice_number, stripe_payment_intent, total_minor)
      VALUES ('${O[k]}', '${org}', 'O-${k}', '${C[k]}', 'INV-${k}', 'pi_${k}', 1200);
    INSERT INTO order_items (org_id, order_id, offering_name, unit_price_minor, line_total_minor) VALUES ('${org}', '${O[k]}', 'Thing', 1200, 1200);
    INSERT INTO licence_keys (id, org_id, customer_id, offering_name, licence_key) VALUES ('${L[k]}', '${org}', '${C[k]}', 'Thing', 'SECRET-KEY-${mine ? 'AB12' : 'CD34'}');
    INSERT INTO service_inquiries (org_id, contact_name, contact_email, ip) VALUES ('${org}', 'Sam', '${k}@example.test', '203.0.113.9');
    INSERT INTO front_door_leads (org_id, industry, company_name, contact_email) VALUES ('${org}', 'Retail', '${k} Co', '${k}@example.test');`;
}

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-rls');
  await db.migrate('003');
  owner(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  owner(seed(ORG, 'mine') + seed(OTHER, 'other'));
  const r = db.psql(seedPortal(ORG, 'mine') + seedPortal(OTHER, 'other'), 'postgres');
  assert.equal(r.status, 0, r.stderr);
});

after(() => db?.stop());

test('gsam_bridge_read cannot log in and does not bypass RLS', { skip }, () => {
  assert.equal(owner(`SELECT rolcanlogin || ' ' || rolbypassrls || ' ' || rolsuper FROM pg_roles WHERE rolname = 'gsam_bridge_read';`), 'false false false');
  for (const t of TABLES) assert.equal(owner(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass;`), 't', t);
});

test('with the bridge claims it reads exactly the first organisation\'s rows', { skip }, () => {
  for (const t of TABLES) {
    assert.equal(ok(GOOD, `SELECT count(*) FROM ${t};`), '1', `${t}: one row, its own org's`);
    assert.equal(ok(GOOD, `SELECT count(*) FROM ${t} WHERE org_id = '${OTHER}';`), '0', `${t}: none of the other org's`);
  }
  assert.equal(ok(GOOD, 'SELECT licence_key_last4 FROM licence_keys;'), 'AB12');
});

test('with no claims, a wrong cap or a wrong role it reads nothing', { skip }, () => {
  const wrong = [undefined, { ...GOOD, cap: 'write' }, { ...GOOD, cap: 'refund_request' }, { ...GOOD, role: 'authenticated' },
    { role: 'gsam_bridge', cap: 'read' }, { ...GOOD, org: '' }];
  for (const claims of wrong) for (const t of TABLES) {
    assert.equal(ok(claims, `SELECT count(*) FROM ${t};`), '0', `${t} with ${JSON.stringify(claims)}`);
  }
});

test('it can write nothing on any table it reads', { skip }, () => {
  for (const t of TABLES) {
    refused(GOOD, `UPDATE ${t} SET org_id = org_id;`, /permission denied/);
    refused(GOOD, `DELETE FROM ${t};`, /permission denied/);
    refused(GOOD, `INSERT INTO ${t} (org_id) VALUES ('${ORG}');`, /permission denied/);
  }
  refused(GOOD, 'TRUNCATE customers;', /permission denied/);
});

test('it cannot read staff, tokens, approvers, the audit log, its own audit and nonces, or organisations', { skip }, () => {
  for (const t of ['users', 'mcp_tokens', 'portal_approvers', 'audit_log', 'admin_bridge_audit', 'admin_bridge_nonce', 'organisations']) {
    refused(GOOD, `SELECT count(*) FROM ${t};`, /permission denied/);
  }
  refused(GOOD, `INSERT INTO admin_bridge_audit (kid, capability, actor_type, actor_id, method, path, nonce)
    VALUES ('k', 'read', 'agent', 'x', 'GET', '/', 'n');`, /permission denied/);
  refused(GOOD, 'DELETE FROM admin_bridge_nonce;', /permission denied/);
});

test('it cannot read the columns kept on the site', { skip }, () => {
  const hidden = { licence_keys: ['licence_key', 'download_url', 'file_path', 'metadata'], customers: ['stripe_customer_id', 'metadata'],
    orders: ['stripe_payment_intent'], service_inquiries: ['ip'], customer_users: ['auth_subject'],
    portal_documents: ['pdf_path', 'body'], portal_acceptances: ['auth_subject'], quotes: ['po_document_path', 'metadata'],
    front_door_leads: ['agents', 'chat_summary', 'pipedrive_person_id'] };
  for (const [t, cols] of Object.entries(hidden)) {
    for (const c of cols) refused(GOOD, `SELECT ${c} FROM ${t};`, /permission denied/);
    refused(GOOD, `SELECT * FROM ${t};`, /permission denied/);
  }
});

test('admin_bridge_begin claims a nonce once, checks the window, names the first org and writes the audit row', { skip }, () => {
  const k = nonce();
  assert.equal(ok(undefined, begin(k)), ORG);
  refused(undefined, begin(k), /duplicate key/);
  // the same nonce under another key is a different claim
  assert.equal(ok(undefined, begin(k).replace("'stg-read-1'", "'stg-read-2'")), ORG);
  refused(undefined, begin(nonce(), 'extract(epoch FROM now())::bigint - 61'), /outside the window/);
  refused(undefined, begin(nonce(), 'extract(epoch FROM now())::bigint + 61'), /outside the window/);
  refused(undefined, begin('short'), /nonce malformed/);
  assert.equal(owner(`SELECT actor_type || ':' || actor_id || ' ' || outcome FROM admin_bridge_audit WHERE nonce = '${k}' AND kid = 'stg-read-1';`), 'agent:ridge started');
  // a refused call leaves nothing: the window check and the nonce are in the same transaction as the audit row
  assert.equal(owner(`SELECT count(*) FROM admin_bridge_audit WHERE nonce = 'short';`), '0');
});

test('admin_bridge_finish closes only a row opened in the same transaction', { skip }, () => {
  const k = nonce();
  const out = ok(undefined, `SELECT audit_id FROM admin_bridge_begin('stg-read-1', 'read', '${k}', extract(epoch FROM now())::bigint, 'user:john', NULL, 'GET', '/api/admin/v1/orders')
    \\gset
    SELECT admin_bridge_finish(:'audit_id', 'orders', NULL, 'ok', 3);
    SELECT :'audit_id';`);
  const id = out.split('\n').pop();
  assert.equal(owner(`SELECT outcome || ' ' || row_count || ' ' || resource FROM admin_bridge_audit WHERE id = '${id}';`), 'ok 3 orders');
  // a later transaction cannot rewrite it
  refused(undefined, `SELECT admin_bridge_finish('${id}', 'orders', NULL, 'not_found', 0);`, /no open bridge audit row/);
});

test('the request roles cannot call the bridge functions', { skip }, () => {
  for (const role of ['anon', 'authenticated']) {
    const r = db.psql(`BEGIN; SET LOCAL ROLE ${role}; ${begin(nonce())} COMMIT;`);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /permission denied for function admin_bridge_begin/);
  }
});

test('the migration refuses a gsam_bridge_read role that bypasses RLS', { skip }, async () => {
  const fresh = startPostgres('admin-bridge-guard');
  try {
    await fresh.migrate('047');
    assert.equal(fresh.psql('CREATE ROLE gsam_bridge_read NOLOGIN BYPASSRLS;').status, 0);
    await assert.rejects(fresh.migrate('048'), /gsam_bridge_read must be NOLOGIN, NOBYPASSRLS/);
  } finally {
    fresh.stop();
  }
});

test('048 rolls back cleanly and applies again', { skip }, () => {
  const dir = join(MIGRATIONS, '048_gsam_bridge');
  const next = join(MIGRATIONS, '049_gsam_bridge_commerce');
  const deepDive = join(MIGRATIONS, '050_deep_dive_client');
  const activity = join(MIGRATIONS, '054_client_activity_outbox');
  // rollbacks go newest first: activity uses 050's tables and 048's read role.
  owner(readFileSync(join(activity, 'rollback.sql'), 'utf8'));
  owner(readFileSync(join(deepDive, 'rollback.sql'), 'utf8'));
  owner(readFileSync(join(next, 'rollback.sql'), 'utf8'));
  owner(readFileSync(join(dir, 'rollback.sql'), 'utf8'));
  assert.equal(owner(`SELECT count(*) FROM pg_roles WHERE rolname = 'gsam_bridge_read';`), '0');
  assert.equal(owner(`SELECT count(*) FROM pg_policies WHERE policyname = 'gsam_bridge_read';`), '0');
  owner(readFileSync(join(dir, 'migration.sql'), 'utf8'));
  owner(readFileSync(join(dir, 'migration.sql'), 'utf8'));
  owner(readFileSync(join(next, 'migration.sql'), 'utf8'));
  owner(readFileSync(join(deepDive, 'migration.sql'), 'utf8'));
  owner(readFileSync(join(activity, 'migration.sql'), 'utf8'));
  assert.equal(ok(GOOD, 'SELECT count(*) FROM customers;'), '1');
  assert.equal(ok(GOOD, 'SELECT licence_key_last4 FROM licence_keys;'), 'AB12');
});
