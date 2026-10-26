import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, clientSnapshot, answerForClient } from '../functions/lib/deep-dive-client.mjs';
import { sendDeepDiveAnswer } from '../functions/lib/deep-dive-answer.mjs';
import { generateKeyPairSync, verify, createHash, randomBytes, sign } from 'node:crypto';
import { canonicalString, canonicalQuery, SCHEME_V2 } from '../functions/lib/admin-bridge-auth.mjs';
import { parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { makeDeepDiveClientHandler } from '../functions/deep-dive-client.mjs';
import { makeDeepDiveDocumentHandler, allowedDocument, allowedFileType } from '../functions/deep-dive-document.mjs';
import { asCustomer } from '../functions/lib/customer-store.mjs';
import { startPostgres, skip } from './lib/postgres.mjs';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ strict: false });
addFormats(ajv);
const contractFile = (name) => JSON.parse(readFileSync(new URL(`../../contracts/site-contract/${name}`, import.meta.url), 'utf8'));
const syncFixture = contractFile('fixtures/deep-dive-sync.json');
const answerFixture = contractFile('fixtures/document-request-answer.json');
const ackSchema = ajv.compile(contractFile('schemas/deep-dive-sync-ack.schema.json'));
const answerSchema = ajv.compile(contractFile('schemas/document-request-answer.schema.json'));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const I = '33333333-3333-4333-8333-333333333333';
const R = '44444444-4444-4444-8444-444444444444';
const payload = (tenantId = A) => ({ schema: 'gs-deep-dive-sync-v1', tenantId, tenantName: 'Test engagement',
  generatedAt: '2026-10-25T00:00:00Z', items: [{ id: I, type: 'deep_dive_stream', key: 'stream-1', title: 'Stream',
    summary: null, status: 'active', fields: {}, parentId: null, updatedAt: '2026-10-25T00:00:00Z' }],
  files: [], documentRequests: [{ id: R, title: 'Evidence', note: null, itemIds: [I], status: 'open',
    receivedAt: null, createdAt: '2026-10-25T00:00:00Z' }], deliverables: [] });

test('snapshot accepts the contract and rejects an Internal item and unrelated request', () => {
  assert.deepEqual(validateSnapshot(syncFixture.tenantId, syncFixture), syncFixture);
  assert.equal(validateSnapshot(A, payload()).items.length, 1);
  assert.throws(() => validateSnapshot(A, { ...payload(), items: [{ ...payload().items[0], visibility: 'internal' }] }));
  assert.throws(() => validateSnapshot(A, { ...payload(), documentRequests: [{ ...payload().documentRequests[0], itemIds: [B] }] }));
  assert.throws(() => validateSnapshot(B, payload()));
});

test('client read uses its mapped customer only', async () => {
  const calls = [];
  const db = { customer: A, query: async (sql, params) => { calls.push({ sql, params }); return { rows: db.customer === A ? [{ snapshot: payload() }] : [] }; } };
  assert.deepEqual(await clientSnapshot(db), payload());
  db.customer = B;
  assert.equal(await clientSnapshot(db), null);
  assert.match(calls[0].sql, /app_customer_id\(\)/);
  assert.deepEqual(calls[1].params, []);
});

test('answer is restricted to an open request in the signed-in customer tenant', async () => {
  const db = { customer: A, query: async (_sql, params) => ({ rows: db.customer === A ? [{ tenant_id: A, snapshot: payload() }] : [] }) };
  assert.equal((await answerForClient(db, R)).tenantId, A);
  db.customer = B;
  assert.equal(await answerForClient(db, R), null);
  db.customer = A;
  assert.equal(await answerForClient(db, B), null);
});

test('document gate requires the current shared item and matching bytes', () => {
  const snapshot = { ...payload(), files: [{ id: B, status: 'held' }],
    deliverables: [{ id: I, status: 'published' }] };
  assert.equal(allowedDocument(snapshot, { kind: 'collected', source_id: B }), true);
  assert.equal(allowedDocument(snapshot, { kind: 'deliverable', source_id: I }), true);
  assert.equal(allowedDocument({ ...snapshot, deliverables: [] }, { kind: 'deliverable', source_id: I }), false);
  assert.equal(allowedFileType('evidence.pdf', Buffer.from('%PDF-1.7')).mime, 'application/pdf');
  assert.equal(allowedFileType('evidence.png', Buffer.from('%PDF-1.7')), null);
  assert.equal(allowedFileType('evidence.html', Buffer.from('<script>alert(1)</script>')), null);
});

