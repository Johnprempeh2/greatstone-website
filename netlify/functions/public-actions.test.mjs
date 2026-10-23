import test from 'node:test';
import assert from 'node:assert/strict';
import { asPublicAnon } from './lib/public-actions.mjs';
import { makePopularityHandler } from './popularity.mjs';
import { makeServiceInquiryHandler } from './service-inquiry.mjs';

function fakePool(rows = []) {
  const calls = [];
  let released = false;
  const client = { query: async (sql, params) => { calls.push([sql, params]); return { rows }; }, release: () => { released = true; } };
  return { pool: { connect: async () => client }, calls, get released() { return released; } };
}

test('public request sets anon and identity/header claims inside a committed transaction', async () => {
  const db = fakePool([{ slug: 'example', views: 2, inquiries: 1 }]);
  const handler = makePopularityHandler({ pool: () => db.pool });
  const res = await handler(new Request('https://staging.test/api/popularity'), { ip: '192.0.2.1' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [{ slug: 'example', views: 2, inquiries: 1 }]);
  assert.deepEqual(db.calls.map(([sql]) => sql), [
    'BEGIN', 'SET LOCAL ROLE anon', "SELECT set_config('request.jwt.claims', $1, true)",
    "SELECT set_config('request.headers', $1, true)", 'SELECT slug, views, inquiries FROM service_popularity', 'COMMIT',
  ]);
  assert.deepEqual(JSON.parse(db.calls[2][1][0]), { role: 'anon', sub: null, email: null, email_verified: false });
  assert.deepEqual(JSON.parse(db.calls[3][1][0]), { 'x-forwarded-for': '192.0.2.1' });
  assert.equal(db.released, true);
});

test('public request rolls back and releases when the query fails', async () => {
  const calls = [];
  let released = false;
  const pool = { connect: async () => ({ query: async (sql) => {
    calls.push(sql);
    if (sql === 'SELECT fail') throw new Error('query failed');
  }, release: () => { released = true; } }) };
  await assert.rejects(asPublicAnon(pool, '', (c) => c.query('SELECT fail')));
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(released, true);
});

test('popularity bump and service inquiry keep their existing SQL contracts', async () => {
  const db = fakePool([{ id: 'inquiry-id' }]);
  const bump = makePopularityHandler({ pool: () => db.pool });
  const result = await bump(new Request('https://staging.test/api/popularity', { method: 'POST',
    body: JSON.stringify({ slug: 'example', kind: 'view' }) }), { ip: '192.0.2.2' });
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls.find(([sql]) => sql.includes('bump_service_popularity'))[1], ['example', 'view']);
  const inquiry = makeServiceInquiryHandler({ pool: () => db.pool });
  const saved = await inquiry(new Request('https://staging.test/api/service-inquiry', { method: 'POST',
    body: JSON.stringify({ services: [{ slug: 'example', name: 'Example' }], email: 'test@example.org' }) }),
  { ip: '192.0.2.2' });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).id, 'inquiry-id');
  assert.deepEqual(db.calls.find(([sql]) => sql.includes('submit_service_inquiry'))[1],
    ['[{"slug":"example","name":"Example"}]', null, 'test@example.org', null, null]);
});

test('invalid public writes never open a database connection', async () => {
  const pool = () => { throw new Error('must not connect'); };
  const bump = makePopularityHandler({ pool });
  const result = await bump(new Request('https://staging.test/api/popularity', { method: 'POST',
    body: JSON.stringify({ slug: '../bad', kind: 'view' }) }));
  assert.equal(result.status, 400);
  const inquiry = makeServiceInquiryHandler({ pool });
  const invalid = await inquiry(new Request('https://staging.test/api/service-inquiry', { method: 'POST',
    body: JSON.stringify({ services: [] }) }));
  assert.equal(invalid.status, 400);
});
