// The portal approver on Netlify Database (GRE-3964): the owner importer's approver mode, on a throwaway real
// Postgres with every migration applied (lib/postgres.mjs), through the real greatstone-home allow-list entry.
// Proves: only an active owner of the Greatstone org with a sign-in (auth.users id) is registered; an unknown user,
// an owner of another org, an admin, an inactive or deleted owner and an owner with no sign-in are refused with a
// fixed reason and nothing is written; the dry run rolls back, apply writes exactly one row once; while an approver
// exists any second one (or John again) is refused; the mode is refused on every other site without opening the
// pool; a payload with any field but email and label is refused. No email or id reaches a log line or a result blob.
// Without the Postgres server binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import {
  runOwnerImport, SITES, GREATSTONE_ORG_ID, validateApprover, ledgerKey, payloadHash,
} from '../functions/lib/owner-import.mjs';
import { GREATSTONE_ORG_ID as STAFF_ORG_ID } from '../../src/lib/staff-provision.mjs';

const NOW = Date.parse('2026-11-04T10:00:00Z');
const UNTIL = new Date(NOW + 30 * 60 * 1000).toISOString();
const HOME = 'greatstone-home';
const ENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: HOME };
const context = (name) => ({ site: { name, id: SITES[name].id }, deploy: { context: 'production', published: true } });

const ORG = GREATSTONE_ORG_ID;
const ORG2 = '22222222-2222-4222-8222-222222222222';
// auth.users ids; each staff row below signs in with the one of the same name
const SUB = {
  john: 'a0000000-0000-4000-8000-00000000000a',
  owner2: 'b0000000-0000-4000-8000-00000000000b',
  admin: 'c0000000-0000-4000-8000-00000000000c',
  inactive: 'd0000000-0000-4000-8000-00000000000d',
  deleted: 'e0000000-0000-4000-8000-00000000000e',
  other: 'f0000000-0000-4000-8000-00000000000f',
};
const NO_SIGN_IN = '90000000-0000-4000-8000-000000000009'; // an auth_subject with no auth.users row
const JOHN = { email: 'john@greatstone.test', label: 'John' };

