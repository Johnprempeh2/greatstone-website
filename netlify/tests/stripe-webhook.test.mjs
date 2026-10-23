import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { makeStripeWebhookHandler, verifyStripeSignature } from '../functions/stripe-webhook.mjs';

const secret = 'whsec_test_fixture';
const sign = (body, at) => `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;

test('verifies the raw Stripe payload and rejects altered or old deliveries', () => {
  const body = JSON.stringify({ id: 'evt_test', livemode: false, type: 'unknown', data: { object: {} } });
  const at = 1_700_000_000;
  assert.deepEqual(verifyStripeSignature(body, sign(body, at), secret, at), JSON.parse(body));
  assert.equal(verifyStripeSignature(body + ' ', sign(body, at), secret, at), null);
  assert.equal(verifyStripeSignature(body, sign(body, at), secret, at + 301), null);
});

test('webhook rejects live events and missing test secrets before database access', async () => {
  const body = JSON.stringify({ id: 'evt_test', livemode: true, type: 'checkout.session.completed', data: { object: {} } });
  const at = 1_700_000_000;
  const handler = makeStripeWebhookHandler({ env: { STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: 'sk_test_fixture' },
    now: () => at, pool: () => { throw new Error('unexpected database access'); } });
  const response = await handler(new Request('https://example.test/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': sign(body, at) }, body,
  }));
  assert.equal(response.status, 400);
});

test('paid webhook uses the worker transaction and repeated delivery does not add order items', async () => {
  const at = 1_700_000_000;
  const variant = 'a0000000-0000-4000-8000-000000000001';
  const org = '11111111-1111-4111-8111-111111111111';
  const payload = JSON.stringify({ id: 'evt_test', livemode: false, type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_abc', payment_status: 'paid', currency: 'gbp', amount_total: 120,
      payment_intent: 'pi_test_abc', metadata: { customer_email: 'buyer@example.test' } } } });
  const commands = [];
  let orderCount = 0;
  const client = { release: () => commands.push('release'), query: async (sql, params) => {
    commands.push(sql);
    if (sql.includes('FROM offering_variants')) return { rows: [{ id: variant, name: 'Test edition',
      offering_id: 'a0000000-0000-4000-8000-000000000002', offering_name: 'Test offering', org_id: org }] };
    if (sql.includes('INSERT INTO orders')) return { rows: orderCount++ ? [] : [{ id: 'a0000000-0000-4000-8000-000000000003' }] };
    return { rows: [] };
  } };
  const handler = makeStripeWebhookHandler({ env: { STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: 'sk_test_fixture' },
    now: () => at, pool: () => ({ connect: async () => client }), fetchImpl: async () => new Response(JSON.stringify({
      data: [{ quantity: 1, amount_subtotal: 100, price: { unit_amount: 100,
        product: { metadata: { variant_id: variant } } } }], has_more: false,
    }), { status: 200 }) });
  const call = () => handler(new Request('https://example.test/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': sign(payload, at) }, body: payload,
  }));
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 200);
  assert.equal(commands.filter((sql) => sql.includes('INSERT INTO order_items')).length, 1);
  assert.equal(commands.filter((sql) => sql === 'SET LOCAL ROLE service_role').length, 2);
  assert.equal(commands.filter((sql) => sql === 'COMMIT').length, 2);
});
