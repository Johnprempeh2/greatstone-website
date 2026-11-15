import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import pg from 'pg';
import { canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { makePortalPrototypesHandler } from '../functions/portal-prototypes.mjs';
import { asCustomer } from '../functions/lib/customer-store.mjs';
import { clientPrototypes, validatePrototypes } from '../functions/lib/portal-prototypes.mjs';
import { startPostgres, skip } from './lib/postgres.mjs';

// The client portal's Prototypes (John, 14 Nov): GSAM pushes one client's whole list; a client sees only their own
// organisation's, never another's, not even by naming an id; an empty push (unshared in GSAM) hides it.

const ORG = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const THUMB = 'data:image/jpeg;base64,' + Buffer.from('not really a jpeg').toString('base64');

const list = (customerId, prototypes = [{ id: 'proto-1', title: 'Supplier portal', description: 'First cut',
  url: 'https://supplier-portal.example.invalid', version: 2, updatedAt: '2026-11-14T10:00:00Z', thumbnail: THUMB }]) =>
  ({ schema: 'gs-portal-prototypes-v1', customerId, generatedAt: '2026-11-14T10:00:00Z', prototypes });

test('the list must be well formed, https only, for the client in the path', () => {
  assert.equal(validatePrototypes(CUSTOMER_A, list(CUSTOMER_A)).prototypes.length, 1);
  assert.throws(() => validatePrototypes(CUSTOMER_B, list(CUSTOMER_A)));
  const one = (patch) => list(CUSTOMER_A, [{ ...list(CUSTOMER_A).prototypes[0], ...patch }]);
  assert.throws(() => validatePrototypes(CUSTOMER_A, one({ url: 'http://supplier-portal.example.invalid' })));
  assert.throws(() => validatePrototypes(CUSTOMER_A, one({ url: 'javascript:alert(1)' })));
  assert.throws(() => validatePrototypes(CUSTOMER_A, one({ thumbnail: 'https://tracker.example.invalid/pixel.png' })));
  assert.throws(() => validatePrototypes(CUSTOMER_A, one({ thumbnail: 'data:image/jpeg;base64,' + 'A'.repeat(40000) })));
  assert.throws(() => validatePrototypes(CUSTOMER_A, one({ id: '../../etc' })));
  assert.throws(() => validatePrototypes(CUSTOMER_A, list(CUSTOMER_A, Array.from({ length: 51 }, (_, i) =>
    ({ ...list(CUSTOMER_A).prototypes[0], id: `p-${i}` })))));
});

test('the portal endpoint refuses a request without a session before touching the database', async () => {
  const handler = makePortalPrototypesHandler({ pool: () => { throw new Error('database should not be opened'); },
    verify: async () => null, log: () => {} });
  assert.equal((await handler(new Request('https://site.example.invalid/api/portal-prototypes'))).status, 401);
  assert.equal((await handler(new Request('https://site.example.invalid/api/portal-prototypes', { method: 'POST' }))).status, 405);
});

test('a signed push shows one client its prototypes, never another client, and an empty push hides them', { skip }, async () => {
  const db = startPostgres('portal-prototypes');
  let pool;
  try {
    await db.migrate('003');
    const seed = db.psql(`INSERT INTO organisations (id,slug,name) VALUES ('${ORG}','test','Test');
      INSERT INTO customers (id,org_id,slug,name) VALUES
        ('${CUSTOMER_A}','${ORG}','one','Northwind Test'),('${CUSTOMER_B}','${ORG}','two','Contoso Test');
      INSERT INTO customer_users (org_id,customer_id,email,auth_subject) VALUES
        ('${ORG}','${CUSTOMER_A}','one@example.invalid','${USER_A}'),
        ('${ORG}','${CUSTOMER_B}','two@example.invalid','${USER_B}');`);
    assert.equal(seed.status, 0, seed.stderr);
    await db.migrate();
    pool = new pg.Pool({ connectionString: db.url });
    const requestPool = { connect: () => pool.connect(), query: async () => { throw new Error('owner query on a request'); } };
    const write = generateKeyPairSync('ed25519');
    const read = generateKeyPairSync('ed25519');
    const keys = parseBridgeKeys(JSON.stringify([
      { kid: 'stg-write-1', capability: 'write', publicKey: write.publicKey.export({ format: 'jwk' }).x },
      { kid: 'stg-read-1', capability: 'read', publicKey: read.publicKey.export({ format: 'jwk' }).x }]));
    const bridge = makeAdminBridgeHandler({ pool: () => pool, keys, log: () => {} });
    const put = async (customerId, body, pair = write, kid = 'stg-write-1') => {
      const url = new URL(`https://site.example.invalid/api/admin/v1/portal-prototypes/clients/${customerId}`);
      const bytes = JSON.stringify(body);
      const time = Math.floor(Date.now() / 1000);
      const nonce = randomBytes(16).toString('base64url');
      const canonical = canonicalString({ method: 'PUT', host: url.host, path: url.pathname, time, nonce, actor: 'user:test',
        bodySha256: createHash('sha256').update(bytes).digest('hex') });
      return bridge(new Request(url, { method: 'PUT', body: bytes, headers: { 'x-gs-bridge-key': kid,
        'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': 'user:test',
        'x-gs-bridge-signature': sign(null, Buffer.from(canonical), pair.privateKey).toString('base64url') } }));
    };
    const portal = makePortalPrototypesHandler({ pool: () => requestPool, log: () => {},
      verify: async (token) => ({ id: token === 'one' ? USER_A : USER_B, email_confirmed_at: '2026-11-14' }) });
    const seen = async (token, query = '') => (await (await portal(new Request(`https://site.example.invalid/api/portal-prototypes${query}`,
      { headers: { authorization: `Bearer ${token}` } }))).json()).data;

    assert.equal((await put(CUSTOMER_A, list(CUSTOMER_A), read, 'stg-read-1')).status, 403, 'a read key cannot write');
    assert.equal((await put(CUSTOMER_A, list(CUSTOMER_B))).status, 400, 'the body must name the client in the path');
    assert.equal((await put('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', list('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'))).status, 404);

    const ok = await put(CUSTOMER_A, list(CUSTOMER_A));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, customerId: CUSTOMER_A, count: 1 });

    const mine = await seen('one');
    assert.equal(mine.length, 1);
    assert.deepEqual({ ...mine[0], updatedAt: undefined }, { id: 'proto-1', title: 'Supplier portal', description: 'First cut',
      url: 'https://supplier-portal.example.invalid', version: 2, thumbnail: THUMB, updatedAt: undefined });

    // Another client sees nothing: not through the endpoint, not with an id in the address, not by a direct query.
    assert.deepEqual(await seen('two'), []);
    assert.deepEqual(await seen('two', '?id=proto-1&customer=' + CUSTOMER_A), []);
    const guessed = await asCustomer(pool, { id: USER_B, email: null, email_verified: true }, async (client) =>
      (await client.query('SELECT * FROM portal_prototypes WHERE prototype_id=$1 OR customer_id=$2', ['proto-1', CUSTOMER_A])).rows);
    assert.deepEqual(guessed, []);
    const write2 = await asCustomer(pool, { id: USER_A, email: null, email_verified: true }, (client) =>
      client.query("DELETE FROM portal_prototypes").then(() => 'deleted', (error) => error.code));
    assert.equal(write2, '42501', 'a client cannot change the list');
    assert.equal((await asCustomer(pool, { id: USER_A, email: null, email_verified: true }, clientPrototypes)).length, 1);

    // Turned off in GSAM: the next push is the list without it, and the portal shows nothing.
    assert.equal((await put(CUSTOMER_A, list(CUSTOMER_A, []))).status, 200);
    assert.deepEqual(await seen('one'), []);
  } finally {
    await pool?.end();
    db.stop();
  }
});
