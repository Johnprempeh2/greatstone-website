// GSAM admin bridge, write capability under RLS (GRE-2354, migration 049_gsam_bridge_commerce). Applies
// netlify/database/migrations to a throwaway real Postgres (lib/postgres.mjs), adds rows in two organisations, then
// acts as gsam_bridge_write to prove: it does not bypass RLS; with write claims and an open audit row it changes only
// the first organisation's rows; with read claims, no claims or a wrong role it changes nothing; it cannot write a
// column outside its grant, DELETE a catalogue row, or touch users, orders, the audit, change or idempotency tables;
// every write leaves one admin_bridge_change row with before and after; an agent makes drafts and changes only drafts;
// people-only functions refuse an agent. Also: the read role's commerce reads stay inside its organisation even where
// public_read applies. Without the Postgres server binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const V = { pub: 'e0000000-0000-4000-8000-000000000001', draft: 'e0000000-0000-4000-8000-000000000002', other: 'e0000000-0000-4000-8000-000000000003' };
const OF = { pub: 'e1000000-0000-4000-8000-000000000001', draft: 'e1000000-0000-4000-8000-000000000002', other: 'e1000000-0000-4000-8000-000000000003' };
const SPEC = 'e2000000-0000-4000-8000-000000000001';
const ORDER = 'e3000000-0000-4000-8000-000000000001';
const QUOTE = 'e4000000-0000-4000-8000-000000000001';
const ASSET_OTHER = 'e5000000-0000-4000-8000-000000000003';
const SHA = 'c'.repeat(64);

let db;
let n = 0;
const nonce = () => `w${String(++n).padStart(21, '0')}`;

/**
 * Run sql in one transaction as `role`. With write: an actor, begin_write opens the audit row first and the claims
 * name it, as the site function does. claims overrides them (null: no claims). end is COMMIT or ROLLBACK.
 */
