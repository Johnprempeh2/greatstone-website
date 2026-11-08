// The staging test approver (GRE-2621): the owner importer's staging-test-approver and staging-test-approver-off
// modes, on a throwaway real Postgres with every migration applied (lib/postgres.mjs), through the real gre3833
// allow-list entry.
// Proves: an unverified or missing audit account is refused; the dry run rolls back; apply makes the verified audit
// sign-in an active Greatstone owner and portal approver, and portal_approve_and_publish accepts it; a second run is
// refused while it is active; any other address or field is refused; off removes the approver row and deactivates the
// staff row; after off a new audit address is accepted but the old one is not (GRE-4517); both modes are refused on
// every other site (greatstone-home included) before the pool opens.
// Without the Postgres server binaries the database tests are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import {
  runOwnerImport, SITES, GREATSTONE_ORG_ID, validateTestApprover, validateTestApproverOff,
} from '../functions/lib/owner-import.mjs';

const NOW = Date.parse('2026-11-08T03:00:00Z');
const UNTIL = new Date(NOW + 30 * 60 * 1000).toISOString();
const STAGING = 'gre3833-next-db-staging';
const ENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: STAGING };
const context = (name) => ({ site: { name, id: SITES[name].id }, deploy: { context: 'production', published: true } });
const SIGN_IN = '26210000-0000-4000-8000-0000000000b1';
const AUDIT = { email: 'staging-audit+2621@example.com', label: 'GRE-2621 test approver' };

let db;
let pool;
before(async () => {
  if (skip) return;
  db = startPostgres('test-approver');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
});
after(async () => { await pool?.end(); db?.stop(); });

const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const rows = () => owner(`SELECT (SELECT count(*) FROM users WHERE org_id = '${GREATSTONE_ORG_ID}' AND is_active) || ' '
  || (SELECT count(*) FROM portal_approvers)`);

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); },
  };
}
const envelope = (mode, action, data) => ({ version: 1, mode, action, notAfter: UNTIL, data });
const openPool = () => ({ connect: () => pool.connect(), end: async () => {} });
async function tick(store, { env = ENV, site = STAGING, open = openPool } = {}) {
  const lines = [];
  const result = await runOwnerImport({ env, context: context(site), store, openPool: open, log: (l) => lines.push(l), now: NOW });
  return { result, lines };
}
async function dryThenApply(mode, data) {
  const store = memoryStore({ payload: envelope(mode, 'dry-run', data) });
  const dry = await tick(store);
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  await store.setJSON('payload', envelope(mode, 'apply', data));
  return { dry, applied: await tick(store), store };
}

test('with no Greatstone org it refuses and writes nothing', { skip }, async () => {
  const { result } = await tick(memoryStore({ payload: envelope('staging-test-approver', 'dry-run', AUDIT) }));
  assert.deepEqual([result.status, result.reason], ['failed', 'test-approver-no-org']);
  assert.equal(rows(), '0 0');
});

test('a missing or unverified audit account is refused', { skip }, async () => {
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${GREATSTONE_ORG_ID}', 'staging', 'Staging org')`);
  const refused = async () => (await tick(memoryStore({ payload: envelope('staging-test-approver', 'dry-run', AUDIT) }))).result.reason;
  assert.equal(await refused(), 'test-approver-no-sign-in');
  owner(`INSERT INTO better_auth."user" ("id","name","email","emailVerified") VALUES ('${SIGN_IN}','Audit','${AUDIT.email}',false)`);
  assert.equal(await refused(), 'test-approver-no-sign-in');
  owner(`UPDATE better_auth."user" SET "emailVerified" = true WHERE "id" = '${SIGN_IN}'`);
  assert.equal(rows(), '0 0');
});

test('dry run rolls back; apply makes the sign-in an approver that portal_approve_and_publish accepts', { skip }, async () => {
  const { dry, applied, store } = await dryThenApply('staging-test-approver', AUDIT);
  assert.deepEqual(dry.result.counts, { testApprover: { staff: 1, approvers: 1 } });
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.equal(rows(), '1 1');
  assert.equal(owner(`SELECT u.role || ' ' || r.label FROM portal_approvers r JOIN users u ON u.auth_subject = r.auth_user_id::text
     WHERE r.auth_user_id = '${SIGN_IN}'`), `owner ${AUDIT.label}`);
  assert.equal(JSON.stringify([...store.map.values(), applied.lines]).includes(AUDIT.email), false, 'no address in results or logs');
  // the publish function's own approver check: signed in as the test approver, it gets past the approver gate
  const r = db.psql(`BEGIN; SELECT set_config('request.jwt.claims', '{"sub":"${SIGN_IN}"}', true);
    SELECT set_config('request.jwt.claim.sub', '${SIGN_IN}', true);
    SELECT portal_approve_and_publish('00000000-0000-4000-8000-000000000000', repeat('0', 64)); ROLLBACK;`);
  assert.doesNotMatch(r.stderr, /only the registered approver/);
  assert.match(r.stderr, /document not found/);
});

