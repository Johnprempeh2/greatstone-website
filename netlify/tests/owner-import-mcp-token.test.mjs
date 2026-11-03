// Portal MCP tokens on Netlify Database (GRE-3769): migration 064's mcp_portal_register_token and the owner
// importer's mcp-token and mcp-token-revoke modes, on a throwaway real Postgres with every migration applied
// (lib/postgres.mjs). Proves: register refuses a bad hash (a raw token too), mixed orgs, unknown clients and a
// hash already registered; no role but the owner can call it; a registered token works with
// mcp_portal_list_clients (as anon, what portal-mcp uses) and sees only its client; the importer's dry run rolls
// back, apply commits once and reports the token id and client count only; a payload with any field but the three,
// or with a 'gspm_' value, is refused; revoke stops the token. No token or hash reaches a log line or a result blob.
// Without the Postgres server binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { startPostgres, skip, OWNER } from './lib/postgres.mjs';
import {
  runOwnerImport, SITES, validateMcpToken, validateMcpTokenRevoke,
} from '../functions/lib/owner-import.mjs';
import { makeMcpToken } from '../../scripts/mcp-token-new.mjs';

const NOW = Date.parse('2026-11-02T10:00:00Z');
const UNTIL = new Date(NOW + 30 * 60 * 1000).toISOString();
const MODES = ['mcp-token', 'mcp-token-revoke'];
const REHEARSAL = { site: { name: 'mcp-token-test', id: 'test-site-id' }, deploy: { context: 'production', published: true } };
const TEST_SITES = { ...SITES, 'mcp-token-test': { id: 'test-site-id', context: 'production', modes: MODES } };
const TENV = { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: 'mcp-token-test' };
const STAGING = { site: { name: 'gre1795-website-db-staging', id: SITES['gre1795-website-db-staging'].id }, deploy: { context: 'production', published: true } };

const ORG = '11111111-1111-4111-8111-111111111111';
const ORG2 = '22222222-2222-4222-8222-222222222222';
const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const OTHER = 'c0000000-0000-4000-8000-00000000000c'; // a client of another organisation
const MISSING = 'd0000000-0000-4000-8000-00000000000d';
const sha = (s) => createHash('sha256').update(s).digest('hex');

