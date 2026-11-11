import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRequestQuoteHandler } from '../functions/request-quote.mjs';
import { makeStripeCheckoutHandler } from '../functions/stripe-checkout.mjs';

const variantId = '11111111-1111-4111-8111-111111111112';
const serviceVariantId = '11111111-1111-4111-8111-111111111113';
const offeringId = '22222222-2222-4222-8222-222222222222';
const basket = [{ variantId, quantity: 2 }];

function database(type = 'product', settings = { usd_to_gbp_display_rate: '1.25' }) {
  const calls = [];
  const pool = { connect: async () => ({
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM offering_variants')) return { rows: [
        { id: variantId, name: 'Edition', base_price_minor: '10000', offering_id: offeringId,
          offering_name: 'Offering', type: type === 'mixed' ? 'product' : type, status: 'published' },
        ...(type === 'mixed' ? [{ id: serviceVariantId, name: 'Service', base_price_minor: '10000',
          offering_id: offeringId, offering_name: 'Consultancy', type: 'service', status: 'published' }] : []),
      ] };
      if (sql.includes('FROM pricing_rules') || sql.includes('FROM pricing_rule_targets')) return { rows: [] };
      if (sql.includes('FROM org_settings')) return { rows: settings ? [settings] : [] };
      if (sql.includes('INSERT INTO quotes')) return { rows: [{ id: params[0], reference: 'Q-TEST' }] };
      if (sql.includes('po_upload_take_slot')) return { rows: [{ ok: true }] };
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

test('tampered paid request containing a service and tool is refused before Stripe', async () => {
  const db = database('mixed');
  let calls = 0;
  const handler = makeStripeCheckoutHandler({ env: { STRIPE_SECRET_KEY: 'sk_test_fixture',
    APP_SITE_ORIGIN: 'https://stage.example.test' }, pool: () => db.pool,
  fetchImpl: async () => { calls++; throw new Error('Stripe must not be called'); } });
  const response = await handler(new Request('https://stage.example.test/api/stripe-checkout', {
    method: 'POST', body: JSON.stringify({ items: [...basket, { variantId: serviceVariantId, quantity: 1 }] }),
  }));
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test('a PO upload is indexed in the visitor\'s own quote transaction, never as the worker role (GRE-1797)', async () => {
  const db = database();
  const blobs = new Map();
  const store = () => ({ set: async (key, bytes) => blobs.set(key, bytes), delete: async (key) => blobs.delete(key) });
  const po = { name: 'order.pdf', dataBase64: Buffer.from('%PDF-po').toString('base64') };
  const handler = makeRequestQuoteHandler({ pool: () => db.pool, verify: async () => null, store, log: () => {} });
  const result = await handler(new Request('https://stage.example.test/api/request-quote', { method: 'POST',
    body: JSON.stringify({ items: basket, contact: { email: 'buyer@example.test' }, poDocument: po }) }));
  assert.equal(result.status, 200);
  const quoteIndex = db.calls.findIndex(({ sql }) => sql.includes('INSERT INTO quotes'));
  const index = db.calls.findIndex(({ sql }) => sql === 'SELECT visitor_quote_po_index()');
  assert.ok(index > quoteIndex && index < db.calls.findIndex((call, i) => i > quoteIndex && call.sql === 'COMMIT'));
  assert.match(db.calls[quoteIndex].params[10], /^[0-9a-f-]{36}\/order\.pdf$/);
  assert.equal(db.calls.some(({ sql }) => sql.includes('service_role') || sql.includes('storage.objects')), false);
  assert.equal(blobs.size, 1);

  const failing = database('none');
  const pool = { connect: async () => { const client = await failing.pool.connect();
    return { ...client, query: async (sql, params) => { if (sql.includes('INSERT INTO quotes')) throw new Error('down'); return client.query(sql, params); } }; } };
  const failed = await makeRequestQuoteHandler({ pool: () => pool, verify: async () => null, store, log: () => {} })(
    new Request('https://stage.example.test/api/request-quote', { method: 'POST',
      body: JSON.stringify({ items: basket, contact: { email: 'buyer@example.test' }, poDocument: po }) }));
  assert.equal(failed.status, 503);
  assert.equal(blobs.size, 1, 'only the first quote\'s file is left');
  assert.ok(failing.calls.some(({ sql }) => sql === 'ROLLBACK'), 'the index row rolls back with the quote');
  assert.equal(failing.calls.some(({ sql }) => sql.includes('service_role') || sql.includes('storage.objects')), false);
});

// The shop currency (074): USD sells the stored dollar prices, no rate; anything else is today's pounds.
async function checkout(db) {
  let stripeParams;
  const handler = makeStripeCheckoutHandler({ env: { STRIPE_SECRET_KEY: 'sk_test_fixture',
    APP_SITE_ORIGIN: 'https://stage.example.test' }, pool: () => db.pool, verify: async () => null,
  fetchImpl: async (_url, init) => {
    stripeParams = init.body;
    return { ok: true, json: async () => ({ id: 'cs_test_abc123', livemode: false, url: 'https://checkout.stripe.com/test' }) };
  }, log: () => { throw new Error('Unexpected failure'); } });
  const response = await handler(new Request('https://stage.example.test/api/stripe-checkout', {
    method: 'POST', body: JSON.stringify({ items: basket }) }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return stripeParams;
}

test('a USD shop charges the stored dollar prices in usd, VAT included, with no rate', async () => {
  const params = await checkout(database('product', { usd_to_gbp_display_rate: '1.25', shop_currency: 'USD' }));
  assert.deepEqual([params.get('line_items[0][price_data][currency]'), params.get('line_items[0][price_data][unit_amount]'),
    params.get('line_items[1][price_data][currency]'), params.get('line_items[1][price_data][unit_amount]')], ['usd', '10000', 'usd', '4000']);
  // no rate needed in dollars
  const noRate = await checkout(database('product', { usd_to_gbp_display_rate: null, shop_currency: 'USD' }));
  assert.equal(noRate.get('line_items[0][price_data][unit_amount]'), '10000');
});

test('a missing or unreadable shop currency prices in pounds, as before', async () => {
  for (const shop_currency of [undefined, null, 'EUR', 'usd']) {
    const params = await checkout(database('product', { usd_to_gbp_display_rate: '1.25', shop_currency }));
    assert.deepEqual([params.get('line_items[0][price_data][currency]'), params.get('line_items[0][price_data][unit_amount]')], ['gbp', '8000'], String(shop_currency));
  }
});

test('a USD shop records a quote and its items in USD at the stored prices', async () => {
  const db = database('product', { usd_to_gbp_display_rate: '1.25', shop_currency: 'USD' });
  const handler = makeRequestQuoteHandler({ pool: () => db.pool, verify: async () => null,
    log: () => { throw new Error('Unexpected failure'); } });
  const result = await handler(new Request('https://stage.example.test/api/request-quote', {
    method: 'POST', body: JSON.stringify({ items: basket, contact: { email: 'buyer@example.test' } }) }));
  assert.equal(result.status, 200);
  const quote = db.calls.find(({ sql }) => sql.includes('INSERT INTO quotes'));
  const item = db.calls.find(({ sql }) => sql.includes('INSERT INTO quote_items'));
  assert.deepEqual([quote.params[8], quote.params[9], item.params[7], item.params[8], item.params[9]], ['USD', 20000, 10000, 10000, 'USD']);
  // and pounds by default
  const gbp = database();
  await makeRequestQuoteHandler({ pool: () => gbp.pool, verify: async () => null, log: () => {} })(new Request('https://stage.example.test/api/request-quote', {
    method: 'POST', body: JSON.stringify({ items: basket, contact: { email: 'buyer@example.test' } }) }));
  assert.equal(gbp.calls.find(({ sql }) => sql.includes('INSERT INTO quote_items')).params[9], 'GBP');
});
