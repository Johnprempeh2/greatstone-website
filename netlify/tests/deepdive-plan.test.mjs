import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDeepdivePlanHandler } from '../functions/deepdive-plan.mjs';
import { deepdivePlan } from '../functions/lib/deepdive-plan.mjs';
import { normalisePlan } from '../../src/data/deepdive-schema.mjs';

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'staff@example.test', email_confirmed_at: '2026-01-01' };
const request = (body, token = 'valid') => new Request('https://example.test/api/deepdive-plan', {
  method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
});

test('record handler authenticates and rejects invalid writes before SQL', async () => {
  const handler = makeDeepdivePlanHandler({ pool: () => { throw Error('database reached'); }, verify: async (token) => token === 'valid' ? USER : null });
  assert.equal((await handler(request({ op: 'plan', args: { slug: '../other' } }))).status, 400);
  assert.equal((await handler(request({ op: 'edit', args: { slug: 'example', operation: { type: 'remove' } } }))).status, 400);
  assert.equal((await handler(request({ op: 'plan', args: { slug: 'example' } }, 'invalid'))).status, 401);
});

test('record handler sets verified transaction claims, commits, and rolls back failures', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push([sql, values]); return { rows: [] }; }, release: () => calls.push(['release']) };
  const handler = makeDeepdivePlanHandler({ pool: () => ({ connect: async () => client }), verify: async () => USER,
    query: async () => ({ can: true }) });
  assert.equal((await handler(request({ op: 'capability' }))).status, 200);
  assert.deepEqual(calls.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)", 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(calls[2][1][0]), { role: 'authenticated', sub: USER.id, email: USER.email, email_verified: true });
  calls.length = 0;
  const failing = makeDeepdivePlanHandler({ pool: () => ({ connect: async () => client }), verify: async () => USER,
    query: async () => { throw Error('fail'); }, log: () => {} });
  assert.equal((await failing(request({ op: 'plan', args: { slug: 'example' } }))).status, 503);
  assert.deepEqual(calls.slice(-2).map(([sql]) => sql), ['ROLLBACK', 'release']);
});

test('plan read, register and summaries use scoped SQL and parameterized slug', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push([sql, values]); return { rows: [] }; } };
  assert.equal(await deepdivePlan(client, 'plan', { slug: 'example' }), null);
  assert.deepEqual(calls[0][1], ['example']);
  assert.deepEqual(await deepdivePlan(client, 'engagements', {}), []);
  assert.deepEqual(await deepdivePlan(client, 'summaries', {}), {});
  assert.match(calls[1][0], /FROM deepdive_plans/);
});

test('versioned edits lock the row and reject stale versions before update', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push([sql, values]); return { rows: /app_staff_org/.test(sql) ? [{ org_id: USER.id }] : [{ plan: {}, row_version: 2 }] }; } };
  assert.deepEqual(await deepdivePlan(client, 'edit', { slug: 'example', version: 1, operation: { type: 'remove', id: 'x' } }), { conflict: true });
  assert.equal(calls.length, 2);
  assert.match(calls[1][0], /FOR UPDATE/);
});

test('a signed-in nonstaff user cannot create a record', async () => {
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); return { rows: [{ org_id: null }] }; } };
  assert.deepEqual(await deepdivePlan(client, 'create', { slug: 'example', plan: {} }), { forbidden: true });
  assert.deepEqual(calls, ['SELECT app_staff_org() AS org_id']);
});

test('create returns its version and a matching edit stores the server validated plan', async () => {
  const plan = normalisePlan({ engagement: { slug: 'example', client: 'Example', title: 'Record', stage: 'Open', access: 'Staff' } });
  const calls = [];
  const client = { query: async (sql, values) => {
    calls.push([sql, values]);
    if (/FOR UPDATE/.test(sql)) return { rows: [{ plan, row_version: 1 }] };
    if (/app_staff_org/.test(sql)) return { rows: [{ org_id: USER.id }] };
    return { rows: [{ plan: values?.[1] ? JSON.parse(values[1]) : plan, row_version: /UPDATE/.test(sql) ? 2 : 1 }] };
  } };
  assert.equal((await deepdivePlan(client, 'create', { slug: 'example', plan })).version, 1);
  const edited = await deepdivePlan(client, 'edit', { slug: 'example', version: 1,
    operation: { type: 'set_engagement', fields: { title: 'Updated record' } } });
  assert.equal(edited.version, 2);
  assert.equal(edited.plan.engagement.title, 'Updated record');
  assert.match(calls[3][0], /FOR UPDATE/);
  assert.match(calls[4][0], /UPDATE deepdive_plans/);
});