test('site callback signs the exact answer and leaves failed delivery pending', async () => {
  const pair = generateKeyPairSync('ed25519');
  const keyJson = JSON.stringify({ kid: 'stg-site-1', privateKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }) });
  const row = { tenant_id: A, request_id: R, answer_id: I, customer_id: B, name: 'Test client',
    email: 'test@example.invalid', note: 'Here is the answer.' };
  const fetchImpl = async (url, options) => {
    const bodySha256 = createHash('sha256').update(options.body).digest('hex');
    const h = options.headers;
    const canonical = canonicalString({ method: 'POST', host: url.host, path: url.pathname,
      time: h['x-gs-bridge-time'], nonce: h['x-gs-bridge-nonce'], actor: h['x-gs-bridge-actor'], bodySha256 });
    assert.equal(verify(null, Buffer.from(canonical), pair.publicKey, Buffer.from(h['x-gs-bridge-signature'], 'base64url')), true);
    assert.equal(h['x-gs-bridge-actor'], 'client:' + B);
    assert.equal(JSON.parse(options.body).answerId, I);
    assert.equal(answerSchema(JSON.parse(options.body)), true, JSON.stringify(answerSchema.errors));
    return Response.json({ ok: true, requestId: R });
  };
  assert.equal(await sendDeepDiveAnswer(row, { baseUrl: 'https://gsam.example.invalid', keyJson, fetchImpl }), true);
  assert.equal(answerSchema(answerFixture), true, JSON.stringify(answerSchema.errors));
  const fixtureRow = { ...row, answer_id: answerFixture.answerId, customer_id: answerFixture.answeredBy.customerId,
    name: answerFixture.answeredBy.name, email: answerFixture.answeredBy.email, note: answerFixture.note };
  assert.equal(await sendDeepDiveAnswer(fixtureRow, { baseUrl: 'https://gsam.example.invalid', keyJson,
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), answerFixture);
      return Response.json({ ok: true, requestId: R });
    } }), true);
  assert.equal(await sendDeepDiveAnswer(row, { baseUrl: 'https://gsam.example.invalid', keyJson,
    fetchImpl: async () => new Response('', { status: 503 }) }), false);
  assert.equal(await sendDeepDiveAnswer(row, { baseUrl: 'https://gsam.example.invalid', keyJson: '' }), false);
});

