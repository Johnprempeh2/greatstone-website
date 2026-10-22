// Migration 001_enquiry_inbox (GRE-1794) on a local Netlify Database (@netlify/database-dev, no Postgres install
// needed). The Netlify version of supabase/tests/enquiry-size-band.test.mjs: the size band saves and an over-long
// one is refused, RLS is forced, `anon` can insert a contact enquiry but cannot read, change or delete one, the
// role and claims end with each transaction, and the rollback removes the table so the migration applies again.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NetlifyDB } from '@netlify/database-dev';
import pg from 'pg';
import { asAnon, enquiryStore } from '../functions/lib/enquiry-store.mjs';

const MIGRATIONS = fileURLToPath(new URL('../database/migrations', import.meta.url));
const UP = readFileSync(new URL('../database/migrations/001_enquiry_inbox/migration.sql', import.meta.url), 'utf8');
const DOWN = readFileSync(new URL('../database/migrations/001_enquiry_inbox/rollback.sql', import.meta.url), 'utf8');

let local, pool;
before(async () => {
  local = new NetlifyDB({ logger: () => {} });
  const url = await local.start();
  // 001 only: PGlite has no citext or pg_trgm, which 002 on need. enquiry-size-band.test.mjs runs the enquiry
  // store on every migration, on a real Postgres.
  assert.deepEqual(await local.applyMigrations(MIGRATIONS, '001_enquiry_inbox'), ['001_enquiry_inbox']);
  pool = new pg.Pool({ connectionString: url, max: 1 });
});
after(async () => { await pool?.end(); await local?.stop(); });

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
// a statement as `anon`, rolled back; resolves to the Postgres error, or null when it was allowed
async function asAnonError(sql, params) {
  try { await asAnon(pool, (c) => c.query(sql, params)); return null; } catch (e) { return e; }
}
const ROW = { services: [], contact_name: 'Test', contact_email: 'a@example.test', contact_company: null, message: null, size_band: '11 to 50', industry: null, attribution: {}, source: 'contact', ip: '203.0.113.1' };

test('anon saves an enquiry with its size band; an over-long band is refused', async () => {
  const store = enquiryStore(pool);
  const saved = await store.saveRow(ROW);
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  const row = await one('SELECT size_band, source, status, org_id, alert_sent_at FROM service_inquiries WHERE id = $1', [saved.id]);
  assert.deepEqual(row, { size_band: '11 to 50', source: 'contact', status: 'new', org_id: null, alert_sent_at: null });
  const logs = [];
  assert.equal(await enquiryStore(pool, { log: (l, m) => logs.push(m) }).saveRow({ ...ROW, size_band: 'x'.repeat(41) }), null);
  assert.match(logs[0], /not saved \(23514\)/);
  await assert.rejects(pool.query("INSERT INTO service_inquiries (contact_email, size_band) VALUES ('b@example.test', $1)", ['x'.repeat(41)]), /chk_inquiry_size_band/);
});

test('anon cannot read enquiries, nor change or delete them', async () => {
  for (const sql of ['SELECT * FROM service_inquiries', 'SELECT count(*) FROM service_inquiries', "UPDATE service_inquiries SET status = 'closed'", 'DELETE FROM service_inquiries', 'SELECT purge_inquiry_ips()']) {
    const e = await asAnonError(sql);
    assert.equal(e && e.code, '42501', sql);
  }
  const ret = await asAnonError("INSERT INTO service_inquiries (id, contact_email, source) VALUES (gen_random_uuid(), 'a@b.co', 'contact') RETURNING contact_email");
  assert.equal(ret && ret.code, '42501', 'no reading back through RETURNING');
  const grants = await one(`SELECT has_table_privilege('anon', 'service_inquiries', 'SELECT') AS sel, has_table_privilege('anon', 'service_inquiries', 'UPDATE') AS upd,
    has_table_privilege('anon', 'service_inquiries', 'DELETE') AS del, has_column_privilege('anon', 'service_inquiries', 'org_id', 'INSERT') AS org,
    has_column_privilege('anon', 'service_inquiries', 'status', 'INSERT') AS status, has_column_privilege('anon', 'service_inquiries', 'alert_sent_at', 'INSERT') AS alerted`);
  assert.deepEqual(grants, { sel: false, upd: false, del: false, org: false, status: false, alerted: false });
});

test('anon inserts only a contact enquiry (RLS checks the row)', async () => {
  const e = await asAnonError("INSERT INTO service_inquiries (id, contact_email, source) VALUES (gen_random_uuid(), 'a@b.co', 'web')");
  assert.match(e.message, /row-level security/);
  const e2 = await asAnonError(`INSERT INTO service_inquiries (id, contact_email, source, services) VALUES (gen_random_uuid(), 'a@b.co', 'contact', '[{"slug":"x"}]')`);
  assert.match(e2.message, /row-level security/);
});

test('RLS is on and forced, with the two policies only', async () => {
  const r = await one(`SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'service_inquiries'`);
  assert.deepEqual(r, { rls: true, forced: true });
  const p = await one(`SELECT string_agg(policyname || ':' || array_to_string(roles, ','), ' ' ORDER BY policyname) AS p FROM pg_policies WHERE tablename = 'service_inquiries'`);
  assert.match(p.p, /^anon_contact_insert:anon owner_definer:\w+$/);
});

test('the role and the claims end with the transaction (nothing leaks to the next request)', async () => {
  const inside = await asAnon(pool, async (c) => (await c.query("SELECT current_user AS who, current_setting('request.jwt.claims', true) AS claims")).rows[0]);
  assert.deepEqual(inside, { who: 'anon', claims: '{"role":"anon"}' });
  const afterwards = await one("SELECT current_user AS who, coalesce(current_setting('request.jwt.claims', true), '') AS claims");
  assert.notEqual(afterwards.who, 'anon');
  assert.equal(afterwards.claims, '');
  // and after a failed transaction too
  assert.ok(await asAnonError('SELECT * FROM service_inquiries'));
  assert.notEqual((await one('SELECT current_user AS who')).who, 'anon');
});

test('the per-IP count and "alert sent" are the only other things anon can do', async () => {
  const store = enquiryStore(pool);
  const before = await store.countRecent('198.51.100.7');
  const { id } = await store.saveRow({ ...ROW, ip: '198.51.100.7' });
  assert.equal(await store.countRecent('198.51.100.7'), before + 1);
  await store.markAlerted(id);
  const first = (await one('SELECT alert_sent_at FROM service_inquiries WHERE id = $1', [id])).alert_sent_at;
  assert.ok(first);
  assert.equal((await asAnon(pool, (c) => c.query('SELECT enquiry_mark_alerted($1) AS m', [id]))).rows[0].m, false, 'only once');
  assert.equal(await store.countRecent(null), 0);
});

test('an IP older than 30 days is cleared on the next insert (0036)', async () => {
  const { id } = await one(`INSERT INTO service_inquiries (contact_email, source, ip, created_at) VALUES ('old@example.test', 'contact', '192.0.2.9', now() - interval '31 days') RETURNING id`);
  await enquiryStore(pool).saveRow(ROW);
  assert.equal((await one('SELECT ip FROM service_inquiries WHERE id = $1', [id])).ip, null);
});

test('rollback removes the table; the migration applies again', async () => {
  await pool.query(DOWN);
  assert.equal((await one("SELECT to_regclass('service_inquiries') AS t")).t, null);
  await pool.query(UP);
  assert.equal((await one('SELECT count(*)::int AS n FROM service_inquiries')).n, 0);
  assert.ok(await enquiryStore(pool).saveRow(ROW));
});
