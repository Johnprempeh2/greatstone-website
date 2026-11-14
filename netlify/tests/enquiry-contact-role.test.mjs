// 075_service_inquiry_contact_role on a real Postgres (GRE-5194): the contact form saves the role as `anon`, the
// check refuses any other value, null still saves, the KPI filter (GRE-3580) reads it, and the rollback drops the
// column, after which 075 applies again, twice. Real Postgres harness: lib/postgres.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import pg from 'pg';
import { startPostgres, skip, MIGRATIONS } from './lib/postgres.mjs';
import { enquiryStore } from '../functions/lib/enquiry-store.mjs';

const ROW = { services: [], contact_name: 'Test', contact_email: 'a@example.test', contact_company: 'Test Co', message: null, size_band: null, contact_role: 'owner_director', industry: null, attribution: {}, source: 'contact', ip: '203.0.113.1' };
const DIR = join(MIGRATIONS, '075_service_inquiry_contact_role');

let db;
let pool;
const file = (p) => `\\i '${p.replace(/'/g, "''")}'\n`;
function ok(sql) {
  const r = db.psql(sql);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const state = `SELECT count(*) FROM information_schema.columns WHERE table_name = 'service_inquiries' AND column_name = 'contact_role';
  SELECT count(*) FROM pg_constraint WHERE conname = 'chk_inquiry_contact_role';`;

before(async () => {
  if (skip) return;
  db = startPostgres('contact-role');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
});
after(async () => {
  await pool?.end();
  db?.stop();
});

test('anon saves each role and no role; any other value is refused by the check', { skip }, async () => {
  for (const [i, role] of ['owner_director', 'manager', 'other', null].entries()) {
    assert.ok(await enquiryStore(pool).saveRow({ ...ROW, contact_email: `r${i}@example.test`, contact_role: role }), String(role));
  }
  const logs = [];
  assert.equal(await enquiryStore(pool, { log: (l, m) => logs.push(m) }).saveRow({ ...ROW, contact_role: 'ceo' }), null);
  assert.match(logs[0], /not saved \(23514\)/);
  assert.equal(ok(`SELECT string_agg(coalesce(contact_role, 'null'), ',' ORDER BY contact_email) FROM service_inquiries;`), 'owner_director,manager,other,null');
  // the GRE-3580 reading's buyer-authority filter
  assert.equal(ok(`SELECT count(*) FROM service_inquiries WHERE contact_role in ('owner_director', 'manager');`), '2');
});

test('075 rollback drops the column and its check; 075 applies again, twice, and anon can save the role again', { skip }, async () => {
  assert.equal(ok(state), '1\n1');
  ok(`BEGIN;\n${file(join(DIR, 'rollback.sql'))}COMMIT;`);
  assert.equal(ok(state), '0\n0');
  assert.equal(ok(`SELECT count(*) FROM service_inquiries;`), '4', 'the rows stay');
  const up = join(DIR, 'migration.sql');
  ok(file(up) + file(up));
  assert.equal(ok(state), '1\n1');
  assert.ok(await enquiryStore(pool).saveRow({ ...ROW, contact_email: 'again@example.test', contact_role: 'manager' }));
});
