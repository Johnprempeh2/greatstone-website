// GSAM admin bridge function (GRE-2323). The signing contract against the shared vectors (contracts/gs-bridge-v1,
// the same file in gs-agentic-manager), then signed requests through makeAdminBridgeHandler on a throwaway real
// Postgres (lib/postgres.mjs) with 048_gsam_bridge: a good request reads its rows and leaves an audit row, and each
// way a request can be wrong is refused with the right code. Without the Postgres server binaries the database tests
// are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { canonicalQuery, canonicalString, parseAllowedIps, parseBridgeKeys, verifyBridgeRequest } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url), 'utf8'));
const seedKey = (hex) => createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'pkcs8',
});
const PRIVATE = seedKey(CONTRACT.key.seedHex);
const KID = CONTRACT.key.kid;
const keysJson = (entries) => JSON.stringify(entries);
const KEYS = parseBridgeKeys(keysJson([
  { kid: KID, capability: 'read', publicKey: CONTRACT.key.publicKey },
  { kid: 'test-old-1', capability: 'read', publicKey: CONTRACT.key.publicKey, notAfter: '2020-01-01T00:00:00Z' },
  { kid: 'test-write-1', capability: 'write', publicKey: CONTRACT.key.publicKey },
]));
const ORIGIN = 'https://staging.example.test';
const ACTOR = 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278';
const RUN = '9ef9feeb-d13b-450d-b404-89a39e406161';

/** Signs a request the way GSAM's bridge client does. `tamper` changes headers after signing. */
function signed(path, { method = 'GET', kid = KID, key = PRIVATE, time = Math.floor(Date.now() / 1000), body = '',
  actor = ACTOR, run = RUN, host, nonce = randomBytes(16).toString('base64url'), tamper = {}, ip } = {}) {
  const u = new URL(path, ORIGIN);
  const canonical = canonicalString({ method, host: host || u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
    time, nonce, actor, run, bodySha256: createHash('sha256').update(body, 'utf8').digest('hex') });
  const headers = {
    'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), key).toString('base64url'),
    ...(run ? { 'x-gs-bridge-run': run } : {}), ...(ip ? { 'x-nf-client-connection-ip': ip } : {}), ...tamper,
  };
  return new Request(u, { method, headers, ...(method === 'GET' ? {} : { body }) });
}

