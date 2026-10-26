// The one-time owner importer (GRE-2578, netlify/functions/lib/owner-import.mjs) on a throwaway real Postgres with every
// migration applied (lib/postgres.mjs). Proves: it reads and writes nothing without each guard (window, its 60-minute
// limit, site allow-list, run target, deploy context); payload refusals leave a counts-only result and delete the
// payload; a dry run rolls back; apply needs a passed dry run and commits; the same payload hash never applies twice;
// a non-owner role is refused; the table move keeps counts exact (no trigger adds rows), turns its triggers back on,
// moves serial sequences on and refuses a column or row conflict; TABLES is in foreign-key order; no row value
// reaches a log line or a result blob. Without the Postgres server binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { hashSync } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { startPostgres, skip } from './lib/postgres.mjs';
import {
  runOwnerImport, checkWindow, buildTablesData, targetColumns, payloadHash, columnsHash, TABLES, SITES,
} from '../functions/lib/owner-import.mjs';

const NOW = Date.parse('2026-10-26T10:00:00Z');
const UNTIL = new Date(NOW + 30 * 60 * 1000).toISOString();
const STAGING = { site: { name: 'gre1795-website-db-staging', id: SITES['gre1795-website-db-staging'].id }, deploy: { context: 'production', published: true } };
const REHEARSAL = { site: { name: 'owner-import-test', id: 'test-site-id' }, deploy: { context: 'production', published: true } };
const TEST_SITES = { ...SITES, 'owner-import-test': { id: 'test-site-id', context: 'production', modes: ['tables'] } };
const ENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: 'gre1795-website-db-staging' };
const TENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: 'owner-import-test' };

const hex = (n, i) => n.toString(16).padStart(8, '0') + `-0000-4000-8000-${String(i).padStart(12, '0')}`;
const APPROVED_PREFIXES = ['079636cf', 'd814b01d', 'c3f9c60f', '2d47ada5',
  '7a0c5d8e', '681507c1', 'e81bc42a', '5a85a5ba'];
const USERS = Array.from({ length: 8 }, (_, i) => ({
  id: `${APPROVED_PREFIXES[i]}-0000-4000-8000-${String(i).padStart(12, '0')}`,
  email: `person${i}@example.test`, name: `Person ${i}`, emailVerified: i % 2 === 0,
  passwordHash: `$2b$10$${String.fromCharCode(65 + i).repeat(53)}`,
}));
const SECRETS = USERS.flatMap((u) => [u.email, u.passwordHash, u.name]);

let db;
let pool;
before(async () => {
  if (skip) return;
  db = startPostgres('owner-import');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
});
after(async () => { await pool?.end(); db?.stop(); });

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  const writes = [];
  return {
    map, writes,
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, value) { writes.push(key); map.set(key, JSON.stringify(value)); },
    async delete(key) { writes.push(`delete:${key}`); map.delete(key); },
  };
}
const envelope = (mode, action, data, notAfter = UNTIL) => ({ version: 1, mode, action, notAfter, data });
// the test pool is shared, so a run's pool.end() must not end it
const openPool = () => ({ connect: () => pool.connect(), end: async () => {} });
const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

async function tick(store, { env = ENV, context = STAGING, sites = SITES, now = NOW, open = openPool } = {}) {
  const lines = [];
  const result = await runOwnerImport({ env, context, store, openPool: open, log: (l) => lines.push(l), now, sites });
  return { result, lines };
}
function assertNoValues(...things) {
  const text = JSON.stringify(things);
  for (const s of SECRETS) assert.ok(!text.includes(s), 'a row value reached a log line or result');
}

