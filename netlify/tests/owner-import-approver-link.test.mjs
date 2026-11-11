// The GSAM link to the portal approver (GRE-3960): the owner importer's approver-link mode, on a throwaway real
// Postgres with every migration applied (lib/postgres.mjs), through the real greatstone-home allow-list entry.
// Proves: with no approver, or an approver who is not an active Greatstone owner, it refuses and writes nothing; the
// dry run rolls back, apply writes one portal_bridge_approvers row to the one approver, and
// bridge_portal_approve_and_publish then gets past its approver gate for that GSAM person only; while a link exists a
// second one is refused; the mode is refused on every other site before the pool opens; any other field is refused.
// No GSAM person or id reaches a log line or a result blob. Without the Postgres server binaries the suite is skipped.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import {
  runOwnerImport, SITES, GREATSTONE_ORG_ID, validateApproverLink,
} from '../functions/lib/owner-import.mjs';

const NOW = Date.parse('2026-11-11T22:00:00Z');
const UNTIL = new Date(NOW + 30 * 60 * 1000).toISOString();
const HOME = 'greatstone-home';
const ENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: HOME };
const context = (name) => ({ site: { name, id: SITES[name].id }, deploy: { context: 'production', published: true } });

const ORG = GREATSTONE_ORG_ID;
const JOHN_SUB = 'a0000000-0000-4000-8000-00000000000a';
const ADMIN_SUB = 'c0000000-0000-4000-8000-00000000000c';
const LINK = { gsamActor: 'user:JohnGsamPerson01', label: 'John' };

let db;
let pool;
before(async () => {
  if (skip) return;
  db = startPostgres('approver-link');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone');
    INSERT INTO auth.users (id, email) VALUES ('${JOHN_SUB}', 'john@auth.test'), ('${ADMIN_SUB}', 'admin@auth.test');
    INSERT INTO users (org_id, email, role, auth_subject, is_active) VALUES
      ('${ORG}', 'john@greatstone.test', 'owner', '${JOHN_SUB}', true),
      ('${ORG}', 'admin@greatstone.test', 'admin', '${ADMIN_SUB}', true);`);
});
after(async () => { await pool?.end(); db?.stop(); });

const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const links = () => owner('SELECT count(*) FROM portal_bridge_approvers');

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); },
  };
}
const envelope = (action, data) => ({ version: 1, mode: 'approver-link', action, notAfter: UNTIL, data });
const openPool = () => ({ connect: () => pool.connect(), end: async () => {} });
async function tick(store, { env = ENV, site = HOME, open = openPool } = {}) {
  const lines = [];
  const result = await runOwnerImport({ env, context: context(site), store, openPool: open, log: (l) => lines.push(l), now: NOW });
  return { result, lines };
}
const reason = async (data) => (await tick(memoryStore({ payload: envelope('dry-run', data) }))).result.reason;

test('with no approver, or an approver who is not an active owner, it refuses and writes nothing', { skip }, async () => {
  assert.equal(await reason(LINK), 'approver-link-no-approver');
  owner(`INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${ADMIN_SUB}', 'Admin')`);
  assert.equal(await reason(LINK), 'approver-link-not-owner');
  owner(`DELETE FROM portal_approvers; INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${JOHN_SUB}', 'John');
    UPDATE users SET is_active = false WHERE auth_subject = '${JOHN_SUB}'`);
  assert.equal(await reason(LINK), 'approver-link-not-owner');
  owner(`UPDATE users SET is_active = true WHERE auth_subject = '${JOHN_SUB}'`);
  assert.equal(links(), '0');
});

test('the mode is refused on every other site, before the pool opens', { skip }, async () => {
  for (const site of Object.keys(SITES).filter((s) => s !== HOME)) {
    const { result } = await tick(memoryStore({ payload: envelope('dry-run', LINK) }), {
      env: { ...ENV, OWNER_IMPORT_SITE: site }, site, open: () => { throw new Error('opened the owner pool'); },
    });
    assert.equal(result.reason, 'mode-not-allowed', site);
  }
});

test('dry run rolls back; apply links the GSAM person to the approver once; the publish gate lets that person in', { skip }, async () => {
  const store = memoryStore();
  await store.setJSON('payload', envelope('apply', LINK));
  assert.equal((await tick(store)).result.reason, 'dry-run-required');

  await store.setJSON('payload', envelope('dry-run', LINK));
  const dry = await tick(store);
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  assert.deepEqual(dry.result.counts, { approverLink: { before: 0, inserted: 1, after: 1 } });
  assert.equal(links(), '0', 'the dry run kept its row');

  await store.setJSON('payload', envelope('apply', LINK));
  const applied = await tick(store);
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.equal(owner('SELECT gsam_actor || \' \' || auth_user_id || \' \' || label FROM portal_bridge_approvers'),
    `${LINK.gsamActor} ${JOHN_SUB} John`);

  // bridge_portal_approve_and_publish's approver lookup, as 067 writes it
  const gate = (actor) => owner(`SELECT count(*) FROM portal_bridge_approvers b JOIN portal_approvers r ON r.auth_user_id = b.auth_user_id
     WHERE b.gsam_actor = '${actor}' AND EXISTS (SELECT 1 FROM users u WHERE u.auth_subject = b.auth_user_id::text
       AND u.org_id = '${ORG}' AND u.is_active AND u.deleted_at IS NULL)`);
  assert.equal(gate(LINK.gsamActor), '1');
  assert.equal(gate('user:someoneElse'), '0');

  const blob = JSON.stringify([...store.map.values(), dry.lines, applied.lines]);
  for (const v of [LINK.gsamActor, JOHN_SUB]) assert.equal(blob.includes(v), false, 'a person or id reached a result or log');
});

test('while a link exists, another is refused', { skip }, async () => {
  assert.equal(links(), '1', 'runs after the apply test');
  assert.equal(await reason({ ...LINK, gsamActor: 'user:someoneElse' }), 'approver-link-exists');
  assert.equal(links(), '1');
});

test('a payload with any other field or a bad value is refused', { skip }, async () => {
  const cases = [
    [[LINK], 'approver-link-shape'],
    [{ ...LINK, authUserId: JOHN_SUB }, 'approver-link-fields'],
    [{ gsamActor: LINK.gsamActor }, 'approver-link-fields'],
    [{ ...LINK, gsamActor: 'agent:lintel' }, 'approver-link-actor'],
    [{ ...LINK, gsamActor: "user:x' OR 1=1" }, 'approver-link-actor'],
    [{ ...LINK, label: ' ' }, 'approver-link-label'],
  ];
  for (const [data, why] of cases) assert.equal(await reason(data), why, JSON.stringify(data));
});

test('only greatstone-home allows the mode; the validator is pure', () => {
  for (const [name, site] of Object.entries(SITES)) assert.equal(site.modes.includes('approver-link'), name === HOME, name);
  assert.equal(validateApproverLink(LINK), LINK);
  assert.throws(() => validateApproverLink(null), /approver-link-shape/);
});
