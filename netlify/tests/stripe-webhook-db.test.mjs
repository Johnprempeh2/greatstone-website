// The paid Stripe webhook on a throwaway real Postgres (lib/postgres.mjs), with every migration applied (GRE-2699).
// The mocked suite in stripe-webhook.test.mjs never parses the SQL, so a statement Postgres rejects rolled back every
// paid order on staging while the tests passed. This proves a paid session writes the order, its items and the paid
// reference on the mixed basket's enquiry, once, even when Stripe delivers the event again.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { makeStripeWebhookHandler } from '../functions/stripe-webhook.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const VENDOR = 'f6990000-0000-4000-8000-000000000001';
const OFFERING = 'f6990000-0000-4000-8000-000000000002';
const VARIANT = 'f6990000-0000-4000-8000-000000000003';
const SESSION = 'cs_test_gre2699paid';
const secret = 'whsec_test_fixture';
const at = 1_700_000_000;
const sign = (body) => `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;

let db;
let pool;
const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

before(async () => {
  if (skip) return;
  db = startPostgres('stripe-webhook-db');
  await db.migrate('003');
  owner(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day');`);
  await db.migrate();
  owner(`
    INSERT INTO vendors (id, org_id, slug, name, status) VALUES ('${VENDOR}', '${ORG}', 'v', 'Vendor', 'published');
    INSERT INTO offerings (id, org_id, type, vendor_id, slug, name, status, fulfilment)
      VALUES ('${OFFERING}', '${ORG}', 'product', '${VENDOR}', 'tool', 'Test tool', 'published', 'license');
    INSERT INTO offering_variants (id, org_id, offering_id, name) VALUES ('${VARIANT}', '${ORG}', '${OFFERING}', 'Test edition');
    INSERT INTO service_inquiries (org_id, services, contact_email, message) VALUES ('${ORG}',
      '[{"kind":"service","name":"Test service","quantity":1,"checkoutSessionId":"${SESSION}"}]', 'mixed@example.test',
      'Card checkout reference (payment pending): ${SESSION}');`);
  pool = new pg.Pool({ connectionString: db.url });
});

after(async () => { await pool?.end(); db?.stop(); });

test('a paid session writes the order, its items and the enquiry reference once', { skip }, async () => {
  const payload = JSON.stringify({ id: 'evt_test', livemode: false, type: 'checkout.session.completed',
    data: { object: { id: SESSION, payment_status: 'paid', currency: 'gbp', amount_total: 17280,
      payment_intent: 'pi_test_gre2699', metadata: { customer_email: 'mixed@example.test' } } } });
  const errors = [];
  const handler = makeStripeWebhookHandler({ env: { STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: 'sk_test_fixture' },
    now: () => at, pool: () => pool, log: (line) => errors.push(line), fetchImpl: async () => new Response(JSON.stringify({
      data: [{ quantity: 1, amount_subtotal: 14400, price: { unit_amount: 14400, product: { metadata: { variant_id: VARIANT } } } },
        { quantity: 1, amount_subtotal: 2880, price: { unit_amount: 2880, product: { metadata: {} } } }],
      has_more: false,
    }), { status: 200 }) });
  const deliver = () => handler(new Request('https://example.test/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': sign(payload) }, body: payload,
  }));

  assert.equal((await deliver()).status, 200, errors.join('\n'));
  assert.equal((await deliver()).status, 200, errors.join('\n'));
  assert.equal(owner(`SELECT status || ' ' || subtotal_minor || ' ' || total_minor FROM orders WHERE reference = '${SESSION}';`),
    'confirmed 14400 17280');
  assert.equal(owner(`SELECT count(*) || ' ' || sum(line_total_minor) FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.reference = '${SESSION}';`), '1 14400');
  const message = owner(`SELECT message FROM service_inquiries WHERE contact_email = 'mixed@example.test';`);
  assert.equal(message.split(`Paid order reference: ${SESSION}`).length - 1, 1, message);
});
