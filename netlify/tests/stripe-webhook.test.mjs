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
