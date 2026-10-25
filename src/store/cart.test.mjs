import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// cart.mjs reads/writes localStorage at module load + on every mutation, and imports
// useSyncExternalStore from react. Provide an in-memory localStorage before importing it.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { addItem, addService, setQty, removeItem, clearCart, cartCount, cartSubtotalMinor, getCart,
  paidLines, quoteLines, clearQuoteLines, startCheckout, requestBasketQuote } = await import('./cart.mjs');

const item = (id, unitMinor, extra = {}) => ({ variantId: id, offeringSlug: 's', name: 'N', edition: 'E', vendor: 'V', unitMinor, currency: 'GBP', ...extra });

beforeEach(() => clearCart());

test('addItem adds a new line, qty 1 by default', () => {
  addItem(item('a', 1000));
  assert.equal(getCart().length, 1);
  assert.equal(cartCount(), 1);
  assert.equal(getCart()[0].variantId, 'a');
});

test('addItem dedupes by variantId, accumulating qty, clamped to 100', () => {
  addItem(item('a', 1000), 2);
  addItem(item('a', 1000), 3);
  assert.equal(getCart().length, 1, 'same variant stays one line');
  assert.equal(getCart()[0].qty, 5);
  addItem(item('a', 1000), 200); // 5 + 200 → clamp 100
  assert.equal(getCart()[0].qty, 100);
});

test('addItem ignores items with no variantId', () => {
  addItem({ name: 'x' });
  addItem(null);
  assert.equal(getCart().length, 0);
});

test('addItem defaults currency to GBP', () => {
  addItem({ variantId: 'a', unitMinor: 500 });
  assert.equal(getCart()[0].currency, 'GBP');
});

test('setQty clamps to [1,100] and rounds', () => {
  addItem(item('a', 1000));
  setQty('a', 0); assert.equal(getCart()[0].qty, 1, 'floor at 1');
  setQty('a', 250); assert.equal(getCart()[0].qty, 100, 'cap at 100');
  setQty('a', 3.7); assert.equal(getCart()[0].qty, 4, 'rounds');
});

test('removeItem and clearCart', () => {
  addItem(item('a', 1000)); addItem(item('b', 2000));
  removeItem('a');
  assert.deepEqual(getCart().map((x) => x.variantId), ['b']);
  clearCart();
  assert.equal(getCart().length, 0);
});

test('cartCount sums qty; cartSubtotalMinor sums unit×qty', () => {
  addItem(item('a', 50900), 2); // £509 ×2
  addItem(item('b', 78000), 1); // £780 ×1
  assert.equal(cartCount(), 3);
  assert.equal(cartSubtotalMinor(), 50900 * 2 + 78000); // 179800
});

test('cart persists to localStorage under gs_store_cart_v1', () => {
  addItem(item('a', 1000), 2);
  const raw = JSON.parse(globalThis.localStorage.getItem('gs_store_cart_v1'));
  assert.equal(raw[0].variantId, 'a');
  assert.equal(raw[0].qty, 2);
});

test('startCheckout rejects an empty basket', async () => {
  await assert.rejects(() => startCheckout(), /basket is empty/i);
});

test('startCheckout sends the basket to the same-origin Netlify function', async () => {
  addItem(item('a', 1000));
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return Response.json({ url: 'https://checkout.stripe.com/test', dropped: [] });
  };
  try {
    assert.equal((await startCheckout()).url, 'https://checkout.stripe.com/test');
    assert.equal(requested.url, '/api/stripe-checkout');
    assert.deepEqual(JSON.parse(requested.options.body).items, [{ variantId: 'a', quantity: 1 }]);
  } finally { globalThis.fetch = originalFetch; }
});

test('services-only basket sends one quote request and makes no Stripe call', async () => {
  addService({ slug: 'website-build', name: 'Website build' });
  assert.equal(paidLines().length, 0);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true, id: 'inquiry-1' }); };
  try {
    assert.equal(await requestBasketQuote({ contact: { email: 'buyer@example.test' } }), 'inquiry-1');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/service-inquiry');
    assert.equal(requests[0].body.services[0].slug, 'website-build');
  } finally { globalThis.fetch = originalFetch; }
});

test('mixed basket sends only priced tool to Stripe and one quote with the full basket and order reference', async () => {
  addItem(item('tool-id', 1200), 2);
  addService({ slug: 'website-build', name: 'Website build' });
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json(url.includes('stripe') ? { url: 'https://checkout.stripe.com/test', id: 'cs_test_order' } : { ok: true, id: 'inquiry-2' });
  };
  try {
    const checkout = await startCheckout();
    await requestBasketQuote({ contact: { email: 'buyer@example.test' }, paidOrderReference: checkout.id });
    assert.deepEqual(requests[0].body.items, [{ variantId: 'tool-id', quantity: 2 }]);
    assert.equal(requests[1].body.services.length, 1);
    assert.equal(requests[1].body.services[0].checkoutSessionId, 'cs_test_order');
    assert.match(requests[1].body.message, /Website build/);
    assert.match(requests[1].body.message, /cs_test_order/);
    assert.equal(cartSubtotalMinor(), 2400);
  } finally { globalThis.fetch = originalFetch; }
});

test('sending the quote alone leaves priced tools available for a payment retry', () => {
  addItem(item('tool-id', 1200));
  addService({ slug: 'website-build', name: 'Website build' });
  clearQuoteLines();
  assert.deepEqual(getCart().map((x) => x.variantId), ['tool-id']);
  assert.equal(cartSubtotalMinor(), 1200);
});

test('an old saved service inquiry joins the existing saved tool basket once', async () => {
  store.set('gs_store_cart_v1', JSON.stringify([item('saved-tool', 1000, { qty: 1 })]));
  store.set('gs_service_inquiry_v1', JSON.stringify([{ slug: 'website-build', name: 'Website build' }]));
  const migrated = await import('./cart.mjs?legacy-migration-test');
  assert.equal(migrated.getCart().length, 2);
  assert.equal(migrated.getCart()[1].serviceSlug, 'website-build');
  assert.equal(store.has('gs_service_inquiry_v1'), false);
  assert.equal(JSON.parse(store.get('gs_store_cart_v1')).length, 2);
});
