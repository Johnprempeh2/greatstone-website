// GSAM for Mac (P4): the catalogue read from the hub's Stripe mirror, the Checkout Session builder, and the
// checkout function (sign-in, one subscription per customer, test keys only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueFor, catalogueFromPrices, checkoutParams } from '../functions/lib/gsam.mjs';
import { makeGsamCheckoutHandler } from '../functions/gsam-checkout.mjs';

const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const USER = 'd0000000-0000-4000-8000-000000000001';
const product = (id, kind, name, customer = '') => ({ id: 'prod_' + id, active: true, name, description: '',
  metadata: { gsam_item_id: id, gsam_kind: kind, gsam_customer: customer } });
const price = (id, prod, interval, amount) => ({ id, active: true, unit_amount: amount, currency: 'gbp', recurring: { interval }, product: prod });
const agents = product('m-agents', 'module', 'Agents');
const decisions = product('m-decisions', 'module', 'Decisions');
const office = product('p-office', 'package', 'Digital office');
const deal = product('d-one', 'deal', 'Deal for one customer', 'cus_mine');
const PRICES = [
  price('price_agents_m', agents, 'month', 1000), price('price_agents_y', agents, 'year', 10000),
  price('price_dec_m', decisions, 'month', 500),
  price('price_office_m', office, 'month', 1200), price('price_office_y', office, 'year', 12000),
  price('price_deal_m', deal, 'month', 900),
  price('price_other', { id: 'prod_x', active: true, name: 'Shop thing', metadata: {} }, 'month', 1),
];
const items = catalogueFromPrices(PRICES);
const build = (over) => checkoutParams({ items, itemIds: ['m-agents'], interval: 'month', stripeCustomerId: 'cus_mine',
  customerId: CUSTOMER, origin: 'https://site.example.test', ...over });

test('the catalogue keeps only the hub mirrored items, packages first, with a price per interval', () => {
  assert.deepEqual(items.map((item) => item.id), ['p-office', 'd-one', 'm-agents', 'm-decisions']);
  assert.deepEqual(items.find((item) => item.id === 'm-agents').prices.year, { id: 'price_agents_y', amount: 10000, currency: 'gbp' });
});

test('a deal is shown only to its own customer', () => {
  assert.ok(catalogueFor(items, 'cus_mine').some((item) => item.id === 'd-one'));
  assert.ok(!catalogueFor(items, 'cus_other').some((item) => item.id === 'd-one'));
  assert.ok(!catalogueFor(items, null).some((item) => item.id === 'd-one'));
  assert.ok(catalogueFor(items, 'cus_mine').every((item) => !('customer' in item)), 'never leaks whose deal it is');
});

test('builds a subscription session for the customer with the picked prices', () => {
  const params = build({ itemIds: ['m-agents', 'm-decisions'] });
  assert.equal(params.get('mode'), 'subscription');
  assert.equal(params.get('customer'), 'cus_mine');
  assert.equal(params.get('line_items[0][price]'), 'price_agents_m');
  assert.equal(params.get('line_items[1][price]'), 'price_dec_m');
  assert.equal(params.get('metadata[source]'), 'gsam');
  assert.equal(params.get('subscription_data[metadata][source]'), 'gsam');
  assert.equal(params.get('metadata[customer_id]'), CUSTOMER);
  assert.equal(params.get('success_url'), 'https://site.example.test/my-gsam?checkout=done');
  assert.equal(params.get('cancel_url'), 'https://site.example.test/my-gsam');
  assert.equal(build({ itemIds: ['p-office'], interval: 'year' }).get('line_items[0][price]'), 'price_office_y');
});

test('refuses a pick that cannot be one subscription', () => {
  assert.throws(() => build({ itemIds: [] }), /Pick a package/);
  assert.throws(() => build({ interval: 'week' }), /monthly or annual/);
  assert.throws(() => build({ itemIds: ['m-decisions'], interval: 'year' }), /annually/);
  assert.throws(() => build({ itemIds: ['p-office', 'm-agents'] }), /on its own/);
  assert.throws(() => build({ itemIds: ['d-one'], stripeCustomerId: 'cus_other' }), /not available/);
  assert.throws(() => build({ itemIds: ['price_agents_m'] }), /not available/, 'a raw Stripe price id is not an item');
});

