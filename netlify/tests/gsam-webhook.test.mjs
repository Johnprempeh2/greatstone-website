// GSAM for Mac (P4): the website's Stripe webhook for GSAM. Signature, forwarding to the hub in Stripe's format,
// idempotency on the event id, and the licence key stored encrypted (never in clear) against the buying company.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeGsamWebhookHandler } from '../functions/gsam-webhook.mjs';
import { decryptLicence, encryptionKey, encryptLicence } from '../functions/lib/gsam.mjs';

const at = 1_700_000_000;
const stripeSecret = 'whsec_test_gsam';
const hubSecret = 'hub-billing-secret-fixture';
const encKey = 'a'.repeat(64);
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const env = { GSAM_STRIPE_WEBHOOK_SECRET: stripeSecret, STRIPE_SECRET_KEY: 'sk_test_fixture', GSAM_BILLING_EVENTS_SECRET: hubSecret,
  GSAM_HUB_URL: 'https://hub.example.test/', GSAM_LICENCE_ENCRYPTION_KEY: encKey };
const sign = (body, secret = stripeSecret, t = at) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const checkoutEvent = (id = 'evt_test_checkout', extra = {}) => JSON.stringify({ id, livemode: false, type: 'checkout.session.completed',
  created: at, data: { object: { id: 'cs_test_1', mode: 'subscription', payment_status: 'paid', customer: 'cus_test1',
    subscription: 'sub_test1', metadata: { source: 'gsam', customer_id: CUSTOMER }, ...extra } } });

/** An in-memory stand-in for the two tables and the customers lookup. */
function fakeDb() {
  const state = { events: new Map(), accounts: new Map(), sql: [] };
  const client = { release() {}, async query(sql, params = []) {
    state.sql.push(sql);
    if (sql.startsWith('SELECT outcome FROM gsam_billing_events')) return { rows: state.events.has(params[0]) ? [{ outcome: 'x' }] : [] };
    if (sql.startsWith('SELECT id FROM customers')) return { rows: params[0] === 'cus_test1' ? [{ id: CUSTOMER }] : [] };
    if (sql.includes('INSERT INTO gsam_accounts')) {
      const before = state.accounts.get(params[0]) || {};
      state.accounts.set(params[0], { stripe_customer_id: params[1], fleet_instance_id: params[2] ?? before.fleet_instance_id,
        licence_key_enc: params[3] ?? before.licence_key_enc, valid_until: params[5] ?? before.valid_until });
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO gsam_billing_events')) { if (!state.events.has(params[0])) state.events.set(params[0], params); return { rows: [] }; }
    return { rows: [] };
  } };
  return { state, pool: () => ({ connect: async () => client }) };
}

function hubFake(answer = { outcome: 'processed', instanceId: 'inst-1', validUntil: '2026-12-25T00:00:00.000Z',
  licenceKey: 'gsamlk_secretvalue123', licenceKeyExpiresAt: '2026-12-01T00:00:00.000Z' }, status = 200) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json(answer, { status }); } };
}

const deliver = (handler, body, header = sign(body)) => handler(new Request('https://site.example.test/api/gsam/stripe-webhook',
  { method: 'POST', headers: { 'stripe-signature': header }, body }));

test('refuses a bad or old Stripe signature and live events before the hub or database', async () => {
  const hub = hubFake();
  const handler = makeGsamWebhookHandler({ env, now: () => at, fetchImpl: hub.fetchImpl, pool: () => { throw new Error('database reached'); } });
  const body = checkoutEvent();
  assert.equal((await deliver(handler, body, sign(body, 'whsec_wrong'))).status, 400);
  assert.equal((await deliver(handler, body, sign(body, stripeSecret, at - 301))).status, 400);
  assert.equal((await deliver(handler, body + ' ', sign(body))).status, 400);
  const live = body.replace('"livemode":false', '"livemode":true');
  assert.equal((await deliver(handler, live)).status, 400);
  assert.equal(hub.calls.length, 0);
});

test('answers 503 when a setting is missing, so nothing is half-done', async () => {
  for (const missing of ['GSAM_STRIPE_WEBHOOK_SECRET', 'GSAM_BILLING_EVENTS_SECRET', 'GSAM_HUB_URL', 'GSAM_LICENCE_ENCRYPTION_KEY']) {
    const handler = makeGsamWebhookHandler({ env: { ...env, [missing]: '' }, now: () => at });
    assert.equal((await deliver(handler, checkoutEvent())).status, 503, missing);
  }
  const live = makeGsamWebhookHandler({ env: { ...env, STRIPE_SECRET_KEY: 'sk_live_x' }, now: () => at });
  assert.equal((await deliver(live, checkoutEvent())).status, 503);
});

test('forwards the raw event unchanged, signed for the hub in Stripe format', async () => {
  const hub = hubFake();
  const db = fakeDb();
  const handler = makeGsamWebhookHandler({ env, now: () => at, fetchImpl: hub.fetchImpl, pool: db.pool, log: () => {} });
  const body = checkoutEvent();
  const response = await deliver(handler, body);
  assert.equal(response.status, 200);
  assert.equal(hub.calls.length, 1);
  assert.equal(hub.calls[0].url, 'https://hub.example.test/api/fleet/billing/events');
  assert.equal(hub.calls[0].init.body, body, 'body forwarded byte for byte');
  const expected = `t=${at},v1=${createHmac('sha256', hubSecret).update(`${at}.${body}`).digest('hex')}`;
  assert.equal(hub.calls[0].init.headers['stripe-signature'], expected);
});