function as(sql, { role = 'gsam_bridge_write', actor = 'user:john', claims, open = true, end = 'ROLLBACK' } = {}) {
  const k = nonce();
  const opened = open && role === 'gsam_bridge_write'
    ? `SELECT audit_id FROM admin_bridge_begin_write('stg-write-1', '${k}', extract(epoch FROM now())::bigint, '${actor}', NULL, 'PATCH', '/t', '${k.replace('w', 'i')}', '${SHA}') \\gset\n`
    : "SELECT '' AS audit_id \\gset\n";
  const c = claims === undefined ? { role: 'gsam_bridge', cap: 'write', org: ORG, kid: 'stg-write-1', audit: ':AUDIT' } : claims;
  const setClaims = c === null ? ''
    : `SELECT set_config('request.jwt.claims', replace('${JSON.stringify(c)}', ':AUDIT', :'audit_id'), true) \\g /dev/null\n`;
  const r = db.psql(`BEGIN;\nSET LOCAL ROLE ${role};\n${opened}${setClaims}${sql}\n${end};\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}
function ok(sql, opts) {
  const r = as(sql, opts);
  assert.ok(r.ok, `expected success: ${r.err}`);
  return r.out;
}
function refused(sql, pattern, opts) {
  const r = as(sql, opts);
  assert.equal(r.ok, false, `expected refusal, got: ${r.out}`);
  if (pattern) assert.match(r.err, pattern);
}
const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

function seed(org, k) {
  const pub = k === 'mine' ? V.pub : V.other;
  const pubOf = k === 'mine' ? OF.pub : OF.other;
  return `
    INSERT INTO vendors (id, org_id, slug, name, status) VALUES ('${pub}', '${org}', 'v-${k}', 'Vendor ${k}', 'published');
    INSERT INTO offerings (id, org_id, type, vendor_id, slug, name, status, fulfilment)
      VALUES ('${pubOf}', '${org}', 'product', '${pub}', 'o-${k}', 'Offering ${k}', 'published', 'license');
    INSERT INTO org_settings (org_id, usd_to_gbp_display_rate) VALUES ('${org}', 1.3) ON CONFLICT (org_id) DO NOTHING;
    INSERT INTO media_assets (id, org_id, storage_key) VALUES ('${k === 'mine' ? 'e5000000-0000-4000-8000-000000000001' : ASSET_OTHER}', '${org}', 'k-${k}');`;
}

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-write-rls');
  await db.migrate('003');
  owner(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  owner(seed(ORG, 'mine') + seed(OTHER, 'other') + `
    INSERT INTO vendors (id, org_id, slug, name, status) VALUES ('${V.draft}', '${ORG}', 'v-draft', 'Draft vendor', 'draft');
    INSERT INTO offerings (id, org_id, type, vendor_id, slug, name, status, fulfilment)
      VALUES ('${OF.draft}', '${ORG}', 'product', '${V.draft}', 'o-draft', 'Draft offering', 'draft', 'license');
    INSERT INTO offering_specs (id, org_id, offering_id, label, value) VALUES ('${SPEC}', '${ORG}', '${OF.pub}', 'Spec', 'Yes');
    INSERT INTO users (org_id, email, role) VALUES ('${ORG}', 'staff@example.test', 'admin');
    INSERT INTO quotes (id, org_id, reference, contact_email, quoted_total_minor) VALUES ('${QUOTE}', '${ORG}', 'Q-1', 'b@example.test', 1200);
    INSERT INTO quote_items (org_id, quote_id, offering_name, qty, captured_price_minor) VALUES ('${ORG}', '${QUOTE}', 'Thing', 2, 500);
    INSERT INTO orders (id, org_id, reference, status, total_minor, stripe_payment_intent) VALUES ('${ORDER}', '${ORG}', 'O-1', 'pending', 1200, 'pi_1');
    INSERT INTO import_jobs (id, org_id, filename, type, status) VALUES ('e6000000-0000-4000-8000-000000000001', '${ORG}', 'a.csv', 'variants', 'validated');`);
});

after(() => db?.stop());

test('the write and refund roles cannot log in and do not bypass RLS', { skip }, () => {
  for (const role of ['gsam_bridge_write', 'gsam_bridge_refund']) {
    assert.equal(owner(`SELECT rolcanlogin || ' ' || rolbypassrls || ' ' || rolsuper || ' ' || rolcreaterole FROM pg_roles WHERE rolname = '${role}';`),
      'false false false false', role);
  }
});

test('with write claims it changes only the first organisation\'s rows', { skip }, () => {
  assert.equal(ok(`WITH u AS (UPDATE vendors SET description = 'x' RETURNING org_id) SELECT count(*) || ' ' || count(*) FILTER (WHERE org_id = '${OTHER}') FROM u;`), '2 0');
  assert.equal(ok(`WITH u AS (UPDATE offerings SET description = 'x' WHERE id = '${OF.other}' RETURNING id) SELECT count(*) FROM u;`), '0');
  refused(`INSERT INTO vendors (org_id, slug, name) VALUES ('${OTHER}', 'sneak', 'Sneak');`, /row-level security/);
  assert.equal(ok(`INSERT INTO vendors (org_id, slug, name) VALUES ('${ORG}', 'new-v', 'New') RETURNING status;`), 'draft');
});

test('with read claims, no claims, other claims or no open audit row it changes nothing', { skip }, () => {
  const wrong = [null, { role: 'gsam_bridge', cap: 'read', org: ORG }, { role: 'gsam_bridge', cap: 'refund_request', org: ORG },
    { role: 'authenticated', cap: 'write', org: ORG }, { role: 'gsam_bridge', cap: 'write', org: '' }];
  for (const claims of wrong) {
    assert.equal(ok(`WITH u AS (UPDATE vendors SET description = 'y' RETURNING id) SELECT count(*) FROM u;`, { claims }), '0', JSON.stringify(claims));
    refused(`INSERT INTO vendors (org_id, slug, name) VALUES ('${ORG}', 'nope', 'Nope');`, /row-level security|violates/, { claims });
  }
  // write claims with no begin call: the change log refuses, so no write goes unlogged
  refused(`UPDATE vendors SET description = 'z' WHERE id = '${V.draft}';`, /no open audit row/,
    { open: false, claims: { role: 'gsam_bridge', cap: 'write', org: ORG, kid: 'stg-write-1', audit: '00000000-0000-4000-8000-000000000000' } });
});

test('it cannot write a column outside its grant', { skip }, () => {
  refused(`UPDATE orders SET invoice_number = 'INV-X' WHERE id = '${ORDER}';`, /permission denied/);
  refused(`UPDATE orders SET stripe_payment_intent = 'pi_x' WHERE id = '${ORDER}';`, /permission denied/);
  refused(`UPDATE vendors SET status = 'published' WHERE id = '${V.draft}';`, /permission denied/);
  refused(`UPDATE offerings SET published_at = now() WHERE id = '${OF.draft}';`, /permission denied/);
  refused(`UPDATE offerings SET created_by = NULL WHERE id = '${OF.draft}';`, /permission denied/);
  refused(`UPDATE vendors SET org_id = '${OTHER}' WHERE id = '${V.draft}';`, /permission denied/);
  refused(`INSERT INTO vendors (org_id, slug, name, status) VALUES ('${ORG}', 's', 'S', 'published');`, /permission denied/);
  refused(`UPDATE org_settings SET usd_to_gbp_display_rate = 2;`, /permission denied/);
  refused(`UPDATE quotes SET assigned_to = NULL WHERE id = '${QUOTE}';`, /permission denied/);
  refused(`SELECT stripe_payment_intent FROM orders;`, /permission denied/);
  refused(`SELECT search_tsv FROM offerings;`, /permission denied/);
});

test('it cannot DELETE a catalogue row; it may delete the child rows that have no deleted_at', { skip }, () => {
  for (const t of ['offerings', 'vendors', 'categories', 'pricing_rules', 'offering_variants', 'quotes', 'import_jobs']) {
    refused(`DELETE FROM ${t};`, /permission denied/);
  }
  assert.equal(ok(`WITH d AS (DELETE FROM offering_specs WHERE id = '${SPEC}' RETURNING id) SELECT count(*) FROM d;`), '1');
});

test('it cannot touch users, orders or order items directly, nor the audit, change, idempotency or nonce tables', { skip }, () => {
  refused('SELECT count(*) FROM users;', /permission denied/);
  refused(`UPDATE orders SET po_reference = 'x';`, /permission denied/);
  refused(`INSERT INTO orders (org_id, reference) VALUES ('${ORG}', 'O-X');`, /permission denied/);
  refused(`INSERT INTO order_items (org_id, order_id, offering_name, unit_price_minor, line_total_minor) VALUES ('${ORG}', '${ORDER}', 'x', 1, 1);`, /permission denied/);
  for (const t of ['admin_bridge_audit', 'admin_bridge_change', 'admin_bridge_idempotency', 'admin_bridge_nonce', 'refund_requests']) {
    refused(`SELECT count(*) FROM ${t};`, /permission denied/);
    refused(`DELETE FROM ${t};`, /permission denied/);
  }
  // no bridge role has any grant on the idempotency or change tables
  assert.equal(owner(`SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_name IN ('admin_bridge_idempotency', 'admin_bridge_change') AND grantee LIKE 'gsam_bridge%';`), '0');
  assert.equal(owner(`SELECT count(*) FROM information_schema.column_privileges
    WHERE table_name IN ('admin_bridge_idempotency', 'admin_bridge_change') AND grantee LIKE 'gsam_bridge%';`), '0');
  for (const role of ['gsam_bridge_read', 'gsam_bridge_refund']) {
    refused('SELECT count(*) FROM admin_bridge_idempotency;', /permission denied/, { role, claims: null });
    refused('SELECT count(*) FROM admin_bridge_change;', /permission denied/, { role, claims: null });
  }
});

test('every write leaves one admin_bridge_change row with before and after, under the audit row that names the actor', { skip }, () => {
  const out = ok(`UPDATE vendors SET name = 'Renamed' WHERE id = '${V.draft}';
    SELECT :'audit_id';`, { actor: 'agent:ridge', end: 'COMMIT' });
  const audit = out.split('\n').pop();
  assert.equal(owner(`SELECT count(*) || ' ' || min(table_name) || ' ' || min(op) || ' ' || min(before ->> 'name') || ' > ' || min(after ->> 'name')
    FROM admin_bridge_change WHERE audit_id = '${audit}';`), '1 vendors update Draft vendor > Renamed');
  assert.equal(owner(`SELECT actor_type || ':' || actor_id FROM admin_bridge_audit WHERE id = '${audit}';`), 'agent:ridge');
  assert.equal(owner(`SELECT count(*) FROM admin_bridge_change WHERE audit_id = '${audit}' AND after ? 'search_tsv';`), '0');
  // a write the bridge functions make is logged the same way
  const fx = ok(`SELECT bridge_set_fx(1.25, (SELECT row_version FROM org_settings));
    SELECT :'audit_id';`, { end: 'COMMIT' });
  assert.equal(owner(`SELECT count(*) || ' ' || min(before ->> 'usd_to_gbp_display_rate') || ' > ' || min(after ->> 'usd_to_gbp_display_rate')
    FROM admin_bridge_change WHERE audit_id = '${fx.split('\n').pop()}' AND table_name = 'org_settings';`), '1 1.300000 > 1.250000');
  // staff writes are not bridge writes
  const before = owner('SELECT count(*) FROM admin_bridge_change;');
  owner(`UPDATE vendors SET name = 'Staff edit' WHERE id = '${V.draft}';`);
  assert.equal(owner('SELECT count(*) FROM admin_bridge_change;'), before);
});

test('an agent makes drafts and changes only drafts, and child rows only of a draft', { skip }, () => {
  const agent = { actor: 'agent:ridge' };
  assert.equal(ok(`INSERT INTO vendors (org_id, slug, name) VALUES ('${ORG}', 'agent-v', 'Agent') RETURNING status;`, agent), 'draft');
  assert.equal(ok(`INSERT INTO categories (org_id, slug, name) VALUES ('${ORG}', 'agent-c', 'Agent') RETURNING status;`, agent), 'draft');
  ok(`UPDATE vendors SET description = 'ok' WHERE id = '${V.draft}';`, agent);
  refused(`UPDATE vendors SET description = 'no' WHERE id = '${V.pub}';`, /only a person may change a vendors row/, agent);
  refused(`UPDATE offerings SET deleted_at = now() WHERE id = '${OF.pub}';`, /only a person/, agent);
  refused(`INSERT INTO offering_variants (org_id, offering_id, name) VALUES ('${ORG}', '${OF.pub}', 'V');`, /only a person may change offering_variants/, agent);
  refused(`DELETE FROM offering_specs WHERE id = '${SPEC}';`, /only a person/, agent);
  ok(`INSERT INTO offering_variants (org_id, offering_id, name) VALUES ('${ORG}', '${OF.draft}', 'V');`, agent);
  // a person may change a published row (the status still goes only through publish and archive)
  ok(`UPDATE vendors SET description = 'person' WHERE id = '${V.pub}';`);
  ok(`INSERT INTO offering_variants (org_id, offering_id, name) VALUES ('${ORG}', '${OF.pub}', 'V');`);
});

test('a reference to another organisation\'s row is refused', { skip }, () => {
  refused(`INSERT INTO offerings (org_id, type, vendor_id, slug, name) VALUES ('${ORG}', 'product', '${V.other}', 'x', 'X');`, /vendor_id is not a live row/);
  refused(`INSERT INTO offering_media (org_id, offering_id, asset_id) VALUES ('${ORG}', '${OF.draft}', '${ASSET_OTHER}');`, /asset_id is not a live row/);
  refused(`INSERT INTO offering_variants (org_id, offering_id, name) VALUES ('${ORG}', '${OF.other}', 'V');`, /offering_id is not a live row/);
  ok(`INSERT INTO offering_media (org_id, offering_id, asset_id) VALUES ('${ORG}', '${OF.draft}', 'e5000000-0000-4000-8000-000000000001');`);
});

test('people-only functions refuse an agent, and run for a person', { skip }, () => {
  const agent = { actor: 'agent:ridge' };
  refused(`SELECT bridge_set_status('vendors', '${V.draft}', 'published', 1);`, /people only/, agent);
  refused('SELECT bridge_set_fx(1.2, 1);', /people only/, agent);
  refused(`SELECT bridge_issue_invoice('${ORDER}', 1);`, /people only/, agent);
  refused(`SELECT bridge_import_apply('e6000000-0000-4000-8000-000000000001');`, /people only/, agent);
  refused(`SELECT bridge_set_status('vendors', '${V.draft}', 'published', 1);`, /people only/, { actor: 'system:pull' });
  assert.equal(ok(`SELECT bridge_set_status('vendors', '${V.draft}', 'published', (SELECT row_version FROM vendors WHERE id = '${V.draft}'));
    SELECT status FROM vendors WHERE id = '${V.draft}';`).split('\n').pop(), 'published');
  refused(`SELECT bridge_set_status('vendors', '${V.draft}', 'published', 999);`, /row version/);
  refused(`SELECT bridge_set_status('users', '${V.draft}', 'published', 1);`, /table/);
  // with no open audit row there is no actor and no org
  refused(`SELECT bridge_convert_quote('${QUOTE}');`, /no open bridge audit row/, { open: false });
});

test('quote to invoice: an agent drafts, a person issues', { skip }, () => {
  const agent = { actor: 'agent:ridge', end: 'COMMIT' };
  const order = ok(`SELECT bridge_convert_quote('${QUOTE}');`, agent);
  assert.equal(owner(`SELECT status || ' ' || coalesce(invoice_number, '-') || ' ' || coalesce(placed_at::text, '-') || ' ' || total_minor FROM orders WHERE id = '${order}';`), 'pending - - 1200');
  refused(`SELECT bridge_convert_quote('${QUOTE}');`, /already converted/, agent);
  ok(`SELECT bridge_edit_draft_invoice('${order}', 1, '{"po_reference":"PO-7","lines":[{"offering_name":"Thing","qty":3,"unit_price_minor":500}]}');`, agent);
  assert.equal(owner(`SELECT po_reference || ' ' || subtotal_minor || ' ' || total_minor || ' ' || row_version FROM orders WHERE id = '${order}';`), 'PO-7 1500 1800 2');
  refused(`SELECT bridge_edit_draft_invoice('${order}', 1, '{"po_reference":"PO-8"}');`, /row version/, agent);
  ok(`SELECT bridge_issue_invoice('${order}', 2);`, { end: 'COMMIT' });
  assert.match(owner(`SELECT status || ' ' || invoice_number FROM orders WHERE id = '${order}';`), /^confirmed INV-\d{4}-\d{5}$/);
  refused(`SELECT bridge_edit_draft_invoice('${order}', 3, '{"po_reference":"PO-9"}');`, /only a pending invoice draft/, agent);
  refused(`SELECT bridge_issue_invoice('${order}', 3);`, /already issued/);
});

test('an import is a dry run the write role makes, and a person applies', { skip }, () => {
  refused(`INSERT INTO import_jobs (org_id, filename, type, status, dry_run) VALUES ('${ORG}', 'b.csv', 'variants', 'applied', true);`, /dry-run imports only/);
  refused(`INSERT INTO import_jobs (org_id, filename, type, status, dry_run) VALUES ('${ORG}', 'b.csv', 'variants', 'validated', false);`, /dry-run imports only/);
  refused(`INSERT INTO import_job_rows (org_id, job_id, row_number, raw) VALUES ('${ORG}', 'e6000000-0000-4000-8000-000000000001', 9, '{}');`, /made in this transaction/);
  const job = ok(`INSERT INTO import_jobs (org_id, filename, type, status) VALUES ('${ORG}', 'c.csv', 'variants', 'validated') RETURNING id \\gset
    INSERT INTO import_job_rows (org_id, job_id, row_number, raw, mapped, action)
      VALUES ('${ORG}', :'id', 1, '{}', '{"offeringSlug":"o-mine","sku":"SKU-NEW","variant":{"name":"Site","base_price_minor":"900"}}', 'insert');
    SELECT :'id';`, { actor: 'agent:ridge', end: 'COMMIT' });
  ok(`SELECT bridge_import_apply('${job}');`, { end: 'COMMIT' });
  assert.equal(owner(`SELECT status || ' ' || dry_run FROM import_jobs WHERE id = '${job}';`), 'applied false');
  assert.equal(owner(`SELECT name || ' ' || base_price_minor FROM offering_variants WHERE sku = 'SKU-NEW';`), 'Site 900');
  refused(`SELECT bridge_import_apply('${job}');`, /only a validated import/);
});

test('the read role reads commerce rows only of its organisation, even where public_read applies', { skip }, () => {
  const read = { role: 'gsam_bridge_read', claims: { role: 'gsam_bridge', cap: 'read', org: ORG } };
  for (const t of ['vendors', 'offerings', 'org_settings', 'media_assets']) {
    if (t === 'media_assets') { refused(`SELECT count(*) FROM ${t};`, /permission denied/, read); continue; }
    assert.equal(ok(`SELECT count(*) FROM ${t} WHERE org_id = '${OTHER}';`, read), '0', t);
    assert.equal(ok(`SELECT count(*) FROM ${t};`, { role: 'gsam_bridge_read', claims: null }), '0', `${t} with no claims`);
  }
  assert.ok(Number(ok('SELECT count(*) FROM vendors;', read)) >= 2);
  // org_isolation reads app.current_org; the bridge scope holds against it too
  assert.equal(ok(`SET LOCAL app.current_org = '${OTHER}'; SELECT count(*) FROM vendors WHERE org_id = '${OTHER}';`, read), '0');
  assert.equal(ok(`SET LOCAL app.current_org = '${OTHER}'; SELECT count(*) FROM vendors WHERE org_id = '${OTHER}';`), '0');
  refused('SELECT changed_by FROM fx_rate_history;', /permission denied/, read);
  refused('SELECT rollback_token FROM import_jobs;', /permission denied/, read);
  refused('SELECT raw FROM import_job_rows;', /permission denied/, read);
  refused('SELECT created_by FROM offerings;', /permission denied/, read);
  assert.equal(ok(`SELECT paid_by_stripe FROM orders WHERE id = '${ORDER}';`, read), 't');
});

test('the read role can no longer open an audit row in another capability\'s name', { skip }, () => {
  refused(`SELECT * FROM admin_bridge_begin('stg-read-1', 'write', '${nonce()}', extract(epoch FROM now())::bigint, 'agent:x', NULL, 'GET', '/');`,
    /read calls only/, { role: 'gsam_bridge_read', claims: null });
  for (const fn of ['admin_bridge_begin_write', 'admin_bridge_begin_refund']) {
    refused(`SELECT * FROM ${fn}('k', '${nonce()}', extract(epoch FROM now())::bigint, 'agent:x', NULL, 'POST', '/', '${'a'.repeat(22)}', '${SHA}');`,
      /permission denied for function/, { role: 'gsam_bridge_read', claims: null });
  }
  refused(`SELECT * FROM admin_bridge_begin_refund('k', '${nonce()}', extract(epoch FROM now())::bigint, 'agent:x', NULL, 'POST', '/', '${'a'.repeat(22)}', '${SHA}');`,
    /permission denied for function/, { open: false, claims: null });
});

test('the migration refuses a gsam_bridge_write role that bypasses RLS', { skip }, async () => {
  const fresh = startPostgres('admin-bridge-write-guard');
  try {
    await fresh.migrate('048');
    assert.equal(fresh.psql('CREATE ROLE gsam_bridge_write NOLOGIN BYPASSRLS;').status, 0);
    await assert.rejects(fresh.migrate('049'), /gsam_bridge_write must be NOLOGIN, NOBYPASSRLS/);
  } finally {
    fresh.stop();
  }
});
