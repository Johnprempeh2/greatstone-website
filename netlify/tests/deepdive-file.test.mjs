import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDeepdiveFileHandler } from '../functions/deepdive-file.mjs';

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'staff@example.test', email_confirmed_at: '2026-01-01' };
const request = (method, body, id = '') => new Request(`https://example.test/api/deepdive-file?slug=demo${id ? `&id=${id}` : ''}`,
  { method, headers: { authorization: 'Bearer valid' }, body });

test('deep dive file requires an accessible plan before touching private bytes', async () => {
  let reached = false;
  const handler = makeDeepdiveFileHandler({ verify: async () => USER,
    pool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) }),
    store: () => { reached = true; throw new Error('unexpected'); } });
  assert.equal((await handler(request('GET', undefined, 'a'.repeat(12)))).status, 403);
  assert.equal(reached, false);
  assert.equal((await handler(request('GET', undefined, 'bad'))).status, 400);
  assert.equal((await handler(new Request('https://example.test/api/deepdive-file?slug=demo'))).status, 400);
});

test('deep dive file upload sniffs bytes and writes under the authorised slug', async () => {
  const sql = []; const writes = [];
  const handler = makeDeepdiveFileHandler({ verify: async () => USER,
    pool: () => ({ connect: async () => ({ query: async (statement, values) => {
      sql.push([statement, values]); return { rows: statement.startsWith('SELECT slug') ? [{ slug: 'demo' }] : [] };
    }, release: () => sql.push(['release']) }) }),
    store: () => ({ set: async (...args) => writes.push(args) }) });
  const result = await handler(request('POST', new TextEncoder().encode('%PDF-test')));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.match(body.id, /^a:[0-9a-f]{12}$/);
  assert.equal(body.mime, 'application/pdf');
  assert.equal(writes[0][0], `demo/${body.id.slice(2)}`);
  assert.deepEqual(sql.map(([statement]) => statement), ['BEGIN', 'SET LOCAL ROLE authenticated',
    "SELECT set_config('request.jwt.claims', $1, true)", 'SELECT slug FROM deepdive_plans WHERE slug=$1', 'COMMIT', 'release']);
  assert.deepEqual(sql[3][1], ['demo']);
});