test('stores the licence key encrypted against the company and never in clear', async () => {
  const hub = hubFake();
  const db = fakeDb();
  const handler = makeGsamWebhookHandler({ env, now: () => at, fetchImpl: hub.fetchImpl, pool: db.pool, log: () => {} });
  const text = await (await deliver(handler, checkoutEvent())).text();
  assert.equal(JSON.parse(text).licenceStored, true);
  assert.doesNotMatch(text, /gsamlk_/, 'Stripe never sees the key in the answer');
  const row = db.state.accounts.get(CUSTOMER);
  assert.match(row.licence_key_enc, /^v1:/);
  assert.doesNotMatch(row.licence_key_enc, /gsamlk_/);
  assert.equal(decryptLicence(row.licence_key_enc, encryptionKey(encKey), CUSTOMER), 'gsamlk_secretvalue123');
  assert.throws(() => decryptLicence(row.licence_key_enc, encryptionKey(encKey), 'c0000000-0000-4000-8000-000000000002'),
    'the ciphertext is bound to its company');
  assert.equal(row.valid_until, '2026-12-25T00:00:00.000Z');
  assert.equal(row.fleet_instance_id, 'inst-1');
});

test('a repeated event is answered from the website record without reaching the hub again', async () => {
  const hub = hubFake();
  const db = fakeDb();
  const handler = makeGsamWebhookHandler({ env, now: () => at, fetchImpl: hub.fetchImpl, pool: db.pool, log: () => {} });
  assert.equal((await deliver(handler, checkoutEvent())).status, 200);
  const again = await deliver(handler, checkoutEvent());
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(hub.calls.length, 1);
  assert.equal(db.state.events.size, 1);
});

test('a later event with no key keeps the stored key', async () => {
  const db = fakeDb();
  const first = makeGsamWebhookHandler({ env, now: () => at, fetchImpl: hubFake().fetchImpl, pool: db.pool, log: () => {} });
  await deliver(first, checkoutEvent());
  const stored = db.state.accounts.get(CUSTOMER).licence_key_enc;
  const renewal = makeGsamWebhookHandler({ env, now: () => at, pool: db.pool, log: () => {},
    fetchImpl: hubFake({ outcome: 'processed', instanceId: 'inst-1', validUntil: '2027-01-25T00:00:00.000Z' }).fetchImpl });
  const body = JSON.stringify({ id: 'evt_test_invoice', livemode: false, type: 'invoice.paid', created: at,
    data: { object: { customer: 'cus_test1', subscription: 'sub_test1' } } });
  assert.equal((await deliver(renewal, body)).status, 200);
  assert.equal(db.state.accounts.get(CUSTOMER).licence_key_enc, stored);
  assert.equal(db.state.accounts.get(CUSTOMER).valid_until, '2027-01-25T00:00:00.000Z');
});

test('a hub failure answers 502 and records nothing, so Stripe retries', async () => {
  const db = fakeDb();
  const handler = makeGsamWebhookHandler({ env, now: () => at, pool: db.pool, log: () => {},
    fetchImpl: hubFake({ error: 'fleet_billing_not_configured' }, 503).fetchImpl });
  assert.equal((await deliver(handler, checkoutEvent())).status, 502);
  assert.equal(db.state.events.size, 0);
  const down = makeGsamWebhookHandler({ env, now: () => at, pool: db.pool, log: () => {}, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal((await deliver(down, checkoutEvent())).status, 500);
  assert.equal(db.state.events.size, 0);
});

test('shop checkouts and unhandled event types are acknowledged without reaching the hub', async () => {
  const hub = hubFake();
  const handler = makeGsamWebhookHandler({ env, now: () => at, fetchImpl: hub.fetchImpl, pool: () => { throw new Error('database reached'); } });
  const shop = checkoutEvent('evt_test_shop', { mode: 'payment', metadata: { source: 'greatstone-store' } });
  assert.equal((await deliver(handler, shop)).status, 200);
  const other = JSON.stringify({ id: 'evt_test_other', livemode: false, type: 'charge.refunded', created: at, data: { object: {} } });
  assert.equal((await deliver(handler, other)).status, 200);
  assert.equal(hub.calls.length, 0);
});

test('encryption round-trips and refuses a wrong key', () => {
  const key = encryptionKey(encKey);
  const sealed = encryptLicence('gsamlk_abc', key, CUSTOMER);
  assert.notEqual(sealed, encryptLicence('gsamlk_abc', key, CUSTOMER), 'a fresh IV each time');
  assert.equal(decryptLicence(sealed, key, CUSTOMER), 'gsamlk_abc');
  assert.throws(() => decryptLicence(sealed, encryptionKey('b'.repeat(64)), CUSTOMER));
  assert.throws(() => encryptionKey('short'));
});