test('the signing contract matches the shared vectors', () => {
  for (const v of CONTRACT.vectors) {
    const u = new URL(v.url);
    assert.equal(canonicalQuery(u.searchParams), v.expected.canonicalQuery, v.name);
    assert.equal(createHash('sha256').update(v.body, 'utf8').digest('hex'), v.expected.bodySha256, v.name);
    const canonical = canonicalString({ method: v.method, host: u.host, path: u.pathname, query: v.expected.canonicalQuery,
      time: v.time, nonce: v.nonce, actor: v.actor, run: v.run, bodySha256: v.expected.bodySha256 });
    assert.equal(canonical, v.expected.canonical, v.name);
    assert.equal(sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'), v.expected.signature, v.name);
    const headers = new Headers({ 'x-gs-bridge-key': KID, 'x-gs-bridge-time': String(v.time), 'x-gs-bridge-nonce': v.nonce,
      'x-gs-bridge-actor': v.actor, 'x-gs-bridge-signature': v.expected.signature, ...(v.run ? { 'x-gs-bridge-run': v.run } : {}) });
    const verifyIt = () => verifyBridgeRequest({ method: v.method, url: v.url, headers, body: v.body, keys: KEYS, nowSeconds: v.time });
    if (v.method === 'GET') assert.equal(verifyIt().kid, KID, v.name);
    else assert.throws(verifyIt, { code: 'capability_denied' }, v.name); // a read key cannot POST
  }
});

test('GSAM_BRIDGE_KEYS: a bad entry is left out and named, never trusted', () => {
  const logged = [];
  const keys = parseBridgeKeys(keysJson([
    { kid: KID, capability: 'read', publicKey: CONTRACT.key.publicKey },
    { kid: 'bad-cap-1', capability: 'admin', publicKey: CONTRACT.key.publicKey },
    { kid: 'bad-key-1', capability: 'read', publicKey: 'not a key' },
    { kid: KID, capability: 'read', publicKey: CONTRACT.key.publicKey },
  ]), (m) => logged.push(m));
  assert.deepEqual([...keys.keys()], [KID]);
  assert.equal(logged.length, 3);
  assert.equal(parseBridgeKeys('').size, 0);
  assert.equal(parseBridgeKeys('{').size, 0);
  assert.equal(parseAllowedIps(' 203.0.113.1, ,198.51.100.2').size, 2);
});

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CUST = 'd0000000-0000-4000-8000-000000000001';
const CUST_OTHER = 'd0000000-0000-4000-8000-000000000002';
const LIC = 'd4000000-0000-4000-8000-000000000001';
let db;
let pool;
let handler;
const logs = [];

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-fn');
  await db.migrate('003');
  const run = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  run(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  const orders = Array.from({ length: 5 }, (_, i) => `('d300000${i}-0000-4000-8000-000000000001', '${ORG}', 'O-${i}', '${CUST}', ${i % 2 ? `'INV-${i}'` : 'NULL'}, 'pi_${i}', now() - interval '${5 - i} minutes')`);
  run(`INSERT INTO customers (id, org_id, slug, name, stripe_customer_id) VALUES ('${CUST}', '${ORG}', 'acme', 'Acme', 'cus_secret'),
      ('${CUST_OTHER}', '${OTHER}', 'other', 'Other', 'cus_other');
    INSERT INTO customer_users (org_id, customer_id, email, auth_subject) VALUES ('${ORG}', '${CUST}', 'buyer@acme.test', 'sub-1');
    INSERT INTO orders (id, org_id, reference, customer_id, invoice_number, stripe_payment_intent, created_at) VALUES ${orders.join(',')},
      ('d3999999-0000-4000-8000-000000000001', '${OTHER}', 'O-X', '${CUST_OTHER}', 'INV-X', 'pi_x', now());
    INSERT INTO order_items (org_id, order_id, offering_name, unit_price_minor, line_total_minor)
      VALUES ('${ORG}', 'd3000000-0000-4000-8000-000000000001', 'Thing', 100, 100);
    INSERT INTO licence_keys (id, org_id, customer_id, offering_name, licence_key) VALUES ('${LIC}', '${ORG}', '${CUST}', 'Thing', 'FULL-SECRET-KEY-9Z8Y');
    INSERT INTO service_inquiries (org_id, contact_name, contact_email, contact_company, message, ip, attribution, created_at)
      VALUES ('${ORG}', 'Sam Buyer', 'sam@acme.test', 'Acme', 'Hello', '203.0.113.9',
        '{"page":"/services","first":{"utm_source":"news","utm_medium":"email","gclid":"x"}}', now() - interval '2 minutes');
    INSERT INTO front_door_leads (org_id, industry, company_name, contact_name, contact_email, consent_given, consent_at, consent_version, created_at)
      VALUES ('${ORG}', 'Retail', 'Shop Ltd', 'Alex', 'alex@shop.test', true, now(), 'front-door-consent-v1', now() - interval '1 minute'),
             ('${ORG}', 'Retail', 'No Email Ltd', NULL, NULL, NULL, NULL, NULL, now());`);
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m) });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req, h = handler) => { const res = await h(req); return { status: res.status, body: await res.json() }; };
const audit = (nonce) => db.psql(`SELECT actor_type || ':' || actor_id || ' ' || coalesce(gsam_run_id::text, '-') || ' ' || resource || ' ' || outcome || ' ' || row_count FROM admin_bridge_audit WHERE nonce = '${nonce}';`).stdout.trim();

