import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDeepdiveStateHandler } from '../functions/deepdive-state.mjs';
import { deepdiveState } from '../functions/lib/deepdive-state.mjs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'staff@example.test', email_confirmed_at: '2026-01-01' };
const request = (op, args = { slug: 'record' }) => new Request('https://example.test/api/deepdive-state', {
  method: 'POST', headers: { authorization: 'Bearer valid' }, body: JSON.stringify({ op, args }),
});

test('state handler rejects invalid requests before SQL and applies authenticated transaction claims', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push([sql, values]); return { rows: [] }; }, release: () => calls.push(['release']) };
  const handler = makeDeepdiveStateHandler({ pool: () => ({ connect: async () => client }), verify: async () => USER,
    query: async () => ({ ok: true }) });
  assert.equal((await handler(request('load', { slug: '../escape' }))).status, 400);
  assert.equal((await handler(request('attach', { slug: 'record', file: { id: '../escape', label: 'File', attachedTo: [] }, entries: [] }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await handler(request('load'))).status, 200);
  assert.deepEqual(calls.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)", 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(calls[2][1][0]), { role: 'authenticated', sub: USER.id, email: USER.email, email_verified: true });
});

test('item and history writes share a transaction, and a history failure rolls back', async () => {
  const calls = [];
  const client = { query: async (sql, values) => {
    calls.push([sql, values]);
    if (sql.includes('INSERT INTO deepdive_log')) throw Error('history unavailable');
    return { rows: sql.includes('FROM deepdive_plans') ? [{ slug: 'record' }] : [] };
  }, release: () => calls.push(['release']) };
  const handler = makeDeepdiveStateHandler({ pool: () => ({ connect: async () => client }), verify: async () => USER, log: () => {} });
  const response = await handler(request('items', { slug: 'record', items: [{ item_id: 'q1', status: 'done', visibility: 'internal', note: '' }],
    entries: [{ id: 'q1', changed: { status: ['open', 'done'] } }] }));
  assert.equal(response.status, 503);
  assert.match(calls[4][0], /INSERT INTO deepdive_item_state/);
  assert.match(calls[5][0], /INSERT INTO deepdive_log/);
  assert.deepEqual(calls.slice(-2).map(([sql]) => sql), ['ROLLBACK', 'release']);
});

test('load selects only approved file metadata and limits history', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push([sql, values]); return { rows: sql.includes('FROM deepdive_plans') ? [{ slug: 'record' }] : [] }; } };
  assert.deepEqual(await deepdiveState(client, 'load', { slug: 'record' }), { items: [], log: [], files: [], findings: [] });
  assert.equal(calls.length, 5);
  assert.match(calls[2][0], /LIMIT 500/);
  assert.doesNotMatch(calls[3][0], /original_name|storage_path/);
  assert.ok(calls.every(([, values]) => values[0] === 'record'));
});

test('file attachment is read back and release targets only the named item', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push([sql, values]); return { rows: sql.includes('FROM deepdive_plans') ? [{ slug: 'record' }] : [] }; } };
  await deepdiveState(client, 'attach', { slug: 'record', file: { id: 'a:123456abcdef', label: 'Evidence', attachedTo: ['q1'], at: '2026-01-01' }, entries: [] });
  assert.match(calls[1][0], /ON CONFLICT \(slug,id\)/);
  assert.equal(calls[1][1].at(-1), 'record/123456abcdef');
  assert.doesNotMatch(calls[2][0], /original_name|storage_path/);
  calls.length = 0;
  await deepdiveState(client, 'release', { slug: 'record', id: 'q1', entries: [] });
  assert.deepEqual(calls[1][1], ['record', 'q1']);
});

test('migrated RLS permits staff state and history, and isolates other users and organisations', { skip }, async () => {
  const db = startPostgres('dd-state');
  let pool;
  try {
    await db.migrate();
    const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES
      ('11111111-1111-4111-8111-111111111111','state-a','Test A'),
      ('22222222-2222-4222-8222-222222222222','state-b','Test B');
      INSERT INTO users(org_id,email,role,auth_subject) VALUES
      ('11111111-1111-4111-8111-111111111111','staff@example.test','admin','${USER.id}'),
      ('22222222-2222-4222-8222-222222222222','other@example.test','admin','00000000-0000-4000-8000-000000000002');
      INSERT INTO deepdive_plans(slug,org_id,plan) VALUES
      ('record','11111111-1111-4111-8111-111111111111','{}'::jsonb);`);
    assert.equal(seed.status, 0, seed.stderr);
    pool = new pg.Pool({ connectionString: db.url, max: 1 });
    const handler = makeDeepdiveStateHandler({ pool: () => pool, verify: async (token) => token === 'valid' ? USER :
      token === 'other' ? { id: '00000000-0000-4000-8000-000000000002', email: 'other@example.test', email_confirmed_at: '2026-01-01' } :
      { id: '00000000-0000-4000-8000-000000000003', email: 'buyer@example.test', email_confirmed_at: '2026-01-01' }, log: () => {} });
    const save = await handler(request('items', { slug: 'record', items: [{ item_id: 'q1', status: 'done', visibility: 'internal', note: '' }],
      entries: [{ id: 'q1', changed: { status: ['open', 'done'] } }] }));
    assert.equal(save.status, 200, await save.text());
    const own = await handler(request('load'));
    const data = (await own.json()).data;
    assert.equal(data.items[0].status, 'done');
    assert.equal(data.log[0].item_id, 'q1');
    const otherRequest = new Request(request('load'), { headers: { authorization: 'Bearer other' } });
    const other = await handler(otherRequest);
    assert.equal(other.status, 403);
    const buyerRequest = new Request(request('load'), { headers: { authorization: 'Bearer buyer' } });
    const buyer = await handler(buyerRequest);
    assert.equal(buyer.status, 403);
    const denied = await handler(new Request(request('items', { slug: 'record', items: [{ item_id: 'q2', status: 'done', visibility: 'shared', note: '' }], entries: [] }),
      { headers: { authorization: 'Bearer other' } }));
    assert.equal(denied.status, 403);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM deepdive_item_state')).rows[0].n, 1);
  } finally { await pool?.end(); db.stop(); }
});
