import assert from 'node:assert/strict';
import test from 'node:test';
import { makePortalStoreHandler } from '../functions/portal-store.mjs';
import { portalStore } from '../functions/lib/portal-store.mjs';
import { staffStore } from '../functions/lib/staff-store.mjs';

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'member@example.test', email_confirmed_at: '2026-01-01' };
const ID = '00000000-0000-4000-8000-000000000002';
const req = (body, token = 'valid') => new Request('https://example.test/api/portal-store', {
  method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body),
});

test('portal handler rejects invalid requests before database access', async () => {
  const handler = makePortalStoreHandler({ pool: () => { throw new Error('database reached'); }, verify: async (token) => token === 'valid' ? USER : null });
  assert.equal((await handler(new Request('https://example.test/api/portal-store'))).status, 405);
  assert.equal((await handler(req({ op: 'delete' }))).status, 400);
  assert.equal((await handler(req({ op: 'job', args: { acceptanceId: 'bad' } }))).status, 400);
  assert.equal((await handler(req({ op: 'accept', args: { documentId: ID, name: 'A', title: 'B', confirmed: false } }))).status, 400);
  assert.equal((await handler(req({ op: 'overview' }, 'invalid'))).status, 401);
});

test('portal handler applies verified claims and commits; database failures roll back', async () => {
  const sql = [];
  const client = { query: async (statement, values) => { sql.push([statement, values]); return { rows: [] }; }, release: () => sql.push(['release']) };
  const handler = makePortalStoreHandler({ pool: () => ({ connect: async () => client }), verify: async () => USER,
    query: async () => ({ documents: [], acceptances: [], jobs: [], members: [] }) });
  assert.equal((await handler(req({ op: 'overview' }))).status, 200);
  assert.deepEqual(sql.map(([statement]) => statement), ['BEGIN', 'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)", 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(sql[2][1][0]), { role: 'authenticated', sub: USER.id, email: USER.email, email_verified: true });
  sql.length = 0;
  const failing = makePortalStoreHandler({ pool: () => ({ connect: async () => client }), verify: async () => USER,
    query: async () => { throw new Error('database failure'); }, log: () => {} });
  assert.equal((await failing(req({ op: 'overview' }))).status, 503);
  assert.deepEqual(sql.slice(-2).map(([statement]) => statement), ['ROLLBACK', 'release']);
});

test('client portal reads and acceptance use fixed queries with parameter values', async () => {
  const calls = [];
  const client = { query: async (statement, values) => { calls.push([statement, values]); return { rows: statement.includes('portal_accept(') ? [{ id: ID }] : [] }; } };
  const overview = await portalStore(client, 'overview');
  assert.deepEqual(Object.keys(overview), ['documents', 'acceptances', 'jobs', 'members']);
  assert.equal(calls.length, 4);
  calls.length = 0;
  await portalStore(client, 'accept', { documentId: ID, name: "O'Neil", title: 'Director', confirmed: true });
  assert.deepEqual(calls[0][1], [ID, "O'Neil", 'Director', true]);
  assert.deepEqual(calls[1][1], [ID]);
  calls.length = 0;
  await portalStore(client, 'receipt-document', { acceptanceId: ID });
  assert.deepEqual(calls[0][1], [ID]);
});

test('staff portal operations are limited to the listed tables and functions', async () => {
  const calls = [];
  const client = { query: async (statement, values) => { calls.push([statement, values]); return { rows: [{ data: true, org_id: ID }] }; } };
  assert.deepEqual(await staffStore(client, { kind: 'rpc', name: 'portal_is_approver' }), { data: true });
  await staffStore(client, { kind: 'rpc', name: 'portal_withdraw', args: { p_document_id: ID } });
  assert.deepEqual(calls.at(-1)[1], [ID]);
  assert.deepEqual((await staffStore(client, { kind: 'select', table: 'portal_documents', filters: [], columns: 'id' })).data, [true]);
  await assert.rejects(staffStore(client, { kind: 'select', table: 'portal_approvers', filters: [] }), /Invalid operation/);
});