test('health answers a signed request and records who asked', { skip }, async () => {
  const nonce = randomBytes(16).toString('base64url');
  const res = await call(signed('/api/admin/v1/health', { nonce }));
  assert.equal(res.status, 200);
  assert.deepEqual({ ...res.body, serverTime: undefined }, { ok: true, kid: KID, capability: 'read', serverTime: undefined, schema: 'gs-bridge-v1' });
  assert.equal(audit(nonce), `agent:d5651a41-e5e0-4512-8fb0-069815ff4278 ${RUN} health ok 0`);
  const sys = randomBytes(16).toString('base64url');
  assert.equal((await call(signed('/api/admin/v1/health', { nonce: sys, actor: 'system:website-enquiry-pull', run: null }))).status, 200);
  assert.equal(audit(sys), 'system:website-enquiry-pull - health ok 0');
  assert.equal((await call(signed('/api/admin/v1/health', { actor: 'robot:x' }))).body.error.code, 'bad_signature');
});

test('lists page on a cursor, read only the first organisation and never the Stripe ids', { skip }, async () => {
  const seen = [];
  let cursor = null;
  for (let i = 0; i < 5; i++) {
    const res = await call(signed(`/api/admin/v1/orders?limit=2${cursor ? `&cursor=${cursor}` : ''}`));
    assert.equal(res.status, 200);
    for (const o of res.body.items) {
      seen.push(o.reference);
      assert.equal(o.stripe_payment_intent, undefined);
    }
    cursor = res.body.nextCursor;
    if (!cursor) break;
  }
  assert.deepEqual(seen, ['O-0', 'O-1', 'O-2', 'O-3', 'O-4']);
  const inv = await call(signed('/api/admin/v1/invoices'));
  assert.deepEqual(inv.body.items.map((o) => o.invoice_number), ['INV-1', 'INV-3']);
  const cust = await call(signed('/api/admin/v1/customers'));
  assert.deepEqual(cust.body.items.map((c) => [c.name, c.stripe_customer_id, c.users.length]), [['Acme', undefined, 1]]);
  assert.equal(cust.body.items[0].users[0].auth_subject, undefined);
  const byCustomer = await call(signed(`/api/admin/v1/orders?customer=${CUST_OTHER}`));
  assert.deepEqual(byCustomer.body, { items: [], nextCursor: null });
});

test('get returns one row; a licence shows only its last four characters', { skip }, async () => {
  const res = await call(signed(`/api/admin/v1/licences/${LIC}`));
  assert.equal(res.status, 200);
  assert.equal(res.body.item.licence_key_last4, '9Z8Y');
  assert.equal(JSON.stringify(res.body).includes('FULL-SECRET'), false);
  const order = await call(signed('/api/admin/v1/orders/d3000000-0000-4000-8000-000000000001'));
  assert.equal(order.body.item.items.length, 1);
  // another organisation's row is not found, the same as a missing one
  assert.equal((await call(signed('/api/admin/v1/orders/d3999999-0000-4000-8000-000000000001'))).status, 404);
  assert.equal((await call(signed('/api/admin/v1/orders/not-a-uuid'))).status, 404);
});

test('enquiries come in GSAM\'s WebsiteEnquiry shape, only with an email', { skip }, async () => {
  const res = await call(signed('/api/admin/v1/enquiries'));
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);
  const [si, fd] = res.body.items;
  assert.match(si.id, /^si-/);
  assert.deepEqual({ name: si.name, email: si.email, org: si.organisationName, message: si.message, page: si.page, utm: si.utm, source: si.source },
    { name: 'Sam Buyer', email: 'sam@acme.test', org: 'Acme', message: 'Hello', page: '/services',
      utm: { utm_source: 'news', utm_medium: 'email' }, source: 'service-enquiry' });
  assert.equal(si.ip, undefined);
  assert.match(fd.id, /^fd-/);
  assert.equal(fd.organisationName, 'Shop Ltd');
  assert.deepEqual({ ...fd.consent, at: undefined }, { given: true, at: undefined, version: 'front-door-consent-v1' });
  const one = await call(signed(`/api/admin/v1/enquiries/${fd.id}`));
  assert.equal(one.body.item.email, 'alex@shop.test');
  assert.equal((await call(signed('/api/admin/v1/enquiries?customer=' + CUST))).status, 400);
});