// ─── The function ───

function fixture({ subs = [] } = {}) {
  const stripe = [];
  const client = { release() {}, async query(sql) {
    if (sql.includes('FROM users')) return { rows: [] };
    if (sql.includes('FROM customer_users')) return { rows: [{ user_id: USER, email: 'buyer@example.test', customer_id: CUSTOMER, name: 'Buyer', stripe_customer_id: 'cus_mine' }] };
    return { rows: [] };
  } };
  const fetchImpl = async (url, init) => {
    stripe.push({ url, init });
    if (url.includes('/v1/prices')) return Response.json({ data: PRICES });
    if (url.includes('/v1/subscriptions')) return Response.json({ data: subs });
    if (url.includes('/v1/checkout/sessions')) return Response.json({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc', livemode: false });
    return Response.json({}, { status: 404 });
  };
  return { stripe, pool: () => ({ connect: async () => client }), fetchImpl };
}
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', APP_SITE_ORIGIN: 'https://site.example.test' };
const post = (body, auth = true) => new Request('https://site.example.test/api/gsam/checkout', { method: 'POST',
  headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) }, body: JSON.stringify(body) });
const verify = async () => ({ id: USER, email: 'buyer@example.test', emailVerified: true });

test('a signed-in customer gets a test Checkout URL', async () => {
  const f = fixture();
  const handler = makeGsamCheckoutHandler({ env, verify, pool: f.pool, fetchImpl: f.fetchImpl, log: () => {} });
  const response = await handler(post({ itemIds: ['p-office'], interval: 'month' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_abc');
  const session = f.stripe.find((call) => call.url.endsWith('/v1/checkout/sessions'));
  assert.equal(new URLSearchParams(session.init.body).get('line_items[0][price]'), 'price_office_m');
});

test('needs sign-in, test keys, and refuses a second subscription', async () => {
  const f = fixture();
  const noAuth = makeGsamCheckoutHandler({ env, verify: async () => null, pool: f.pool, fetchImpl: f.fetchImpl, log: () => {} });
  assert.equal((await noAuth(post({ itemIds: ['p-office'], interval: 'month' }, false))).status, 401);
  const live = makeGsamCheckoutHandler({ env: { ...env, STRIPE_SECRET_KEY: 'sk_live_x' }, verify, pool: f.pool, fetchImpl: f.fetchImpl });
  assert.equal((await live(post({ itemIds: ['p-office'], interval: 'month' }))).status, 503);
  const has = fixture({ subs: [{ id: 'sub_1', status: 'active', metadata: { source: 'gsam' } }] });
  const second = makeGsamCheckoutHandler({ env, verify, pool: has.pool, fetchImpl: has.fetchImpl, log: () => {} });
  const response = await second(post({ itemIds: ['p-office'], interval: 'month' }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Manage billing/);
  assert.ok(!has.stripe.some((call) => call.url.endsWith('/v1/checkout/sessions')));
});

test('a cancelled earlier subscription does not block buying again', async () => {
  const f = fixture({ subs: [{ id: 'sub_old', status: 'canceled', metadata: { source: 'gsam' } }] });
  const handler = makeGsamCheckoutHandler({ env, verify, pool: f.pool, fetchImpl: f.fetchImpl, log: () => {} });
  assert.equal((await handler(post({ itemIds: ['m-agents'], interval: 'month' }))).status, 200);
});

test('a bad pick is a 400 with the reason, and no session is made', async () => {
  const f = fixture();
  const handler = makeGsamCheckoutHandler({ env, verify, pool: f.pool, fetchImpl: f.fetchImpl, log: () => {} });
  const response = await handler(post({ itemIds: ['m-decisions'], interval: 'year' }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /annually/);
  assert.ok(!f.stripe.some((call) => call.url.endsWith('/v1/checkout/sessions')));
});
