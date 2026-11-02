// Licence files and PO documents in Netlify Blobs, behind the storage.objects index under RLS (GRE-1992).
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { makeStoreFileHandler, safeFileName } from '../functions/store-file.mjs';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const CO = { a: 'c0000000-0000-4000-8000-00000000000a', b: 'c0000000-0000-4000-8000-00000000000b' };
const USERS = {
  staff: { id: '00000000-0000-4000-8000-000000000001', email: 'staff@example.test', email_confirmed_at: '2026-01-01' },
  a: { id: '00000000-0000-4000-8000-0000000000a1', email: 'buyer.a@example.test', email_confirmed_at: '2026-01-01' },
  b: { id: '00000000-0000-4000-8000-0000000000b1', email: 'buyer.b@example.test', email_confirmed_at: '2026-01-01' },
};
const PO = 'a1000000-0000-4000-8000-000000000001/order.pdf';
const url = (params) => 'https://example.test/api/store-file?' + new URLSearchParams(params);
const as = (who, method, params, body) => new Request(url(params), { method, body,
  headers: { authorization: `Bearer ${who}`, ...(body ? { 'x-file-name': Buffer.from('My key.lic').toString('base64') } : {}) } });

function memoryBlobs() {
  const buckets = {};
  const store = (bucket) => {
    buckets[bucket] ??= new Map();
    const map = buckets[bucket];
    return { set: async (key, bytes) => { map.set(key, Buffer.from(bytes)); },
      get: async (key) => map.get(key) ?? null, delete: async (key) => { map.delete(key); } };
  };
  return { store, buckets };
}

test('store-file refuses unknown buckets, writes outside licence files and bad paths before any query', async () => {
  let connected = false;
  const handler = makeStoreFileHandler({ verify: async () => USERS.staff,
    pool: () => ({ connect: async () => { connected = true; throw new Error('unexpected'); } }),
    store: () => { throw new Error('unexpected'); } });
  for (const [method, params] of [['GET', { bucket: 'portal-files', path: PO }], ['POST', { bucket: 'po-documents', customer: CO.a }],
    ['DELETE', { bucket: 'po-documents', path: PO }], ['GET', { bucket: 'po-documents', path: '../x' }],
    ['POST', { bucket: 'licence-files', customer: 'nope' }]])
    assert.equal((await handler(new Request(url(params), { method }))).status, 400, `${method} ${JSON.stringify(params)}`);
  assert.equal((await handler(new Request(url({ bucket: 'licence-files', path: PO }), { method: 'PUT' }))).status, 405);
  assert.equal(connected, false);
});

test('store-file reads the index in the claims transaction before the bytes', async () => {
  const sql = [];
  let read = false;
  const handler = makeStoreFileHandler({ verify: async () => USERS.staff,
    pool: () => ({ connect: async () => ({ query: async (statement, values) => { sql.push([statement, values]); return { rows: [] }; },
      release: () => sql.push(['release']) }) }),
    store: () => ({ get: async () => { read = true; return null; } }) });
  assert.equal((await handler(as('valid', 'GET', { bucket: 'po-documents', path: PO }))).status, 404);
  assert.equal(read, false);
  assert.deepEqual(sql.map(([statement]) => statement), ['BEGIN', 'SET LOCAL ROLE authenticated',
    "SELECT set_config('request.jwt.claims', $1, true)",
    'SELECT id FROM storage.objects WHERE bucket_id=$1 AND name=$2', 'COMMIT', 'release']);
  assert.deepEqual(sql[3][1], ['po-documents', PO]);
  assert.deepEqual(JSON.parse(sql[2][1][0]), { role: 'authenticated', sub: USERS.staff.id, email: USERS.staff.email, email_verified: true });
});

test('safeFileName keeps a short, plain name', () => {
  assert.equal(safeFileName('My key (1).lic'), 'My_key_1_.lic');
  assert.equal(safeFileName('../../etc'), '_._etc');
  assert.equal(safeFileName(''), 'licence.lic');
});

test('migrated file policies: staff write licence files, each buyer reads only their own, staff read PO documents', { skip }, async () => {
  const db = startPostgres('store-file');
  let pool;
  try {
    await db.migrate();
    const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES ('${ORG}','files','Test org');
      INSERT INTO users(org_id,email,role,auth_subject) VALUES ('${ORG}','${USERS.staff.email}','admin','${USERS.staff.id}');
      INSERT INTO customers(id,org_id,slug,name) VALUES ('${CO.a}','${ORG}','co-a','Company A'),('${CO.b}','${ORG}','co-b','Company B');
      INSERT INTO customer_users(org_id,customer_id,email,full_name,auth_subject,is_primary) VALUES
        ('${ORG}','${CO.a}','${USERS.a.email}','Buyer A','${USERS.a.id}',true),
        ('${ORG}','${CO.b}','${USERS.b.email}','Buyer B','${USERS.b.id}',true);
      INSERT INTO storage.objects(bucket_id,name) VALUES ('po-documents','${PO}');`);
    assert.equal(seed.status, 0, seed.stderr);
    pool = new pg.Pool({ connectionString: db.url, max: 1 });
    const blobs = memoryBlobs();
    await blobs.store('po-documents').set(PO, Buffer.from('%PDF-po'));
    const handler = makeStoreFileHandler({ pool: () => pool, store: blobs.store, log: () => {},
      verify: async (token) => USERS[token] ?? null });

    // a buyer cannot upload, even into their own folder; nothing reaches the store
    assert.equal((await handler(as('a', 'POST', { bucket: 'licence-files', customer: CO.a }, 'KEY'))).status, 403);
    assert.equal(blobs.buckets['licence-files'].size, 0);

    const upload = await handler(as('staff', 'POST', { bucket: 'licence-files', customer: CO.a }, 'KEY-A'));
    assert.equal(upload.status, 200);
    const { path } = await upload.json();
    assert.match(path, new RegExp(`^${CO.a}/[0-9a-f-]{36}-My_key.lic$`));

    const read = async (who, bucket, file) => handler(as(who, 'GET', { bucket, path: file }));
    assert.equal(await (await read('a', 'licence-files', path)).text(), 'KEY-A');
    assert.equal((await read('b', 'licence-files', path)).status, 404, 'another company cannot read it');
    assert.equal(await (await read('staff', 'licence-files', path)).text(), 'KEY-A');
    assert.equal(await (await read('staff', 'po-documents', PO)).text(), '%PDF-po');
    assert.equal((await read('a', 'po-documents', PO)).status, 404, 'buyers do not read PO documents');

    assert.equal((await handler(as('a', 'DELETE', { bucket: 'licence-files', path }))).status, 404, 'buyers cannot delete');
    assert.equal(blobs.buckets['licence-files'].size, 1);
    assert.equal((await handler(as('staff', 'DELETE', { bucket: 'licence-files', path }))).status, 200);
    assert.equal(blobs.buckets['licence-files'].size, 0);
    assert.equal((await read('a', 'licence-files', path)).status, 404);
  } finally {
    await pool?.end();
    db.stop();
  }
});