test('the guards: nothing read or written without each one', { skip }, async () => {
  const cases = [
    ['no window', {}, STAGING, 'inert'],
    ['bad window', { ...ENV, OWNER_IMPORT_UNTIL: 'soon' }, STAGING, 'window-invalid'],
    ['window passed', { ...ENV, OWNER_IMPORT_UNTIL: new Date(NOW - 1).toISOString() }, STAGING, 'window-expired'],
    ['window over 60 minutes', { ...ENV, OWNER_IMPORT_UNTIL: new Date(NOW + 61 * 60 * 1000).toISOString() }, STAGING, 'window-too-long'],
    ['site not on the list', ENV, { ...STAGING, site: { name: 'someone-else', id: STAGING.site.id } }, 'site-not-allowed'],
    ['listed name, wrong id', ENV, { ...STAGING, site: { ...STAGING.site, id: 'other' } }, 'site-not-allowed'],
    ['no run target', { OWNER_IMPORT_UNTIL: UNTIL }, STAGING, 'site-not-targeted'],
    ['run targets another site', { ...ENV, OWNER_IMPORT_SITE: 'greatstone-home' }, STAGING, 'site-not-targeted'],
    ['deploy preview', ENV, { ...STAGING, deploy: { context: 'deploy-preview', published: false } }, 'deploy-context'],
    ['branch deploy', ENV, { ...STAGING, deploy: { context: 'branch-deploy' } }, 'deploy-context'],
    ['unpublished production deploy', ENV, { ...STAGING, deploy: { context: 'production', published: false } }, 'deploy-unpublished'],
  ];
  for (const [label, env, context, expected] of cases) {
    const store = memoryStore({ payload: envelope('identities', 'dry-run', USERS) });
    let opened = false;
    const { result } = await tick(store, { env, context, open: () => { opened = true; return openPool(); } });
    assert.equal(result.reason || result.status, expected, label);
    assert.deepEqual(store.writes, [], `${label}: wrote to the store`);
    assert.ok(store.map.has('payload'), `${label}: touched the payload`);
    assert.equal(opened, false, `${label}: opened the owner pool`);
  }
  const idle = await tick(memoryStore());
  assert.equal(idle.result.status, 'idle');
  assert.equal(owner('SELECT count(*) FROM better_auth."user"'), '0');
});

test('payload refusals: counts-only result, payload deleted, nothing written', { skip }, async () => {
  const cases = [
    ['mode the site does not allow', envelope('tables', 'dry-run', { tables: [] }), 'mode-not-allowed'],
    ['unknown action', envelope('identities', 'force', USERS), 'action-invalid'],
    ['payload past its notAfter', envelope('identities', 'dry-run', USERS, new Date(NOW - 1).toISOString()), 'payload-expired'],
    ['notAfter beyond the window', envelope('identities', 'dry-run', USERS, new Date(NOW + 40 * 60 * 1000).toISOString()), 'payload-expired'],
    ['not an envelope', { mode: 'identities' }, 'payload-invalid'],
    ['apply before a dry run', envelope('identities', 'apply', USERS), 'dry-run-required'],
    ['seven users', envelope('identities', 'dry-run', USERS.slice(0, 7)), 'Expected exactly eight source users'],
    ['malformed hash', envelope('identities', 'dry-run', USERS.map((u, i) => (i ? u : { ...u, passwordHash: 'x' }))), 'Invalid source hash'],
  ];
  for (const [label, payload, reason] of cases) {
    const store = memoryStore({ payload });
    const { result, lines } = await tick(store);
    assert.equal(result.status, 'failed', label);
    assert.equal(result.reason, reason, label);
    assert.equal(store.map.has('payload'), false, `${label}: payload kept`);
    assert.deepEqual((await store.get('results/latest')).reason, reason);
    assertNoValues(lines, [...store.map.values()]);
  }
  assert.equal(owner('SELECT count(*) FROM better_auth."user"'), '0');
});

test('identities: dry run rolls back, apply commits once, the same hash is a no-op', { skip }, async () => {
  const store = memoryStore({ payload: envelope('identities', 'dry-run', USERS) });
  const hash = payloadHash('identities', USERS);

  const dry = await tick(store);
  assert.equal(dry.result.status, 'dry-run-ok');
  assert.deepEqual(dry.result.counts, { identities: { source: 8, imported: 8 } });
  assert.equal(owner('SELECT count(*) FROM better_auth."user"'), '0', 'dry run left rows');
  assert.ok((await store.get(`ledger/${hash}`)).dryRunAt);
  assert.equal(store.map.has('payload'), false);

  await store.setJSON('payload', envelope('identities', 'apply', USERS));
  const applied = await tick(store);
  assert.equal(applied.result.status, 'applied');
  assert.equal(owner('SELECT count(*) FROM better_auth."user"'), '8');
  assert.equal(owner(`SELECT count(*) FROM better_auth."account" WHERE "providerId" = 'credential'`), '8');
  // UUID continuity: the shared auth.users rows carry the source ids
  assert.equal(owner(`SELECT count(*) FROM auth.users WHERE id::text = ANY(ARRAY['${USERS.map((u) => u.id).join("','")}'])`), '8');
  assert.deepEqual(await store.get(`results/${hash}/apply`), applied.result);

  await store.setJSON('payload', envelope('identities', 'apply', USERS));
  const again = await tick(store);
  assert.equal(again.result.status, 'noop');
  assert.equal(again.result.reason, 'already-applied');
  assert.equal(owner('SELECT count(*) FROM better_auth."account"'), '8');
  assertNoValues(dry.lines, applied.lines, again.lines, [...store.map.values()]);
});