let db;
let pool;
before(async () => {
  if (skip) return;
  db = startPostgres('mcp-token');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone'), ('${ORG2}', 'other', 'Other');
    INSERT INTO customers (id, org_id, slug, name) VALUES ('${A}', '${ORG}', 'client-a', 'Client A'),
      ('${B}', '${ORG}', 'client-b', 'Client B'), ('${OTHER}', '${ORG2}', 'client-c', 'Client C');`);
});
after(async () => { await pool?.end(); db?.stop(); });

const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const ownerFails = (sql, pattern) => {
  const r = db.psql(sql);
  assert.notEqual(r.status, 0, `expected a refusal: ${r.stdout}`);
  if (pattern) assert.match(r.stderr, pattern);
};
const as = (role, sql) => db.psql(`BEGIN; SET LOCAL ROLE ${role}; ${sql} COMMIT;`);
const listClients = (hash) => JSON.parse(owner(`BEGIN; SET LOCAL ROLE anon; SELECT mcp_portal_list_clients('${hash}'); COMMIT;`));
const register = (label, ids, hash) => `SELECT mcp_portal_register_token('${label}', ARRAY[${ids.map((i) => `'${i}'`).join(',')}]::uuid[], ${hash == null ? 'NULL' : `'${hash}'`});`;

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
async function tick(store, { env = TENV, context = REHEARSAL } = {}) {
  const lines = [];
  const result = await runOwnerImport({ env, context, store, openPool, log: (l) => lines.push(l), now: NOW, sites: TEST_SITES });
  return { result, lines };
}
async function dryThenApply(store, mode, data) {
  await store.setJSON('payload', envelope(mode, 'dry-run', data));
  const dry = await tick(store);
  await store.setJSON('payload', envelope(mode, 'apply', data));
  const applied = await tick(store);
  return { dry, applied };
}

test('register refuses a bad hash, mixed orgs, unknown clients and a hash already registered', { skip }, () => {
  const good = sha('gspm_' + '1'.repeat(64));
  for (const hash of [null, 'abc', good.toUpperCase(), `${good}0`, 'gspm_' + '1'.repeat(64), `${good.slice(0, 63)}g`])
    ownerFails(register('Bad hash', [A], hash), /SHA-256 as 64 lower-case hex/);
  ownerFails(register('Mixed orgs', [A, OTHER], good), /one organisation/);
  ownerFails(register('Unknown client', [A, MISSING], good), /one organisation/);
  ownerFails(register('No clients', [], good), /one organisation/);
  ownerFails(`SELECT mcp_portal_register_token('Null client', ARRAY['${A}', NULL]::uuid[], '${good}');`, /one organisation/);
  assert.equal(owner('SELECT count(*) FROM mcp_tokens'), '0', 'a refused register left a row');

  const id = owner(register('Good', [A, A], good));
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(owner(`SELECT count(*) FROM mcp_token_clients WHERE token_id = '${id}'`), '1', 'duplicate client ids are one row');
  ownerFails(register('Again', [A], good), /already registered/);
  owner(`SELECT mcp_portal_revoke_token('${id}');`);
});

test('no role but the owner can call register', { skip }, () => {
  const roles = owner(`SELECT string_agg(rolname, ' ') FROM pg_roles
    WHERE rolname <> '${OWNER}' AND NOT rolsuper AND rolname !~ '^pg_'`).split(' ');
  for (const role of ['anon', 'authenticated', 'service_role']) assert.ok(roles.includes(role), role);
  for (const role of roles)
    assert.equal(owner(`SELECT has_function_privilege('${role}', 'mcp_portal_register_token(text, uuid[], text)', 'EXECUTE');`), 'f', role);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const r = as(role, register('Via API', [A], sha(`api-${role}`)));
    assert.notEqual(r.status, 0, role);
    assert.match(r.stderr, /permission denied/, role);
  }
});

test('a registered token works with mcp_portal_list_clients and sees only its client', { skip }, () => {
  const { token, payload } = makeMcpToken('List test', [A]);
  assert.match(token, /^gspm_[0-9a-f]{64}$/);
  assert.equal(payload.tokenSha256, sha(token));
  assert.ok(!JSON.stringify(payload).includes(token));
  const id = owner(register('List test', [A], payload.tokenSha256));
  assert.deepEqual(listClients(payload.tokenSha256), [{ customer_id: A, name: 'Client A' }]);
  const r = db.psql(`BEGIN; SET LOCAL ROLE anon; SELECT mcp_portal_list_documents('${payload.tokenSha256}', '${B}'); COMMIT;`);
  assert.notEqual(r.status, 0, 'the token reached another client');
  owner(`SELECT mcp_portal_revoke_token('${id}');`);
});

test('mcp-token: dry run rolls back, apply commits once, result has the id and count only', { skip }, async () => {
  const { token, payload } = makeMcpToken('Cornerstone portal test', [A]);
  const before = owner('SELECT count(*) FROM mcp_tokens');
  const store = memoryStore();
  const { dry, applied } = await dryThenApply(store, 'mcp-token', payload);
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  assert.deepEqual(dry.result.counts, { mcpToken: { clients: 1 } });
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  const id = applied.result.counts.mcpToken.id;
  assert.deepEqual(applied.result.counts, { mcpToken: { id, clients: 1 } });
  assert.equal(owner('SELECT count(*) FROM mcp_tokens'), String(Number(before) + 1));
  assert.equal(owner(`SELECT org_id FROM mcp_tokens WHERE id = '${id}'`), ORG);
  assert.equal(owner(`SELECT label FROM mcp_tokens WHERE id = '${id}'`), 'Cornerstone portal test');
  assert.deepEqual(listClients(payload.tokenSha256), [{ customer_id: A, name: 'Client A' }]);

  await store.setJSON('payload', envelope('mcp-token', 'apply', payload));
  const again = await tick(store);
  assert.equal(again.result.status, 'noop');
  assert.equal(owner('SELECT count(*) FROM mcp_tokens'), String(Number(before) + 1));

  // a fresh label is a fresh payload hash, but the token hash is already registered
  const relabel = { ...payload, label: 'Second try' };
  await store.setJSON('payload', envelope('mcp-token', 'dry-run', relabel));
  assert.equal((await tick(store)).result.reason, 'mcp-token-exists');

  const blob = JSON.stringify([...store.map.values(), dry.lines, applied.lines, again.lines]);
  assert.ok(!blob.includes(token), 'the token reached a result or log');
  assert.ok(!blob.includes(payload.tokenSha256), 'the token hash reached a result or log');
  assert.equal(store.map.has('payload'), false);
  owner(`SELECT mcp_portal_revoke_token('${id}');`);
});

test('mcp-token: unknown or mixed-org clients are refused with a fixed reason', { skip }, async () => {
  const before = owner('SELECT count(*) FROM mcp_tokens');
  for (const [ids, reason] of [[[A, MISSING], 'mcp-token-clients-unknown'], [[A, OTHER], 'mcp-token-clients-mixed-org']]) {
    const { payload } = makeMcpToken('Refused', ids);
    const { result } = await tick(memoryStore({ payload: envelope('mcp-token', 'dry-run', payload) }));
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, reason);
  }
  assert.equal(owner('SELECT count(*) FROM mcp_tokens'), before);
});

test('mcp-token: a payload with the token, or any other field, is refused and nothing is written', { skip }, async () => {
  const { token, payload } = makeMcpToken('Leaky', [A]);
  const before = owner('SELECT count(*) FROM mcp_tokens');
  const cases = [
    [{ ...payload, token }, 'mcp-token-raw-token'],
    [{ ...payload, label: `Leaky ${token}` }, 'mcp-token-raw-token'],
    [{ ...payload, tokenSha256: token }, 'mcp-token-raw-token'],
    [{ ...payload, secret: 'x' }, 'mcp-token-fields'],
    [{ label: payload.label, customerIds: payload.customerIds }, 'mcp-token-fields'],
    [{ ...payload, tokenSha256: payload.tokenSha256.toUpperCase() }, 'mcp-token-hash'],
    [{ ...payload, customerIds: [] }, 'mcp-token-clients'],
    [{ ...payload, customerIds: [A, A] }, 'mcp-token-clients'],
    [{ ...payload, label: ' ' }, 'mcp-token-label'],
  ];
  for (const [data, reason] of cases) {
    const store = memoryStore({ payload: envelope('mcp-token', 'dry-run', data) });
    const { result, lines } = await tick(store);
    assert.equal(result.reason, reason, JSON.stringify(Object.keys(data)));
    assert.equal(store.map.has('payload'), false, 'a refused payload was kept');
    assert.ok(!JSON.stringify([...store.map.values(), lines]).includes(token), 'the token reached a result or log');
  }
  assert.equal(owner('SELECT count(*) FROM mcp_tokens'), before);
});

test('mcp-token-revoke: dry run keeps the token, apply stops it, an unknown id is refused', { skip }, async () => {
  const { payload } = makeMcpToken('Revoke test', [B]);
  const id = owner(register('Revoke test', [B], payload.tokenSha256));
  const store = memoryStore();
  const { dry, applied } = await dryThenApply(store, 'mcp-token-revoke', { tokenId: id });
  assert.equal(dry.result.status, 'dry-run-ok', JSON.stringify(dry.result));
  assert.equal(applied.result.status, 'applied', JSON.stringify(applied.result));
  assert.deepEqual(applied.result.counts, { mcpTokenRevoke: { id, alreadyRevoked: false } });
  const r = db.psql(`BEGIN; SET LOCAL ROLE anon; SELECT mcp_portal_list_clients('${payload.tokenSha256}'); COMMIT;`);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /invalid or revoked token/);

  await store.setJSON('payload', envelope('mcp-token-revoke', 'dry-run', { tokenId: MISSING }));
  assert.equal((await tick(store)).result.reason, 'mcp-token-not-found');
  await store.setJSON('payload', envelope('mcp-token-revoke', 'dry-run', { tokenId: id, note: 'x' }));
  assert.equal((await tick(store)).result.reason, 'mcp-token-revoke-shape');
});

test('the modes are production-only and refused on a site that does not list them', { skip }, async () => {
  const { payload } = makeMcpToken('Staging', [A]);
  const store = memoryStore({ payload: envelope('mcp-token', 'dry-run', payload) });
  const result = await runOwnerImport({
    env: { OWNER_IMPORT_UNTIL: UNTIL, OWNER_IMPORT_SITE: 'gre1795-website-db-staging' }, context: STAGING, store,
    openPool: () => { throw new Error('opened the owner pool'); }, log: () => {}, now: NOW,
  });
  assert.equal(result.reason, 'mode-not-allowed');
});

test('validators are pure and fixed: SITES, payload shape', () => {
  assert.deepEqual(SITES['greatstone-home'].modes, ['tables', 'identities', 'mcp-token', 'mcp-token-revoke']);
  assert.ok(!SITES['gre1795-website-db-staging'].modes.some((m) => MODES.includes(m)));
  const { token, payload } = makeMcpToken('Pure', [A]);
  assert.deepEqual(Object.keys(payload).sort(), ['customerIds', 'label', 'tokenSha256']);
  assert.equal(validateMcpToken(payload), payload);
  assert.throws(() => validateMcpToken({ ...payload, token }), /mcp-token-raw-token/);
  assert.throws(() => validateMcpToken([payload]), /mcp-token-shape/);
  assert.throws(() => validateMcpTokenRevoke({ tokenId: 'nope' }), /mcp-token-revoke-shape/);
  assert.notEqual(makeMcpToken('Pure', [A]).token, token);
});
