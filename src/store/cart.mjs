// The store basket — the single canonical cart. Keys by catalogue variant id and drives the real
// Stripe checkout + the quote request. Module singleton + useSyncExternalStore so the FAB, drawer and
// "Add" buttons across lazy store pages all share one source of truth without a provider.
// (The legacy prototype CartContext/CartDrawer was retired — this is the only cart now.)
import { useSyncExternalStore } from 'react';
import { getSession } from '../lib/better-auth-client.mjs';

const KEY = 'gs_store_cart_v1';
export const MAX_QTY = 100;
const subs = new Set();

function read() {
  try {
    const r = localStorage.getItem(KEY);
    const a = r ? JSON.parse(r) : [];
    const old = JSON.parse(localStorage.getItem('gs_service_inquiry_v1') || '[]');
    const current = Array.isArray(a) ? a : [];
    if (!Array.isArray(old)) return current;
    for (const service of old) {
      if (!service?.slug || current.some((line) => line.serviceSlug === service.slug)) continue;
      current.push({ serviceSlug: service.slug, name: service.name || service.slug,
        category: service.category || '', qty: 1, kind: 'service' });
    }
    if (old.length) { localStorage.setItem(KEY, JSON.stringify(current)); localStorage.removeItem('gs_service_inquiry_v1'); }
    return current;
  }
  catch { return []; }
}
let items = read();

function commit(next) {
  items = next;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota — basket still works in-memory */ }
  subs.forEach((f) => f());
}
const clampQty = (q) => Math.max(1, Math.min(MAX_QTY, Math.round(Number(q) || 1)));

export function getCart() { return items; }
function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function useCart() { return useSyncExternalStore(subscribe, getCart, getCart); }

// it: { variantId, offeringSlug, name, edition, vendor, unitMinor, currency }
export function addItem(it, qty = 1) {
  if (!it || !it.variantId) return;
  const i = items.findIndex((x) => x.variantId === it.variantId);
  if (i >= 0) {
    const next = items.slice();
    next[i] = { ...next[i], qty: clampQty(next[i].qty + qty) };
    commit(next);
  } else {
    commit([...items, { ...it, currency: it.currency || 'GBP', qty: clampQty(qty) }]);
  }
}
export function addService(service) {
  if (!service?.slug || items.some((x) => x.serviceSlug === service.slug)) return;
  commit([...items, { kind: 'service', serviceSlug: service.slug, name: service.name || service.slug,
    category: service.category || '', qty: 1 }]);
}
export function removeService(slug) { commit(items.filter((x) => x.serviceSlug !== slug)); }
export function setQty(variantId, qty) { commit(items.map((x) => (x.variantId === variantId ? { ...x, qty: clampQty(qty) } : x))); }
export function removeItem(variantId) { commit(items.filter((x) => x.variantId !== variantId)); }
export function clearCart() { if (items.length) commit([]); }
export function clearQuoteLines() { if (quoteLines().length) commit(paidLines()); }
export function markQuoteLines(variantIds) {
  const ids = new Set(variantIds);
  if (ids.size) commit(items.map((line) => ids.has(line.variantId) ? { ...line, unitMinor: null } : line));
}
export function cartCount() { return items.reduce((n, x) => n + x.qty, 0); }
export function cartSubtotalMinor() { return items.reduce((s, x) => s + (x.kind === 'service' ? 0 : (x.unitMinor || 0) * x.qty), 0); }
export function paidLines() { return items.filter((x) => x.kind !== 'service' && Number.isInteger(x.unitMinor) && x.unitMinor > 0); }
export function quoteLines() { return items.filter((x) => x.kind === 'service' || !Number.isInteger(x.unitMinor) || x.unitMinor <= 0); }

// Drawer-open signal: lets "View basket" affordances on other store pages (e.g. the product page) open
// the cart drawer, which owns its own open state. Decoupled from the items store so opening the drawer
// never touches the basket contents.
const openSubs = new Set();
export function openCart() { openSubs.forEach((f) => f()); }
export function onOpenCart(f) { openSubs.add(f); return () => openSubs.delete(f); }


// Hand the basket to the Netlify function, which recomputes every price server-side (never trusts the
// client) + adds VAT, and returns a Stripe Checkout Session URL to redirect to. Throws on failure.
export async function startCheckout({ email } = {}) {
  const payload = paidLines().map((x) => ({ variantId: x.variantId, quantity: x.qty }));
  if (!payload.length) throw new Error('Your basket is empty.');
  // Better Auth's same-origin session cookie links a signed-in buyer; guests remain eligible.
  try { await getSession(); } catch { /* guest */ }
  const res = await fetch('/api/stripe-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: payload,
      customerEmail: email || undefined,
    }),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout. Please try again or request a quote.');
  // dropped: items the server couldn't sell by card (POA / unpublished / sub-£1). Empty/absent on older
  // server builds, so callers degrade to the previous "just redirect" behaviour.
  return { url: data.url, id: data.id, dropped: Array.isArray(data.dropped) ? data.dropped : [] };
}

// One structured enquiry contains every quote line and the full basket. The existing team inbox
// stores it under service inquiries; checkout session id links a mixed enquiry to its paid order.
export async function requestBasketQuote({ contact, message, paidOrderReference } = {}) {
  const quotes = quoteLines();
  if (!quotes.length) throw new Error('There are no quote items in your basket.');
  const services = quotes.map((x) => ({ slug: x.serviceSlug || x.offeringSlug || x.variantId,
    name: x.name, category: x.category || x.vendor || '', kind: x.kind === 'service' ? 'service' : 'tool',
    quantity: x.qty, checkoutSessionId: paidOrderReference || undefined }));
  const basket = getCart().map((x) => ({ name: x.name, kind: x.kind === 'service' ? 'service' : 'tool',
    quantity: x.qty, variantId: x.variantId || undefined, serviceSlug: x.serviceSlug || undefined }));
  const detail = [message || '', 'Basket: ' + JSON.stringify(basket),
    paidOrderReference ? 'Card checkout reference (payment pending): ' + paidOrderReference : ''].filter(Boolean).join('\n');
  const response = await fetch('/api/service-inquiry', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ services, name: contact?.name, email: contact?.email,
      company: contact?.company, message: detail }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send the quote request. Please try again.');
  return data.id;
}