test('staging proof compares all three digests, then creates one cost-10 legacy fixture', { skip }, async () => {
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const fixtureId = 'f1000000-0000-4000-8000-000000000001';
  const fixtureEmail = 'gre2805-fixture@example.test';
  const fixturePassword = 'fixture-password-for-test';
  const data = {
    source: USERS.map((u) => ({
      id: u.id, uuidDigest: digest(u.id), emailDigest: digest(u.email), bcryptDigest: digest(u.passwordHash),
    })),
    fixture: { id: fixtureId, email: fixtureEmail, passwordHash: hashSync(fixturePassword, 10) },
  };
  const failing = structuredClone(data);
  failing.source[0].bcryptDigest = digest('incorrect');
  const failure = await tick(memoryStore({ payload: envelope('proof', 'dry-run', failing) }));
  assert.equal(failure.result.counts.identities.matched, 7, 'a changed bcrypt digest must fail the check');
  assert.deepEqual(failure.result.counts.checks[0], {
    prefix: USERS[0].id.slice(0, 8), uuid: true, email: true, bcrypt: false,
  });
  assert.equal(owner(`SELECT count(*) FROM better_auth."user" WHERE "id"='${fixtureId}'`), '0');
  const failingStore = memoryStore({ payload: envelope('proof', 'dry-run', failing) });
  await tick(failingStore);
  await failingStore.setJSON('payload', envelope('proof', 'apply', failing));
  assert.equal((await tick(failingStore)).result.reason, 'proof-mismatch');
  assert.equal(owner(`SELECT count(*) FROM better_auth."user" WHERE "id"='${fixtureId}'`), '0');

  const hash = payloadHash('proof', data);
  const store = memoryStore({ payload: envelope('proof', 'dry-run', data) });
  const dry = await tick(store);
  assert.equal(dry.result.status, 'dry-run-ok');
  assert.equal(dry.result.counts.identities.matched, 8);
  assert.equal(owner(`SELECT count(*) FROM better_auth."user" WHERE "id"='${fixtureId}'`), '0');
  await store.setJSON('payload', envelope('proof', 'apply', data));
  const applied = await tick(store);
  assert.equal(applied.result.status, 'applied');
  assert.equal(applied.result.counts.fixtureId, undefined);
  assert.equal(owner(`SELECT count(*) FROM better_auth."user" WHERE "id"='${fixtureId}'`), '1');
  assert.equal(owner(`SELECT count(*) FROM better_auth."account" WHERE "userId"='${fixtureId}' AND "providerId"='credential'`), '1');
  await store.setJSON('payload', envelope('proof', 'apply', data));
  assert.equal((await tick(store)).result.status, 'noop');
  assert.equal(owner(`SELECT count(*) FROM better_auth."account" WHERE "userId"='${fixtureId}'`), '1');
  const safe = JSON.stringify([...store.map.values(), dry.lines, applied.lines]);
  assert.ok(!safe.includes(fixtureEmail));
  assert.ok(!safe.includes(fixturePassword));
  assert.ok(!safe.includes(data.fixture.passwordHash));
  assert.ok(!safe.includes(fixtureId));
  assert.ok(!safe.includes(USERS[0].email));
  assert.ok(!safe.includes(USERS[0].passwordHash));
  assert.equal((await store.get(`ledger/${hash}`)).counts.identities.matched, 8);
});