test('signed PUT replaces one tenant and RLS hides it from another customer', { skip }, async () => {
  const db = startPostgres('deep-dive-site');
  let pool;
  try {
    await db.migrate('003');
    const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const USER_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const USER_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const seed = db.psql(`INSERT INTO organisations (id,slug,name) VALUES ('${A}','test','Test');
      INSERT INTO customers (id,org_id,slug,name) VALUES
        ('${CUSTOMER_A}','${A}','one','Customer A'),('${CUSTOMER_B}','${A}','two','Customer B');
      INSERT INTO customer_users (org_id,customer_id,email,auth_subject) VALUES
        ('${A}','${CUSTOMER_A}','one@example.invalid','${USER_A}'),
        ('${A}','${CUSTOMER_B}','two@example.invalid','${USER_B}');`);
    assert.equal(seed.status, 0, seed.stderr);
    await db.migrate();
    const link = db.psql(`INSERT INTO deep_dive_tenant_links (tenant_id,customer_id,org_id)
      VALUES ('${A}','${CUSTOMER_A}','${A}');`);
    assert.equal(link.status, 0, link.stderr);
    pool = new pg.Pool({ connectionString: db.url });
    const pair = generateKeyPairSync('ed25519');
    const publicKey = pair.publicKey.export({ format: 'jwk' }).x;
    const readPair = generateKeyPairSync('ed25519');
    const keys = parseBridgeKeys(JSON.stringify([{ kid: 'stg-write-1', capability: 'write', publicKey },
      { kid: 'stg-read-1', capability: 'read', publicKey: readPair.publicKey.export({ format: 'jwk' }).x }]));
    const handler = makeAdminBridgeHandler({ pool: () => pool, keys, log: () => {} });
    const put = async (snapshot) => {
      const url = new URL(`https://site.example.invalid/api/admin/v1/deep-dive/tenants/${A}`);
      const body = JSON.stringify(snapshot);
      const time = Math.floor(Date.now() / 1000);
      const nonce = randomBytes(16).toString('base64url');
      const actor = 'system:test';
      const canonical = canonicalString({ method: 'PUT', host: url.host, path: url.pathname, time, nonce, actor,
        bodySha256: createHash('sha256').update(body).digest('hex') });
      return handler(new Request(url, { method: 'PUT', body,
        headers: { 'x-gs-bridge-key': 'stg-write-1', 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce,
          'x-gs-bridge-actor': actor, 'x-gs-bridge-signature': sign(null, Buffer.from(canonical), pair.privateKey).toString('base64url') } }));
    };
    const denied = await put({ ...payload(), items: [{ ...payload().items[0], visibility: 'internal' }] });
    assert.equal(denied.status, 400);
    const fixtureAccepted = await put(syncFixture);
    assert.equal(fixtureAccepted.status, 200);
    const ack = await fixtureAccepted.json();
    assert.equal(ackSchema(ack), true, JSON.stringify(ackSchema.errors));
    const accepted = await put(payload());
    assert.equal(accepted.status, 200);
    const read = (id) => asCustomer(pool, { id, email: null, email_verified: true }, clientSnapshot);
    assert.equal((await read(USER_A)).items[0].title, 'Stream');
    assert.equal(await read(USER_B), null);
    const blobs = new Map();
    const documentHandler = makeDeepDiveDocumentHandler({ pool: () => pool, keys,
      verify: async (token) => ({ id: token === 'one' ? USER_A : USER_B, email_confirmed_at: '2026-10-25' }),
      store: () => ({ set: async (key, bytes) => blobs.set(key, bytes),
        get: async (key) => blobs.get(key), delete: async (key) => blobs.delete(key) }), log: () => {} });
    const documentUrl = `https://site.example.invalid/api/deep-dive-document?requestId=${R}`;
    const upload = (token, name, bytes) => documentHandler(new Request(documentUrl, { method: 'POST', body: bytes,
      headers: { authorization: `Bearer ${token}`, 'x-file-name-encoded': Buffer.from(name).toString('base64url') } }));
    assert.equal((await upload('two', 'evidence.pdf', Buffer.from('%PDF-1.7'))).status, 404);
    assert.equal((await upload('one', 'evidence.png', Buffer.from('%PDF-1.7'))).status, 400);
    assert.equal((await upload('one', 'evidence.pdf', Buffer.from('%PDF-1.7'))).status, 201);
    const list = (token) => documentHandler(new Request('https://site.example.invalid/api/deep-dive-document',
      { headers: { authorization: `Bearer ${token}` } }));
    const saved = (await (await list('one')).json()).data;
    assert.equal(saved.length, 1);
    assert.equal((await (await list('two')).json()).data.length, 0);
    assert.equal((await documentHandler(new Request(`https://site.example.invalid/api/deep-dive-document?id=${saved[0].id}`,
      { headers: { authorization: 'Bearer two' } }))).status, 404);
    const ownDownload = await documentHandler(new Request(`https://site.example.invalid/api/deep-dive-document?id=${saved[0].id}`,
      { headers: { authorization: 'Bearer one' } }));
    assert.equal(ownDownload.status, 200);
    assert.equal(await ownDownload.text(), '%PDF-1.7');
    const shared = { ...payload(), files: [{ id: B, itemId: I, title: 'Collected', status: 'held' }],
      deliverables: [{ id: I, title: 'Report', status: 'published', publishedAt: '2026-10-25T00:00:00Z' }] };
    assert.equal((await put(shared)).status, 200);
    const bridgeCall = async (method, href, bytes, keyPair, kid, capability) => {
      const target = new URL(href);
      const time = Math.floor(Date.now() / 1000);
      const nonce = randomBytes(16).toString('base64url');
      const idempotencyKey = capability === 'write' ? randomBytes(16).toString('base64url') : null;
      const canonical = canonicalString({ scheme: capability === 'write' ? SCHEME_V2 : undefined,
        method, host: target.host, path: target.pathname, query: canonicalQuery(target.searchParams), time, nonce,
        actor: 'system:test', bodySha256: createHash('sha256').update(bytes).digest('hex'), idempotencyKey });
      return documentHandler(new Request(target, { method, body: method === 'GET' ? undefined : bytes,
        headers: { 'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce,
          'x-gs-bridge-actor': 'system:test', ...(idempotencyKey ? { 'x-gs-bridge-idempotency-key': idempotencyKey } : {}),
          'x-gs-bridge-signature': sign(null, Buffer.from(canonical), keyPair.privateKey).toString('base64url'),
          ...(method === 'PUT' ? { 'x-file-name': 'report.pdf' } : {}) } }));
    };
    const releaseUrl = `https://site.example.invalid/api/deep-dive-document?tenantId=${A}&sourceId=${I}&kind=deliverable`;
    assert.equal((await bridgeCall('PUT', releaseUrl, Buffer.from('%PDF-1.7'), pair, 'stg-write-1', 'write')).status, 200);
    const released = (await (await list('one')).json()).data.find((row) => row.kind === 'deliverable');
    assert.equal(released.file_name, 'report.pdf');
    assert.equal((await (await list('two')).json()).data.length, 0);
    const collectedUrl = `https://site.example.invalid/api/deep-dive-document?bridge=1&tenantId=${A}&requestId=${R}`;
    const collected = await bridgeCall('GET', collectedUrl, '', readPair, 'stg-read-1', 'read');
    assert.equal(collected.status, 200);
    assert.equal(await collected.text(), '%PDF-1.7');
    let deliver = false;
    const answerHandler = makeDeepDiveClientHandler({ pool: () => pool,
      verify: async (token) => ({ id: token === 'one' ? USER_A : USER_B, email: null, email_confirmed_at: '2026-10-25' }),
      send: async (row) => {
        assert.equal(row.request_id, R);
        assert.equal(row.file_name, 'evidence.pdf');
        if (deliver) assert.equal(row.note, 'An edited response');
        return deliver;
      }, log: () => {} });
    const answer = (token, op, note) => answerHandler(new Request('https://site.example.invalid/api/deep-dive-client', {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ op, requestId: R, ...(note ? { note } : {}) }),
    }));
    assert.equal((await answer('two', 'answer', 'A private response')).status, 404);
    const pending = await answer('one', 'answer', 'A test response');
    assert.equal(pending.status, 202);
    assert.equal((await pending.json()).data.status, 'pending');
    assert.equal(db.psql(`SELECT status FROM deep_dive_answers WHERE request_id='${R}'`).stdout.trim(), 'pending');
    const edited = await answer('one', 'answer', 'An edited response');
    assert.equal(edited.status, 202);
    assert.equal(db.psql(`SELECT note FROM deep_dive_answers WHERE request_id='${R}'`).stdout.trim(), 'An edited response');
    const customerSql = (sql) => db.psql(`BEGIN; SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"${USER_A}","email_verified":true}', true);
      ${sql} COMMIT;`);
    const forgedDocument = customerSql(`INSERT INTO deep_dive_documents
      (tenant_id,customer_id,source_id,kind,file_name,mime,byte_size,blob_key)
      VALUES ('${A}','${CUSTOMER_A}','${B}','client','forged.pdf','application/pdf',10,'forged');`);
    assert.notEqual(forgedDocument.status, 0, 'direct client metadata insert must fail');
    assert.match(forgedDocument.stderr, /permission denied/);
    const changeStatus = customerSql(`UPDATE deep_dive_answers SET status='received'
      WHERE request_id='${R}';`);
    assert.notEqual(changeStatus.status, 0, 'customer status update must fail');
    assert.match(changeStatus.stderr, /permission denied/);
    const forgedInsert = customerSql(`INSERT INTO deep_dive_answers
      (tenant_id,request_id,customer_id,customer_user_id,note,status)
      VALUES ('${A}','${B}','${CUSTOMER_A}','${USER_A}','Forged','received');`);
    assert.notEqual(forgedInsert.status, 0, 'customer must not set initial status');
    assert.match(forgedInsert.stderr, /permission denied/);
    assert.equal(db.psql(`SELECT status FROM deep_dive_answers WHERE request_id='${R}'`).stdout.trim(), 'pending');
    deliver = true;
    const received = await answer('one', 'retry');
    assert.equal(received.status, 200);
    assert.equal((await received.json()).data.status, 'received');
    assert.equal(db.psql(`SELECT status FROM deep_dive_answers WHERE request_id='${R}'`).stdout.trim(), 'received');
    assert.equal((await upload('one', 'later.pdf', Buffer.from('%PDF-1.7'))).status, 404);
    const withdrawn = await put({ ...payload(), items: [], documentRequests: [] });
    assert.equal(withdrawn.status, 200);
    assert.deepEqual((await read(USER_A)).items, []);
    const statusRollback = db.psql(readFileSync(new URL('../database/migrations/051_deep_dive_answer_status/rollback.sql', import.meta.url), 'utf8'));
    assert.equal(statusRollback.status, 0, statusRollback.stderr);
    const documentRollback = db.psql(readFileSync(new URL('../database/migrations/058_deep_dive_documents/rollback.sql', import.meta.url), 'utf8'));
    assert.equal(documentRollback.status, 0, documentRollback.stderr);
    const rollback = db.psql(readFileSync(new URL('../database/migrations/050_deep_dive_client/rollback.sql', import.meta.url), 'utf8'));
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.equal(db.psql("SELECT to_regclass('public.deep_dive_snapshots') IS NULL").stdout.trim(), 't');
  } finally { await pool?.end(); db.stop(); }
});
