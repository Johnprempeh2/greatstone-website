// GSAM for Mac (P4): what the website needs to sell GSAM and hand over its licence key.
// The hub (Greatstone's own GSAM, GSAM_FLEET_HUB=true) keeps the catalogue and mirrors every item to Stripe as one
// Product (metadata gsam_item_id, gsam_kind, gsam_customer) with one recurring Price per interval. The hub's own
// catalogue route is for its admins only, so the website reads the catalogue from those Stripe prices, with
// GSAM_CATALOGUE_JSON as a fallback (same item shape as catalogueFromPrices returns).
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export const GSAM_SOURCE = 'gsam';
/** Subscription states that still hold the customer's one GSAM subscription. */
const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

export async function stripeRequest(method, path, key, params, fetchImpl = fetch) {
  const query = params ? String(params) : '';
  const response = await fetchImpl('https://api.stripe.com/v1/' + path + (method === 'GET' && query ? '?' + query : ''), {
    method, headers: { authorization: 'Bearer ' + key, 'content-type': 'application/x-www-form-urlencoded' },
    ...(method === 'POST' ? { body: query } : {}),
  });
  if (!response.ok) throw new Error('Stripe API ' + response.status);
  return response.json();
}

/** Stripe prices (with product expanded) to catalogue items. Only active products the hub made. */
export function catalogueFromPrices(prices) {
  const items = new Map();
  for (const price of prices || []) {
    const product = price?.product;
    const meta = product?.metadata || {};
    if (!meta.gsam_item_id || product.active === false || price.active === false) continue;
    const interval = price.recurring?.interval;
    if (interval !== 'month' && interval !== 'year') continue;
    const item = items.get(meta.gsam_item_id) || { id: meta.gsam_item_id, kind: meta.gsam_kind || 'module',
      name: product.name || 'GSAM module', description: product.description || '', customer: meta.gsam_customer || null, prices: {} };
    item.prices[interval] = { id: price.id, amount: price.unit_amount, currency: price.currency };
    items.set(item.id, item);
  }
  const order = { package: 0, deal: 1, module: 2 };
  return [...items.values()].sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3) || a.name.localeCompare(b.name));
}

export async function loadCatalogue(env, fetchImpl = fetch) {
  if (env.STRIPE_SECRET_KEY) {
    const params = new URLSearchParams({ active: 'true', type: 'recurring', limit: '100' });
    params.append('expand[]', 'data.product');
    // ponytail: first 100 prices only; page with starting_after if the hub ever mirrors more than ~50 items.
    const items = catalogueFromPrices((await stripeRequest('GET', 'prices', env.STRIPE_SECRET_KEY, params, fetchImpl)).data);
    if (items.length) return items;
  }
  try {
    const fallback = JSON.parse(env.GSAM_CATALOGUE_JSON || '[]');
    return Array.isArray(fallback) ? fallback : [];
  } catch { return []; }
}

/** What one buyer may see and buy: every module and package, and only their own deals. */
export const catalogueFor = (items, stripeCustomerId) =>
  items.filter((item) => item.kind !== 'deal' || (stripeCustomerId && item.customer === stripeCustomerId))
    .map(({ customer, ...item }) => item);

/**
 * The Checkout Session for a pick. One package or deal, or one or more modules; every price on the same interval
 * (Stripe needs that for one subscription). Throws a message fit for the buyer when the pick is not valid.
 */
export function checkoutParams({ items, itemIds, interval, stripeCustomerId, customerId, origin }) {
  if (interval !== 'month' && interval !== 'year') throw new Error('Pick monthly or annual billing.');
  const ids = [...new Set(Array.isArray(itemIds) ? itemIds : [])];
  if (!ids.length || ids.length > 20) throw new Error('Pick a package or at least one module.');
  const visible = new Map(catalogueFor(items, stripeCustomerId).map((item) => [item.id, item]));
  const picked = ids.map((id) => visible.get(id));
  if (picked.some((item) => !item)) throw new Error('That item is not available. Refresh the page and pick again.');
  if (picked.some((item) => item.kind !== 'module') && picked.length > 1) throw new Error('A package is bought on its own.');
  const prices = picked.map((item) => item.prices?.[interval]);
  if (prices.some((price) => !price?.id)) throw new Error(`Not every item you picked is sold ${interval === 'year' ? 'annually' : 'monthly'}.`);
  if (new Set(prices.map((price) => price.currency)).size > 1) throw new Error('Those items are priced in different currencies.');
  const params = new URLSearchParams({ mode: 'subscription', customer: stripeCustomerId, client_reference_id: customerId,
    success_url: origin + '/my-gsam?checkout=done', cancel_url: origin + '/my-gsam',
    'metadata[source]': GSAM_SOURCE, 'metadata[customer_id]': customerId,
    'subscription_data[metadata][source]': GSAM_SOURCE, 'subscription_data[metadata][customer_id]': customerId });
  prices.forEach((price, i) => { params.set(`line_items[${i}][price]`, price.id); params.set(`line_items[${i}][quantity]`, '1'); });
  return params;
}

/** The customer's one GSAM subscription, if any. */
export async function currentSubscription(env, stripeCustomerId, fetchImpl = fetch) {
  const params = new URLSearchParams({ customer: stripeCustomerId, status: 'all', limit: '20' });
  const { data = [] } = await stripeRequest('GET', 'subscriptions', env.STRIPE_SECRET_KEY, params, fetchImpl);
  return data.find((sub) => sub.metadata?.source === GSAM_SOURCE && LIVE.has(sub.status))
    || data.find((sub) => sub.metadata?.source === GSAM_SOURCE) || null;
}
export const isLive = (sub) => !!sub && LIVE.has(sub.status);

/** Newer Stripe API versions keep the period end on each item. */
export function periodEnd(sub) {
  const ends = [sub?.current_period_end, ...(sub?.items?.data || []).map((item) => item.current_period_end)].filter(Number.isFinite);
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null;
}

// ─── Forwarding to the hub: Stripe's signature format, keyed with GSAM_BILLING_EVENTS_SECRET ───

export function signForHub(body, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  return `t=${nowSeconds},v1=${createHmac('sha256', secret).update(`${nowSeconds}.${body}`).digest('hex')}`;
}

// ─── Licence key at rest: AES-256-GCM, the customer id as associated data ───

export function encryptionKey(raw) {
  const text = String(raw || '').trim();
  const key = /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64');
  if (key.length !== 32) throw new Error('GSAM_LICENCE_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
  return key;
}

export function encryptLicence(plain, key, customerId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(customerId));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decryptLicence(stored, key, customerId) {
  if (!stored?.startsWith('v1:')) return null;
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(customerId));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