test('proof refuses an existing non-source user without adding a credential', { skip }, async () => {
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const fixtureId = 'f2000000-0000-4000-8000-000000000002';
  const fixtureEmail = 'existing-person@example.test';
  owner(`INSERT INTO better_auth."user" ("id", "name", "email", "emailVerified")
    VALUES ('${fixtureId}', 'Existing person', '${fixtureEmail}', true)`);
  const data = {
    source: USERS.map((u) => ({ id: u.id, uuidDigest: digest(u.id),
      emailDigest: digest(u.email), bcryptDigest: digest(u.passwordHash) })),
    fixture: { id: fixtureId, email: fixtureEmail, passwordHash: hashSync('test-only-password', 10) },
  };
  const store = memoryStore({ payload: envelope('proof', 'dry-run', data) });
  const dry = await tick(store);
  assert.equal(dry.result.status, 'failed');
  assert.equal(dry.result.reason, 'proof-fixture-conflict');
  assert.equal(owner(`SELECT count(*) FROM better_auth."account" WHERE "userId"='${fixtureId}'`), '0');
});

test('a role other than netlifydb_owner is refused before any write', { skip }, async () => {
  owner('CREATE ROLE owner_import_other LOGIN; GRANT USAGE ON SCHEMA better_auth TO owner_import_other;');
  const other = new pg.Pool({ connectionString: db.url.replace('netlifydb_owner@', 'owner_import_other@'), max: 1 });
  try {
    const users = USERS.map((u, i) => ({ ...u, id: hex(0xb0000000 + i, i), email: `x${u.email}` }));
    const store = memoryStore({ payload: envelope('identities', 'dry-run', users) });
    const { result } = await tick(store, { open: () => other });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'Import requires the migration owner role');
  } finally { await other.end().catch(() => {}); }
});

// --- the table move ---

const ORG = '11111111-1111-4111-8111-111111111111';
const SEED = `BEGIN;
  INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone');
  INSERT INTO org_settings (org_id) VALUES ('${ORG}');
  INSERT INTO categories (id, org_id, slug, name) VALUES ('c0000000-0000-4000-8000-000000000001', '${ORG}', 'parent', 'Parent');
  INSERT INTO categories (id, org_id, slug, name, parent_id) VALUES ('c0000000-0000-4000-8000-000000000002', '${ORG}', 'child', 'Child', 'c0000000-0000-4000-8000-000000000001');
  INSERT INTO customers (id, org_id, slug, name) VALUES ('c1000000-0000-4000-8000-000000000001', '${ORG}', 'northwind', 'Northwind');
  INSERT INTO deepdive_plans (slug, org_id, plan) VALUES ('northwind', '${ORG}', '{"engagement": {"client": "Northwind", "title": "Plan", "stage": "live"}}');
  INSERT INTO deepdive_log (slug, org_id) VALUES ('northwind', '${ORG}'), ('northwind', '${ORG}'), ('northwind', '${ORG}');
  COMMIT;`;
const exportAll = () => Object.fromEntries(TABLES.map((t) => [t, JSON.parse(owner(`SELECT coalesce(json_agg(x), '[]') FROM public.${t} x`))]));
const truncateAll = () => owner(`TRUNCATE ${TABLES.map((t) => `public.${t}`).join(', ')} CASCADE;`);
const counts = () => Object.fromEntries(TABLES.map((t) => [t, Number(owner(`SELECT count(*) FROM public.${t}`))]));
const enabledTriggers = () => owner(`SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = ANY(ARRAY['${TABLES.join("','")}']) AND NOT t.tgisinternal AND t.tgenabled = 'O'`);

async function tablesPayload() {
  owner(SEED);
  const source = exportAll();
  const want = counts();
  truncateAll();
  const client = await pool.connect();
  try { return { ...buildTablesData(source, await targetColumns(client)), want, source }; } finally { client.release(); }
}

test('TABLES is in foreign-key order and every table has a primary key', { skip }, () => {
  const fks = owner(`SELECT c.conrelid::regclass::text || ' ' || c.confrelid::regclass::text FROM pg_constraint c
    WHERE c.contype = 'f' AND c.conrelid::regclass::text = ANY(ARRAY['${TABLES.join("','")}'])`).split('\n');
  for (const [child, parent] of fks.map((l) => l.split(' '))) {
    if (!TABLES.includes(parent) || child === parent) continue;
    assert.ok(TABLES.indexOf(parent) < TABLES.indexOf(child), `${parent} must come before ${child}`);
  }
  for (const t of TABLES) assert.equal(owner(`SELECT count(*) FROM pg_constraint WHERE contype = 'p' AND conrelid = 'public.${t}'::regclass`), '1', t);
});