test('a request is refused for each way it can be wrong', { skip }, async () => {
  const code = async (req, h) => { const r = await call(req, h); return `${r.status} ${r.body.error?.code}`; };
  const t = Math.floor(Date.now() / 1000);
  assert.equal(await code(signed('/api/admin/v1/health', { kid: 'test-unknown-1' })), '401 bad_key');
  assert.equal(await code(signed('/api/admin/v1/health', { kid: 'test-old-1' })), '401 bad_key');
  assert.equal(await code(signed('/api/admin/v1/health', { time: t - 61 })), '401 expired');
  assert.equal(await code(signed('/api/admin/v1/health', { time: t + 61 })), '401 expired');
  assert.equal(await code(signed('/api/admin/v1/health', { key: seedKey('ff'.repeat(32)) })), '401 bad_signature');
  assert.equal(await code(signed('/api/admin/v1/health', { host: 'greatstoneint.com' })), '401 bad_signature');
  assert.equal(await code(signed('/api/admin/v1/health', { tamper: { 'x-gs-bridge-actor': 'user:john' } })), '401 bad_signature');
  assert.equal(await code(signed('/api/admin/v1/health', { tamper: { 'x-gs-bridge-run': '00000000-0000-4000-8000-000000000000' } })), '401 bad_signature');
  assert.equal(await code(signed('/api/admin/v1/health', { tamper: { 'x-gs-bridge-nonce': randomBytes(16).toString('base64url') } })), '401 bad_signature');
  // a signature for one path, query or body does not fit another
  const good = signed('/api/admin/v1/orders?limit=2');
  const moved = (url) => new Request(new URL(url, ORIGIN), { headers: good.headers });
  assert.equal(await code(moved('/api/admin/v1/customers?limit=2')), '401 bad_signature');
  assert.equal(await code(moved('/api/admin/v1/orders?limit=3')), '401 bad_signature');
  assert.equal(await code(signed('/api/admin/v1/health', { method: 'POST', kid: 'test-write-1', body: '{}', tamper: {} })), '403 capability_denied');
  assert.equal(await code(signed('/api/admin/v1/health', { method: 'POST', body: '{}' })), '403 capability_denied');
  assert.equal(await code(signed('/api/admin/v1/health', { method: 'DELETE' })), '403 capability_denied');
  // replay: the same signed request twice
  const nonce = randomBytes(16).toString('base64url');
  const first = signed('/api/admin/v1/health', { nonce });
  const again = new Request(first.url, { headers: first.headers });
  assert.equal(await code(first), '200 undefined');
  assert.equal(await code(again), '401 replay');
  // with no keys configured, nothing gets in
  const empty = makeAdminBridgeHandler({ pool: () => pool, keys: parseBridgeKeys(''), allowedIps: new Set(), log: () => {} });
  assert.equal(await code(signed('/api/admin/v1/health'), empty), '401 bad_key');
  // the optional IP allow-list
  const listed = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: parseAllowedIps('203.0.113.7'), log: () => {} });
  assert.equal(await code(signed('/api/admin/v1/health', { ip: '198.51.100.1' }), listed), '403 ip_denied');
  assert.equal(await code(signed('/api/admin/v1/health'), listed), '403 ip_denied');
  assert.equal(await code(signed('/api/admin/v1/health', { ip: '203.0.113.7' }), listed), '200 undefined');
  // after the signature: unknown routes and bad parameters
  assert.equal(await code(signed('/api/admin/v1/users')), '404 not_found');
  assert.equal(await code(signed('/api/admin/v1/orders?limit=500')), '400 bad_request');
  assert.equal(await code(signed('/api/admin/v1/orders?cursor=%%%')), '400 bad_request');
  const typo = randomBytes(16).toString('base64url');
  assert.equal(await code(signed('/api/admin/v1/orders?custmer=x', { nonce: typo })), '400 bad_request');
  assert.match(audit(typo), / orders bad_request 0$/);
  // the caller learns the code only; the reason stays in the site log
  assert.ok(logs.some((m) => m.includes('refused (replay)')));
});
