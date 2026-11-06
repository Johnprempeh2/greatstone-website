import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDeepdiveFileHandler } from '../functions/deepdive-file.mjs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'staff@example.test', email_confirmed_at: '2026-01-01' };
const request = (method, body, id = '') => new Request(`https://example.test/api/deepdive-file?slug=demo${id ? `&id=${id}` : ''}`,
  { method, headers: { authorization: 'Bearer valid' }, body });

test('deep dive file requires a visible RLS index row before touching private bytes', async () => {
  let reached = false;
  const handler = makeDeepdiveFileHandler({ verify: async () => USER,
    pool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) }),
    store: () => { reached = true; throw new Error('unexpected'); } });
  assert.equal((await handler(request('GET', undefined, 'a'.repeat(12)))).status, 404);
  assert.equal(reached, false);
  assert.equal((await handler(request('GET', undefined, 'bad'))).status, 400);
  assert.equal((await handler(new Request('https://example.test/api/deepdive-file?slug=demo'))).status, 400);
});

test('deep dive file upload sniffs bytes and writes under the authorised slug', async () => {
  const sql = []; const writes = [];
  const handler = makeDeepdiveFileHandler({ verify: async () => USER,
    pool: () => ({ connect: async () => ({ query: async (statement, values) => {
      sql.push([statement, values]); return { rows: statement.startsWith('SELECT slug') ? [{ slug: 'demo' }]
        : statement.includes('SELECT id FROM storage.objects') ? [{ id: 'indexed' }] : [] };
    }, release: () => sql.push(['release']) }) }),
    store: () => ({ set: async (...args) => writes.push(args) }) });
  const result = await handler(request('POST', new TextEncoder().encode('%PDF-test')));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.match(body.id, /^a:[0-9a-f]{12}$/);
  assert.equal(body.mime, 'application/pdf');
  assert.equal(writes[0][0], `demo/${body.id.slice(2)}`);
  assert.deepEqual(sql.map(([statement]) => statement), ['BEGIN', 'SET LOCAL ROLE authenticated',
    "SELECT set_config('request.jwt.claims', $1, true)", 'SELECT slug FROM deepdive_plans WHERE slug=$1',
    `INSERT INTO storage.objects (bucket_id,name,owner)\n            VALUES ('deepdive-files',$1,$2) ON CONFLICT (bucket_id,name) DO NOTHING`,
    `SELECT id FROM storage.objects\n            WHERE bucket_id='deepdive-files' AND name=$1`, 'COMMIT', 'release']);
  assert.deepEqual(sql[3][1], ['demo']);
});

test('migrated file policy: staff of the plan\'s org upload, read and delete; other orgs see nothing', { skip }, async () => {
  const db = startPostgres('dd-file');
  let pool;
  try {
    await db.migrate();
    const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES
      ('11111111-1111-4111-8111-111111111111','file-a','Test A'), ('22222222-2222-4222-8222-222222222222','file-b','Test B');
      INSERT INTO users(org_id,email,role,auth_subject) VALUES
      ('11111111-1111-4111-8111-111111111111','staff@example.test','admin','${USER.id}'),
      ('22222222-2222-4222-8222-222222222222','other@example.test','admin','00000000-0000-4000-8000-000000000002');
      INSERT INTO deepdive_plans(slug,org_id,plan) VALUES ('demo','11111111-1111-4111-8111-111111111111','{}'::jsonb);`);
    assert.equal(seed.status, 0, seed.stderr);
    pool = new pg.Pool({ connectionString: db.url, max: 1 });
    const blobs = new Map();
    const OTHER = { id: '00000000-0000-4000-8000-000000000002', email: 'other@example.test', email_confirmed_at: '2026-01-01' };
    const handler = makeDeepdiveFileHandler({ pool: () => pool, log: () => {},
      verify: async (token) => token === 'valid' ? USER : token === 'other' ? OTHER : null,
      store: () => ({ set: async (k, v) => blobs.set(k, v), get: async (k) => blobs.get(k) ?? null, delete: async (k) => blobs.delete(k) }) });
    const call = (who, method, body, id = '') => handler(new Request(`https://example.test/api/deepdive-file?slug=demo${id ? `&id=${id}` : ''}`,
      { method, headers: { authorization: `Bearer ${who}` }, body }));

    assert.equal((await call('other', 'POST', new TextEncoder().encode('%PDF-x'))).status, 403);
    assert.equal(blobs.size, 0);
    const { id } = await (await call('valid', 'POST', new TextEncoder().encode('%PDF-test'))).json();
    const bare = id.slice(2);
    assert.equal((await call('other', 'GET', undefined, bare)).status, 404);
    assert.equal(Buffer.from(await (await call('valid', 'GET', undefined, bare)).arrayBuffer()).toString(), '%PDF-test');
    assert.equal((await call('other', 'DELETE', undefined, bare)).status, 404);
    assert.equal((await call('valid', 'DELETE', undefined, bare)).status, 200);
    assert.equal(blobs.size, 0);
    assert.equal((await call('valid', 'GET', undefined, bare)).status, 404);
  } finally {
    await pool?.end();
    db.stop();
  }
});
