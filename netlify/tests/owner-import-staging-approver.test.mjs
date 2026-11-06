// The staging bridge approver (GRE-4081): the owner importer's staging-approver mode, on a throwaway real Postgres
// with every migration applied (lib/postgres.mjs), through the real gre3833 allow-list entry.
// Proves: the dry run rolls back; apply writes the fixed fake sign-in, an active owner of the Greatstone org signed in
// as it, that sign-in as portal approver and the 067 link from the GSAM person, and the link passes the join
// bridge_portal_approve_and_publish makes; a second run is refused while any approver or link exists; a payload with
// any other field or an agent actor is refused; the mode is refused on every other site without opening the pool.
// Without the Postgres server binaries the database tests are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import {
  runOwnerImport, SITES, GREATSTONE_ORG_ID, STAGING_APPROVER, validateStagingApprover,
} from '../functions/lib/owner-import.mjs';

const NOW = Date.parse('2026-11-06T17:00:00Z');
const UNTIL = new Date(NOW + 30 * 60 * 1000).toISOString();
const STAGING = 'gre3833-next-db-staging';
const ENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: STAGING };
const context = (name) => ({ site: { name, id: SITES[name].id }, deploy: { context: 'production', published: true } });
const JOHN = { gsamActor: 'user:UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP', label: 'John' };

let db;
let pool;
before(async () => {
  if (skip) return;
  db = startPostgres('staging-approver');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
});
after(async () => { await pool?.end(); db?.stop(); });

const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const rows = () => owner(`SELECT (SELECT count(*) FROM auth.users) || ' ' || (SELECT count(*) FROM users) || ' '
  || (SELECT count(*) FROM portal_approvers) || ' ' || (SELECT count(*) FROM portal_bridge_approvers)`);

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); },
  };
}
const envelope = (action, data) => ({ version: 1, mode: 'staging-approver', action, notAfter: UNTIL, data });
const openPool = () => ({ connect: () => pool.connect(), end: async () => {} });
async function tick(store, { env = ENV, site = STAGING, open = openPool } = {}) {
  const lines = [];
  const result = await runOwnerImport({ env, context: context(site), store, openPool: open, log: (l) => lines.push(l), now: NOW });
  return { result, lines };
}

test('with no Greatstone org it refuses and writes nothing', { skip }, async () => {
  const { result } = await tick(memoryStore({ payload: envelope('dry-run', JOHN) }));
  assert.deepEqual([result.status, result.reason], ['failed', 'staging-approver-no-org']);
  assert.equal(rows(), '0 0 0 0');
});

test('dry run rolls back; apply writes the four rows once and the link passes the publish check', { skip }, async () => {
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${GREATSTONE_ORG_ID}', 'staging', 'Staging org')`);
  const store = memoryStore();
  await store.setJSON('payload', envelope('apply', JOHN));
  assert.equal((await tick(store)).result.reason, 'dry-run-required');

  await store.setJSON('payload', envelope('dry-run', JOHN));
  const dry = await tick(store);
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  assert.deepEqual(dry.result.counts, { stagingApprover: { signIns: 1, staff: 1, approvers: 1, links: 1 } });
  assert.equal(rows(), '0 0 0 0', 'the dry run kept its rows');

  await store.setJSON('payload', envelope('apply', JOHN));
  const applied = await tick(store);
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.equal(rows(), '1 1 1 1');
  assert.equal(owner(`SELECT b.gsam_actor || ' ' || r.label || ' ' || u.role || ' ' || u.is_active
      FROM portal_bridge_approvers b JOIN portal_approvers r USING (auth_user_id)
      JOIN users u ON u.auth_subject = b.auth_user_id::text AND u.org_id = '${GREATSTONE_ORG_ID}'
     WHERE b.auth_user_id = '${STAGING_APPROVER.authUserId}'`), `${JOHN.gsamActor} John owner true`);
  assert.equal(JSON.stringify([...store.map.values(), applied.lines]).includes(STAGING_APPROVER.email), false);

  await store.setJSON('payload', envelope('apply', JOHN));
  assert.equal((await tick(store)).result.status, 'noop');
  assert.equal(rows(), '1 1 1 1');
});

test('while an approver or link exists, another run is refused', { skip }, async () => {
  for (const data of [JOHN, { gsamActor: 'user:someone-else', label: 'Other' }]) {
    const { result } = await tick(memoryStore({ payload: envelope('dry-run', data) }));
    assert.deepEqual([result.status, result.reason], ['failed', 'staging-approver-exists'], data.gsamActor);
  }
  assert.equal(rows(), '1 1 1 1');
});

test('a payload with any other field, an agent actor or a bad label is refused', { skip }, async () => {
  const cases = [
    [[JOHN], 'staging-approver-shape'],
    [{ ...JOHN, authUserId: STAGING_APPROVER.authUserId }, 'staging-approver-fields'],
    [{ gsamActor: JOHN.gsamActor }, 'staging-approver-fields'],
    [{ ...JOHN, gsamActor: 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278' }, 'staging-approver-actor'],
    [{ ...JOHN, gsamActor: "user:x'; DROP TABLE users; --" }, 'staging-approver-actor'],
    [{ ...JOHN, label: ' ' }, 'staging-approver-label'],
    [{ ...JOHN, label: 'x'.repeat(101) }, 'staging-approver-label'],
  ];
  for (const [data, reason] of cases) {
    const store = memoryStore({ payload: envelope('dry-run', data) });
    const { result } = await tick(store);
    assert.equal(result.reason, reason, JSON.stringify(data));
  }
});

test('the mode is refused on every other site, before the pool opens', { skip }, async () => {
  for (const site of Object.keys(SITES).filter((s) => s !== STAGING)) {
    const { result } = await tick(memoryStore({ payload: envelope('dry-run', JOHN) }), {
      env: { ...ENV, OWNER_IMPORT_SITE: site }, site, open: () => { throw new Error('opened the owner pool'); },
    });
    assert.equal(result.reason, 'mode-not-allowed', site);
  }
});

test('only staging sites allow it, and the validator is pure', () => {
  for (const [name, site] of Object.entries(SITES)) assert.equal(site.modes.includes('staging-approver'), name === STAGING, name);
  assert.equal(validateStagingApprover(JOHN), JOHN);
  assert.throws(() => validateStagingApprover(null), /staging-approver-shape/);
});
