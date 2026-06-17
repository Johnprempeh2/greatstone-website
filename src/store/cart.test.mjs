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

const { addItem, setQty, removeItem, clearCart, cartCount, cartSubtotalMinor, getCart, startCheckout } = await import('./cart.mjs');

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

test('startCheckout rejects when the store URL/key is unconfigured (node env)', async () => {
  addItem(item('a', 1000));
  await assert.rejects(() => startCheckout(), /not configured/i);
});
