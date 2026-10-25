// The enquiry inbox on every migration (GRE-1795; was supabase/tests/enquiry-size-band.test.mjs for Supabase 0040).
// Applies netlify/database/migrations to an empty real Postgres, the way a fresh Netlify Database gets them (no
// organisation row yet), then proves: the contact form still saves as `anon` after 025 (the port of Supabase 0023
// must not take its grant away), the size band saves and an over-long one is refused, org_id is filled once the
// organisation exists, staff see their org's enquiries, the services-basket rpc still works, and 042's rollback
// leaves the column (and anon's grant on it). Real Postgres harness: lib/postgres.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import pg from 'pg';
import { startPostgres, skip, MIGRATIONS } from './lib/postgres.mjs';
import { enquiryStore } from '../functions/lib/enquiry-store.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const STAFF = { sub: '00000000-0000-4000-8000-000000000002', email: 'editor@example.test' };
const ROW = { services: [], contact_name: 'Test', contact_email: 'a@example.test', contact_company: null, message: null, size_band: '11 to 50', industry: null, attribution: {}, source: 'contact', ip: '203.0.113.1' };

let db;
let pool;
const file = (p) => `\\i '${p.replace(/'/g, "''")}'\n`;
function ok(sql) {
  const r = db.psql(sql);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function refused(sql, pattern) {
  const r = db.psql(sql);
  assert.notEqual(r.status, 0, `expected refusal, got: ${r.stdout}`);
  if (pattern) assert.match(r.stderr, pattern);
}
const asStaff = (sql) => ok(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${JSON.stringify(STAFF)}', true) \\g /dev/null\n${sql}\nCOMMIT;`);
const hasColumn = `SELECT count(*) FROM information_schema.columns WHERE table_name = 'service_inquiries' AND column_name = 'size_band';`;
const rlsState = `SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE relname = 'service_inquiries';
  SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE tablename = 'service_inquiries';
  SELECT has_table_privilege('anon', 'service_inquiries', 'SELECT')::text;
  SELECT has_column_privilege('anon', 'service_inquiries', 'size_band', 'INSERT')::text;`;
// 048 adds gsam_bridge_read: the GSAM admin bridge reads the org's enquiries (GRE-2323); 049 adds its restrictive
// gsam_bridge_read_scope, which keeps those reads to the bridge's organisation (GRE-2354)
const RLS_AS_BUILT = 'truetrue\nanon_contact_insert,gsam_bridge_read,gsam_bridge_read_scope,owner_definer,staff_all\nfalse\ntrue';

before(async () => {
  if (skip) return;
  db = startPostgres('enquiry');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
});
after(async () => {
  await pool?.end();
  db?.stop();
});

test('on a fresh database the contact form saves as anon, with its size band; an over-long band is refused', { skip }, async () => {
  const saved = await enquiryStore(pool).saveRow(ROW);
  assert.ok(saved, 'anon still holds the INSERT grant after 025');
  assert.equal(ok(`SELECT size_band || ':' || coalesce(org_id::text, 'none') FROM service_inquiries WHERE id = '${saved.id}';`), '11 to 50:none');
  const logs = [];
  assert.equal(await enquiryStore(pool, { log: (l, m) => logs.push(m) }).saveRow({ ...ROW, size_band: 'x'.repeat(41) }), null);
  assert.match(logs[0], /not saved \(23514\)/);
  refused(`INSERT INTO service_inquiries (contact_email, size_band) VALUES ('c@example.test', '${'x'.repeat(41)}');`, /chk_inquiry_size_band/);
});

test('enquiries saved before the organisation existed get it when it arrives; later ones get it on insert', { skip }, async () => {
  assert.equal(ok(`SELECT count(*) FROM service_inquiries WHERE org_id IS NULL;`), '1');
  ok(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  assert.equal(ok(`SELECT count(*) FROM service_inquiries WHERE org_id IS DISTINCT FROM '${ORG}';`), '0');
  const { id } = await enquiryStore(pool).saveRow({ ...ROW, contact_email: 'b@example.test', size_band: null });
  assert.equal(ok(`SELECT org_id FROM service_inquiries WHERE id = '${id}';`), ORG);
  refused(`INSERT INTO service_inquiries (org_id, contact_email) VALUES (gen_random_uuid(), 'x@example.test');`, /service_inquiries_org_id_fkey/);
});

test('staff read and update their org\'s enquiries; anon reads none', { skip }, () => {
  ok(`INSERT INTO users (org_id, email, full_name, role, auth_subject) VALUES ('${ORG}', '${STAFF.email}', 'Test Editor', 'editor', '${STAFF.sub}');`);
  assert.equal(asStaff(`SELECT count(*) FROM service_inquiries;`), '2');
  assert.equal(asStaff(`UPDATE service_inquiries SET status = 'contacted' WHERE contact_email = 'b@example.test' RETURNING status;`), 'contacted');
  refused(`BEGIN; SET LOCAL ROLE authenticated; DELETE FROM service_inquiries; COMMIT;`, /permission denied/);
  refused(`BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM service_inquiries; COMMIT;`, /permission denied/);
  assert.equal(ok(rlsState), RLS_AS_BUILT);
});

test('the services-basket rpc still works for a visitor, and leaves the band empty', { skip }, () => {
  ok(`BEGIN; SET LOCAL ROLE anon; SELECT submit_service_inquiry('[{"slug":"x"}]'::jsonb, 'Test', 'd@example.test') \\g /dev/null\nCOMMIT;`);
  assert.equal(ok(`SELECT count(*) FROM service_inquiries WHERE contact_email = 'd@example.test' AND size_band IS NULL AND org_id = '${ORG}';`), '1');
});

test('042 rollback leaves the column and anon\'s grant on it; 042 applies again, twice', { skip }, async () => {
  ok(`BEGIN;\n${file(join(MIGRATIONS, '042_service_inquiry_size_band/rollback.sql'))}COMMIT;`);
  assert.equal(ok(hasColumn), '1');
  assert.equal(ok(rlsState), RLS_AS_BUILT);
  const up = join(MIGRATIONS, '042_service_inquiry_size_band/migration.sql');
  ok(file(up) + file(up));
  assert.equal(ok(rlsState), RLS_AS_BUILT);
  assert.ok(await enquiryStore(pool).saveRow({ ...ROW, contact_email: 'e@example.test' }));
});
