// The store basket — the single canonical cart. Keys by Supabase variant id and drives the real
// Stripe checkout + the quote request. Module singleton + useSyncExternalStore so the FAB, drawer and
// "Add" buttons across lazy store pages all share one source of truth without a provider.
// (The legacy prototype CartContext/CartDrawer was retired — this is the only cart now.)
import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase.mjs';

const KEY = 'gs_store_cart_v1';
export const MAX_QTY = 100;
const subs = new Set();

function read() {
  try { const r = localStorage.getItem(KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; }
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
export function setQty(variantId, qty) { commit(items.map((x) => (x.variantId === variantId ? { ...x, qty: clampQty(qty) } : x))); }
export function removeItem(variantId) { commit(items.filter((x) => x.variantId !== variantId)); }
export function clearCart() { if (items.length) commit([]); }
export function cartCount() { return items.reduce((n, x) => n + x.qty, 0); }
export function cartSubtotalMinor() { return items.reduce((s, x) => s + (x.unitMinor || 0) * x.qty, 0); }

// Drawer-open signal: lets "View basket" affordances on other store pages (e.g. the product page) open
// the cart drawer, which owns its own open state. Decoupled from the items store so opening the drawer
// never touches the basket contents.
const openSubs = new Set();
export function openCart() { openSubs.forEach((f) => f()); }
export function onOpenCart(f) { openSubs.add(f); return () => openSubs.delete(f); }

const SUPA_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
const ANON = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || '';

// Hand the basket to the edge function, which recomputes every price server-side (never trusts the
// client) + adds VAT, and returns a Stripe Checkout Session URL to redirect to. Throws on failure.
export async function startCheckout({ email } = {}) {
  const payload = getCart().map((x) => ({ variantId: x.variantId, quantity: x.qty }));
  if (!payload.length) throw new Error('Your basket is empty.');
  if (!SUPA_URL || !ANON) throw new Error('Store is not configured.');
  const base = location.origin + location.pathname;
  // Forward the buyer's JWT when signed in, so the edge fn can link the order to their account and
  // attach a Stripe Customer for saved cards. Falls back to the anon key for guest checkout.
  let token = ANON;
  try { const { data } = supabase ? await supabase.auth.getSession() : { data: {} }; if (data?.session?.access_token) token = data.session.access_token; } catch { /* guest */ }
  const res = await fetch(SUPA_URL + '/functions/v1/stripe-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      items: payload,
      customerEmail: email || undefined,
      successUrl: base + '#order-confirmed?session={CHECKOUT_SESSION_ID}',
      cancelUrl: base + '#shop',
    }),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout. Please try again or request a quote.');
  // dropped: items the server couldn't sell by card (POA / unpublished / sub-£1). Empty/absent on older
  // server builds, so callers degrade to the previous "just redirect" behaviour.
  return { url: data.url, dropped: Array.isArray(data.dropped) ? data.dropped : [] };
}

// Submit the basket as a B2B quote request (pay on invoice). Server captures indicative prices + the
// contact/PO details; staff finalise and invoice. Forwards the JWT so a signed-in buyer's quote links
// to their account. Returns the human quote reference (Q-YYYY-NNNNNN).
// poDocument (optional): { name, type, dataBase64 } — an uploaded PO the service-role edge fn stores in the
// private 'po-documents' bucket (migration 0026). Older server builds ignore the field, so it degrades to the
// online-PO + email fallback until request-quote is redeployed.
export async function requestQuote({ contact, poReference, message, poDocument } = {}) {
  const payload = getCart().map((x) => ({ variantId: x.variantId, quantity: x.qty }));
  if (!payload.length) throw new Error('Your basket is empty.');
  if (!SUPA_URL || !ANON) throw new Error('Store is not configured.');
  let token = ANON;
  try { const { data } = supabase ? await supabase.auth.getSession() : { data: {} }; if (data?.session?.access_token) token = data.session.access_token; } catch { /* guest */ }
  const res = await fetch(SUPA_URL + '/functions/v1/request-quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ items: payload, contact, poReference, message, poDocument: poDocument || undefined }),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !data.reference) throw new Error(data.error || 'Could not submit the quote request. Please try again.');
  return data.reference;
}