let db;
let pool;
before(async () => {
  if (skip) return;
  db = startPostgres('approver');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone'), ('${ORG2}', 'other', 'Other');
    INSERT INTO auth.users (id, email) VALUES ${Object.entries(SUB).map(([k, id]) => `('${id}', '${k}@auth.test')`).join(', ')};
    INSERT INTO users (org_id, email, role, auth_subject, is_active, deleted_at) VALUES
      ('${ORG}', 'john@greatstone.test', 'owner', '${SUB.john.toUpperCase()}', true, NULL),
      ('${ORG}', 'owner2@greatstone.test', 'owner', '${SUB.owner2}', true, NULL),
      ('${ORG}', 'admin@greatstone.test', 'admin', '${SUB.admin}', true, NULL),
      ('${ORG}', 'inactive@greatstone.test', 'owner', '${SUB.inactive}', false, NULL),
      ('${ORG}', 'deleted@greatstone.test', 'owner', '${SUB.deleted}', true, now()),
      ('${ORG}', 'nosignin@greatstone.test', 'owner', '${NO_SIGN_IN}', true, NULL),
      ('${ORG}', 'nosubject@greatstone.test', 'owner', NULL, true, NULL),
      ('${ORG2}', 'other@other.test', 'owner', '${SUB.other}', true, NULL);`);
});
after(async () => { await pool?.end(); db?.stop(); });

const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const approvers = () => owner('SELECT count(*) FROM portal_approvers');

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); },
  };
}
const envelope = (action, data) => ({ version: 1, mode: 'approver', action, notAfter: UNTIL, data });
const openPool = () => ({ connect: () => pool.connect(), end: async () => {} });
async function tick(store, { env = ENV, site = HOME, open = openPool } = {}) {
  const lines = [];
  const result = await runOwnerImport({ env, context: context(site), store, openPool: open, log: (l) => lines.push(l), now: NOW });
  return { result, lines };
}
const leaks = (store, lines, values) => {
  const blob = JSON.stringify([...store.map.values(), lines]).toLowerCase();
  return values.filter((v) => blob.includes(v.toLowerCase()));
};

test('refuses an unknown user, another org, an admin, an inactive or deleted owner and one with no sign-in', { skip }, async () => {
  const cases = [
    ['nobody@greatstone.test', 'approver-user-unknown'],
    ['other@other.test', 'approver-user-unknown'], // an owner, but not of the Greatstone org
    ['admin@greatstone.test', 'approver-not-owner'],
    ['inactive@greatstone.test', 'approver-user-inactive'],
    ['deleted@greatstone.test', 'approver-user-inactive'],
    ['nosignin@greatstone.test', 'approver-no-sign-in'],
    ['nosubject@greatstone.test', 'approver-no-sign-in'],
  ];
  for (const [email, reason] of cases) {
    // a refused dry run never earns an apply, so try both actions through a ledger that says the dry run passed
    for (const action of ['dry-run', 'apply']) {
      const store = memoryStore({ payload: envelope(action, { email, label: 'X' }) });
      if (action === 'apply') await store.setJSON(ledgerKey(UNTIL, payloadHash('approver', { email, label: 'X' })), { dryRunAt: UNTIL });
      const { result, lines } = await tick(store);
      assert.equal(result.status, 'failed', `${email} ${action}`);
      assert.equal(result.reason, reason, `${email} ${action}`);
      assert.deepEqual(leaks(store, lines, [email, ...Object.values(SUB)]), [], 'an email or id reached a result or log');
    }
  }
  assert.equal(approvers(), '0', 'a refused payload wrote a row');
});

test('the mode is refused on every other site, before the pool opens', { skip }, async () => {
  for (const site of Object.keys(SITES).filter((s) => s !== HOME)) {
    const store = memoryStore({ payload: envelope('dry-run', JOHN) });
    const { result } = await tick(store, {
      env: { ...ENV, OWNER_IMPORT_SITE: site }, site, open: () => { throw new Error('opened the owner pool'); },
    });
    assert.equal(result.reason, 'mode-not-allowed', site);
  }
  assert.equal(approvers(), '0');
});

test('John: dry run rolls back, apply writes one row once, result has counts only', { skip }, async () => {
  const store = memoryStore();
  await store.setJSON('payload', envelope('apply', JOHN));
  assert.equal((await tick(store)).result.reason, 'dry-run-required');
  assert.equal(approvers(), '0');

  await store.setJSON('payload', envelope('dry-run', JOHN));
  const dry = await tick(store);
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  assert.deepEqual(dry.result.counts, { approver: { before: 0, inserted: 1, after: 1 } });
  assert.equal(approvers(), '0', 'the dry run kept its row');

  await store.setJSON('payload', envelope('apply', JOHN));
  const applied = await tick(store);
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.deepEqual(applied.result.counts, { approver: { before: 0, inserted: 1, after: 1 } });
  assert.equal(owner('SELECT auth_user_id || \' \' || label FROM portal_approvers'), `${SUB.john} John`);

  await store.setJSON('payload', envelope('apply', JOHN));
  const again = await tick(store);
  assert.equal(again.result.status, 'noop');
  assert.equal(approvers(), '1');

  assert.deepEqual(leaks(store, [...dry.lines, ...applied.lines, ...again.lines], [JOHN.email, ...Object.values(SUB)]), [],
    'an email or id reached a result or log');
  assert.equal(store.map.has('payload'), false);
});

test('while an approver exists, a second one (or John again) is refused and nothing is written', { skip }, async () => {
  assert.equal(approvers(), '1', 'runs after the John test');
  for (const data of [{ email: 'owner2@greatstone.test', label: 'Second' }, { ...JOHN, label: 'John again' }]) {
    const { result } = await tick(memoryStore({ payload: envelope('dry-run', data) }));
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'approver-exists', data.label);
  }
  assert.equal(approvers(), '1');
});

test('a payload with any field but email and label, or a bad value, is refused', { skip }, async () => {
  const cases = [
    [[JOHN], 'approver-shape'],
    [{ ...JOHN, authUserId: SUB.owner2 }, 'approver-fields'],
    [{ email: JOHN.email }, 'approver-fields'],
    [{ ...JOHN, email: 'John@Greatstone.test' }, 'approver-email'],
    [{ ...JOHN, email: ' john@greatstone.test' }, 'approver-email'],
    [{ ...JOHN, email: 'john' }, 'approver-email'],
    [{ ...JOHN, label: ' ' }, 'approver-label'],
    [{ ...JOHN, label: 'x'.repeat(121) }, 'approver-label'],
  ];
  for (const [data, reason] of cases) {
    const store = memoryStore({ payload: envelope('dry-run', data) });
    const { result } = await tick(store);
    assert.equal(result.reason, reason, JSON.stringify(data));
    assert.equal(store.map.has('payload'), false, 'a refused payload was kept');
  }
});

test('validators are pure and fixed: SITES, org id, payload shape', () => {
  assert.equal(GREATSTONE_ORG_ID, STAFF_ORG_ID);
  for (const [name, site] of Object.entries(SITES)) assert.equal(site.modes.includes('approver'), name === HOME, name);
  assert.equal(validateApprover(JOHN), JOHN);
  assert.throws(() => validateApprover(null), /approver-shape/);
  assert.throws(() => validateApprover({ ...JOHN, role: 'owner' }), /approver-fields/);
});