test('while a staging audit address is active Greatstone staff, another run is refused', { skip }, async () => {
  for (const data of [AUDIT, { ...AUDIT, email: 'staging-audit+2622@example.com' }]) {
    const { result } = await tick(memoryStore({ payload: envelope('staging-test-approver', 'dry-run', data) }));
    assert.deepEqual([result.status, result.reason], ['failed', 'test-approver-exists'], data.email);
  }
  assert.equal(rows(), '1 1');
});

test('any other address, field or label is refused', { skip }, async () => {
  const cases = [
    ['staging-test-approver', [AUDIT], 'test-approver-shape'],
    ['staging-test-approver', { ...AUDIT, role: 'owner' }, 'test-approver-fields'],
    ['staging-test-approver', { email: AUDIT.email }, 'test-approver-fields'],
    ['staging-test-approver', { ...AUDIT, email: 'john@greatstone.example' }, 'test-approver-email'],
    ['staging-test-approver', { ...AUDIT, email: 'staging-audit+1@example.com.evil' }, 'test-approver-email'],
    ['staging-test-approver', { ...AUDIT, label: ' ' }, 'test-approver-label'],
    ['staging-test-approver-off', { ...AUDIT }, 'test-approver-off-fields'],
    ['staging-test-approver-off', { email: 'someone@example.com' }, 'test-approver-off-email'],
  ];
  for (const [mode, data, reason] of cases) {
    const { result } = await tick(memoryStore({ payload: envelope(mode, 'dry-run', data) }));
    assert.equal(result.reason, reason, JSON.stringify(data));
  }
});

test('off removes the approver row and deactivates the staff row; the sign-in stays', { skip }, async () => {
  const { dry, applied } = await dryThenApply('staging-test-approver-off', { email: AUDIT.email });
  assert.deepEqual(dry.result.counts, { testApproverOff: { approvers: 1, deactivated: 1 } });
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.equal(rows(), '0 0');
  assert.equal(owner(`SELECT count(*) FROM auth.users WHERE id = '${SIGN_IN}'`), '1');
  const { result } = await tick(memoryStore({ payload: envelope('staging-test-approver-off', 'dry-run', { email: 'staging-audit+9@example.com' }) }));
  assert.equal(result.reason, 'test-approver-not-found');
});

test('after off, a new audit address is accepted; the old one is not, and only one is active at a time', { skip }, async () => {
  const NEXT_SIGN_IN = '45170000-0000-4000-8000-0000000000b1';
  const NEXT = { email: 'staging-audit+4517@example.com', label: 'GRE-4517 test approver' };
  owner(`INSERT INTO better_auth."user" ("id","name","email","emailVerified") VALUES ('${NEXT_SIGN_IN}','Audit','${NEXT.email}',true)`);
  const refused = async (data) => (await tick(memoryStore({ payload: envelope('staging-test-approver', 'dry-run', data) }))).result.reason;
  assert.equal(await refused(AUDIT), 'test-approver-used', 'the switched-off address');
  assert.equal(rows(), '0 0');
  const { applied } = await dryThenApply('staging-test-approver', NEXT);
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.equal(rows(), '1 1');
  assert.equal(await refused({ ...NEXT, email: 'staging-audit+4518@example.com' }), 'test-approver-exists');
  const off = await dryThenApply('staging-test-approver-off', { email: NEXT.email });
  assert.equal(off.applied.result.status, 'applied', JSON.stringify(off.applied.result));
  assert.equal(rows(), '0 0');
});

test('both modes are refused on production and every other site, before the pool opens', { skip }, async () => {
  for (const mode of ['staging-test-approver', 'staging-test-approver-off']) {
    const data = mode === 'staging-test-approver' ? AUDIT : { email: AUDIT.email };
    for (const site of Object.keys(SITES).filter((s) => s !== STAGING)) {
      const { result } = await tick(memoryStore({ payload: envelope(mode, 'dry-run', data) }), {
        env: { ...ENV, OWNER_IMPORT_SITE: site }, site, open: () => { throw new Error('opened the owner pool'); },
      });
      assert.equal(result.reason, 'mode-not-allowed', `${mode} on ${site}`);
    }
  }
});

test('only gre3833 allows the modes, greatstone-home never; the validators are pure', () => {
  for (const [name, site] of Object.entries(SITES))
    for (const mode of ['staging-test-approver', 'staging-test-approver-off'])
      assert.equal(site.modes.includes(mode), name === STAGING, `${mode} on ${name}`);
  assert.equal(SITES['greatstone-home'].modes.some((m) => m.startsWith('staging')), false);
  assert.equal(validateTestApprover(AUDIT), AUDIT);
  assert.throws(() => validateTestApprover(null), /test-approver-shape/);
  assert.throws(() => validateTestApproverOff({ email: 'x@y.z' }), /test-approver-off-email/);
});