test('tables: dry run rolls back, apply commits with exact counts, triggers back on, second run a no-op', { skip }, async () => {
  const triggersBefore = enabledTriggers();
  const { data, want, dropped } = await tablesPayload();
  assert.deepEqual(dropped, { deepdive_plans: ['client', 'title', 'stage'] }, 'only generated columns are dropped');
  const empty = counts();
  const store = memoryStore({ payload: envelope('tables', 'dry-run', data) });

  const dry = await tick(store, { env: TENV, context: REHEARSAL, sites: TEST_SITES });
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  assert.deepEqual(counts(), empty, 'dry run left rows');
  assert.equal(enabledTriggers(), triggersBefore);

  await store.setJSON('payload', envelope('tables', 'apply', data));
  const applied = await tick(store, { env: TENV, context: REHEARSAL, sites: TEST_SITES });
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.deepEqual(counts(), want, 'counts differ from the source');
  for (const c of applied.result.counts.tables) assert.equal(c.after, c.before + c.rows, c.table);
  assert.equal(enabledTriggers(), triggersBefore, 'a trigger was left off');
  assert.equal(owner('SELECT count(*) FROM fx_rate_history'), String(want.fx_rate_history), 'the fx trigger added a row');
  assert.equal(owner("SELECT plan->'engagement'->>'client' = client FROM deepdive_plans"), 't', 'generated column not rebuilt');
  // the bigserial sequence moved past the imported ids, so the next insert does not collide
  owner(`INSERT INTO deepdive_log (slug, org_id) VALUES ('northwind', '${ORG}')`);
  assert.equal(owner('SELECT count(*) FROM deepdive_log'), String(want.deepdive_log + 1));
  owner("DELETE FROM deepdive_log WHERE id = (SELECT max(id) FROM deepdive_log)");

  await store.setJSON('payload', envelope('tables', 'apply', data));
  const again = await tick(store, { env: TENV, context: REHEARSAL, sites: TEST_SITES });
  assert.equal(again.result.status, 'noop');
  assert.deepEqual(counts(), want);

  // a fresh hash over rows already there: every row must insert, so the conflict refuses and nothing changes
  const replay = { ...structuredClone(data), note: 'replay' };
  await store.setJSON('payload', envelope('tables', 'dry-run', replay));
  const conflict = await tick(store, { env: TENV, context: REHEARSAL, sites: TEST_SITES });
  assert.equal(conflict.result.status, 'failed');
  assert.equal(conflict.result.reason, 'rows-conflict');
  assert.deepEqual(counts(), want);
  truncateAll();
});

test('tables: a column list that differs from the target, or a short row, is refused', { skip }, async () => {
  const { data } = await tablesPayload();
  const i = TABLES.indexOf('organisations');
  const wrongCols = structuredClone(data);
  wrongCols.tables[i].columns = columnsHash(['id', 'name']);
  const shortRow = structuredClone(data);
  shortRow.tables[i].rows[0].pop();
  const shape = { tables: data.tables.slice(1) };
  for (const [payload, reason] of [[wrongCols, 'columns-differ'], [shortRow, 'row-shape'], [shape, 'tables-shape']]) {
    const store = memoryStore({ payload: envelope('tables', 'dry-run', payload) });
    const { result } = await tick(store, { env: TENV, context: REHEARSAL, sites: TEST_SITES });
    assert.equal(result.reason, reason);
  }
  assert.equal(owner('SELECT count(*) FROM organisations'), '0');
});

test('the runner helper refuses rows for a table outside TABLES or missing a column', { skip }, async () => {
  const client = await pool.connect();
  try {
    const columns = await targetColumns(client);
    assert.throws(() => buildTablesData({ audit_log: [{ id: 1 }] }, columns), /not in TABLES/);
    assert.throws(() => buildTablesData({ organisations: [{ id: ORG }] }, columns), /lack column/);
  } finally { client.release(); }
});

test('the window check is pure: only staging allows proof', () => {
  assert.deepEqual(SITES['greatstone-home'].modes, ['tables']);
  assert.deepEqual(SITES['gre1795-website-db-staging'].modes, ['identities', 'proof']);
  const ok = checkWindow({ env: ENV, context: STAGING, now: NOW });
  assert.equal(ok.site, SITES['gre1795-website-db-staging']);
});
