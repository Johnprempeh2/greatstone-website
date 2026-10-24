import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRequestQuoteHandler } from '../functions/request-quote.mjs';
import { makeStripeCheckoutHandler } from '../functions/stripe-checkout.mjs';

const variantId = '11111111-1111-4111-8111-111111111112';
const offeringId = '22222222-2222-4222-8222-222222222222';
const basket = [{ variantId, quantity: 2 }];

function database() {
  const calls = [];
  const pool = { connect: async () => ({
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM offering_variants')) return { rows: [{ id: variantId, name: 'Edition', base_price_minor: '10000',
        offering_id: offeringId, offering_name: 'Offering', type: 'product', status: 'published' }] };
      if (sql.includes('FROM pricing_rules') || sql.includes('FROM pricing_rule_targets')) return { rows: [] };
      if (sql.includes('FROM org_settings')) return { rows: [{ usd_to_gbp_display_rate: '1.25' }] };
      if (sql.includes('INSERT INTO quotes')) return { rows: [{ id: params[0], reference: 'Q-TEST' }] };
      return { rows: [] };
    }, release: () => calls.push({ sql: 'release' }),
  }) };
  return { pool, calls };
}

test('guest quote is priced under anon and inserts quote plus items in one bound RLS transaction', async () => {
  const db = database();
  const handler = makeRequestQuoteHandler({ pool: () => db.pool, verify: async () => null,
    log: () => { throw new Error('Unexpected failure'); } });
  const result = await handler(new Request('https://stage.example.test/api/request-quote', {
    method: 'POST', body: JSON.stringify({ items: basket, contact: { email: 'buyer@example.test' } }),
  }));
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
  assert.equal((await result.json()).reference, 'Q-TEST');
  const quoteIndex = db.calls.findIndex(({ sql }) => sql.includes('INSERT INTO quotes'));
  assert.ok(quoteIndex > 0);
  assert.equal(db.calls[quoteIndex - 1].sql.startsWith('SELECT set_config'), true);
  assert.equal(db.calls[quoteIndex + 1].sql.includes('INSERT INTO quote_items'), true);
  assert.equal(db.calls[quoteIndex + 2].sql, 'COMMIT');
  assert.equal(db.calls[quoteIndex].sql.includes('customer_id'), false, 'anon has no customer column grant');
  const claims = JSON.parse(db.calls[quoteIndex - 1].params[0]);
  assert.equal(claims.role, 'anon');
  assert.equal(claims.visitor_quote, db.calls[quoteIndex].params[0]);
  assert.equal(db.calls[quoteIndex].params[9], 16000);
});

test('test checkout ignores browser prices and sends GBP plus VAT to Stripe', async () => {
  const db = database();
  let stripeParams;
  const handler = makeStripeCheckoutHandler({ env: { STRIPE_SECRET_KEY: 'sk_test_fixture',
    APP_SITE_ORIGIN: 'https://stage.example.test' }, pool: () => db.pool, verify: async () => null,
  fetchImpl: async (_url, init) => {
    stripeParams = init.body;
    return { ok: true, json: async () => ({ id: 'cs_test_abc123', livemode: false, url: 'https://checkout.stripe.com/test' }) };
  }, log: () => { throw new Error('Unexpected failure'); } });
  const response = await handler(new Request('https://stage.example.test/api/stripe-checkout', {
    method: 'POST', body: JSON.stringify({ items: [{ ...basket[0], unitMinor: 1 }], customerEmail: 'buyer@example.test',
      successUrl: 'https://evil.example/return' }),
  }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(stripeParams.get('line_items[0][price_data][unit_amount]'), '8000');
  assert.equal(stripeParams.get('line_items[1][price_data][unit_amount]'), '3200');
  assert.equal(stripeParams.get('success_url'), 'https://stage.example.test/#order-confirmed?session={CHECKOUT_SESSION_ID}');
  assert.equal(db.calls.filter(({ sql }) => sql === 'SET LOCAL ROLE anon').length, 1);
  assert.equal(db.calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
});

test('checkout refuses live Stripe configuration before opening the database', async () => {
  const handler = makeStripeCheckoutHandler({ env: { STRIPE_SECRET_KEY: 'sk_live_fixture' },
    pool: () => { throw new Error('database opened'); } });
  const response = await handler(new Request('https://stage.example.test/api/stripe-checkout', { method: 'POST' }));
  assert.equal(response.status, 503);
});
