// /api/request-quote with a PO document, end to end on a real Postgres (GRE-3772, after 061's
// visitor_quote_po_index and 063's upload limit). The handler gets a request pool (lib/request-pool.mjs) that allows
// only anon and authenticated: no owner query and no service_role. A guest and a signed-in visitor both index their
// PO in the quote's own transaction; one IP gets ten PO uploads a day, taken before any bytes are stored; and a
// connection whose ROLLBACK fails goes back to the pool with the error, so it is not reused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { requestPool } from './lib/request-pool.mjs';
import { makeRequestQuoteHandler } from '../functions/request-quote.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const OFF = '0f000000-0000-4000-8000-000000000001';
const VAR = '0e000000-0000-4000-8000-000000000001';
const PDF = Buffer.from('%PDF-1.7 test purchase order').toString('base64');

let db, pool;
const blobs = new Map();
const store = () => ({ set: async (key, bytes) => blobs.set(key, bytes), delete: async (key) => blobs.delete(key) });
const owner = (sql) => {
  const r = db.psql(sql);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const handler = (p = requestPool(pool, ['anon', 'authenticated']), verify = async () => null) =>
  makeRequestQuoteHandler({ pool: () => p, verify, store, log: () => {} });
const send = (h, { ip = '203.0.113.1', po = true, headers = {} } = {}) => h(new Request('https://site.example.test/api/request-quote', {
  method: 'POST', headers: { 'x-nf-client-connection-ip': ip, ...headers },
  body: JSON.stringify({ items: [{ variantId: VAR, quantity: 1 }], contact: { email: 'buyer@example.test' },
    ...(po ? { poDocument: { name: 'order.pdf', dataBase64: PDF } } : {}) }),
}));
const indexed = (id) => owner(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'po-documents' AND name = '${id}/order.pdf';`);

before(async () => {
  if (skip) return;
  db = startPostgres('request-quote-po');
  await db.migrate('003');
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  await db.migrate();
  owner(`INSERT INTO org_settings (org_id, usd_to_gbp_display_rate) VALUES ('${ORG}', 1.25) ON CONFLICT (org_id) DO NOTHING;
    INSERT INTO offerings (id, org_id, type, slug, name, status) VALUES ('${OFF}', '${ORG}', 'service', 'test-published', 'Test Published', 'published');
    INSERT INTO offering_variants (id, org_id, offering_id, name, base_price_minor, currency) VALUES ('${VAR}', '${ORG}', '${OFF}', 'Test Variant', 500, 'GBP');`);
  pool = new pg.Pool({ connectionString: db.url });
});

after(async () => { await pool?.end(); db?.stop(); });

test('a guest quote with a PO runs as anon only and indexes the PO', { skip }, async () => {
  const p = requestPool(pool, ['anon', 'authenticated']);
  const response = await send(handler(p), { ip: '203.0.113.10' });
  assert.equal(response.status, 200, await response.clone().text());
  const { id } = await response.json();
  assert.deepEqual([...new Set(p.used)], ['anon']);
  assert.equal(indexed(id), '1');
  assert.ok(blobs.has(`${id}/order.pdf`));
});

test('a signed-in visitor indexes their PO the same way, as authenticated', { skip }, async () => {
  const p = requestPool(pool, ['anon', 'authenticated']);
  const verify = async () => ({ id: '00000000-0000-4000-8000-0000000000e1', email: 'signed.in@example.test', emailVerified: true });
  const response = await send(handler(p, verify), { ip: '203.0.113.12', headers: { authorization: 'Bearer signed-in' } });
  assert.equal(response.status, 200, await response.clone().text());
  const { id } = await response.json();
  assert.ok(p.used.includes('authenticated'), `roles used: ${p.used}`);
  assert.equal(indexed(id), '1');
});

test('one IP gets ten PO uploads a day; quotes without a PO and other IPs are not limited', { skip }, async () => {
  const h = handler();
  for (let i = 0; i < 10; i++) assert.equal((await send(h, { ip: '198.51.100.7' })).status, 200, `upload ${i + 1}`);
  const stored = blobs.size;
  const limited = await send(h, { ip: '198.51.100.7' });
  assert.equal(limited.status, 429);
  assert.equal(blobs.size, stored, 'a refused upload stores nothing');
  assert.equal((await send(h, { ip: '198.51.100.7', po: false })).status, 200);
  assert.equal((await send(h, { ip: '198.51.100.8' })).status, 200);
});

test('only anon can take a slot, and nobody reads the IP table', { skip }, () => {
  for (const role of ['authenticated', 'service_role']) {
    const r = db.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT po_upload_take_slot('192.0.2.1'); COMMIT;`);
    assert.notEqual(r.status, 0, `${role} cannot take a slot`);
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const r = db.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT count(*) FROM po_upload_rate; COMMIT;`);
    assert.notEqual(r.status, 0, `${role} cannot read po_upload_rate`);
  }
  owner(`UPDATE po_upload_rate SET created_at = now() - interval '25 hours' WHERE ip = '198.51.100.7';`);
  const r = db.psql(`BEGIN; SET LOCAL ROLE anon; SELECT po_upload_take_slot('198.51.100.7'); COMMIT;`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(owner(`SELECT count(*) FROM po_upload_rate WHERE created_at < now() - interval '1 day';`), '0', 'rows older than a day are gone');
});

test('a connection whose ROLLBACK fails is released with the error', { skip }, async () => {
  const released = [];
  const inner = requestPool(pool, ['anon', 'authenticated']);
  const broken = { query: inner.query, async connect() {
    const client = await inner.connect();
    return { query: async (sql, params) => {
      if (String(sql).includes('INSERT INTO quote_items')) throw Object.assign(new Error('down'), { code: '08006' });
      if (sql === 'ROLLBACK') { await client.query(sql); throw new Error('rollback failed'); }
      return client.query(sql, params);
    }, release: (error) => { released.push(error); return client.release(); } };
  } };
  const stored = blobs.size;
  const response = await send(handler(broken), { ip: '203.0.113.20' });
  assert.equal(response.status, 503);
  assert.equal(blobs.size, stored, 'the file was deleted');
  assert.equal(released.at(-1)?.message, 'rollback failed');
});
