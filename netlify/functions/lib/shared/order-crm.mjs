// Shop orders to Pipedrive (GRE-6336, Ben 18 Jun and 1 Jul): each paid card order and each PO order (a quote whose
// invoice is issued) becomes a Person (deduped by email), an Organisation (deduped by name, when we know the
// company), and a Deal with the order's value and its products, so sales see every buyer next to the enquiries.
// Once per order: orders.pipedrive_synced_at is the claim (migration 077), as front_door_leads' is for leads.
// Dormant until PIPEDRIVE_API_TOKEN is set (crmConfig). Pure apart from fetch (injected), like front-door-crm.mjs.
// The deal value is the order's subtotal ex VAT, in the order's currency.

import { call, upsertPerson } from './front-door-crm.mjs';

const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const major = (minor) => Math.round(Number(minor || 0)) / 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A clean reference: a Stripe session id loses its cs_test_/cs_live_ prefix and secret tail (as in the order email).
export function orderLabel(order = {}) {
  const ref = String(order.reference || '');
  const short = /^cs_(test|live)_/.test(ref) ? ref.replace(/^cs_(test|live)_/, '').split('#')[0].slice(0, 12) : ref;
  return squash(order.invoiceNumber) || short;
}

export const orderDealTitle = (order = {}) =>
  `${order.kind === 'po' ? 'PO order' : 'Shop order'} ${orderLabel(order)}: ${squash(order.company).slice(0, 80) || squash(order.email)}`;

export function orderDealNote(order = {}) {
  const sym = { GBP: '£', USD: '$', EUR: '€' }[order.currency] || (order.currency + ' ');
  const money = (minor) => sym + major(minor).toFixed(2);
  const rows = [
    ['Paid by', order.kind === 'po' ? 'Purchase order (invoice)' : 'Card (Stripe)'],
    ['Order reference', order.reference],
    ['Invoice', order.invoiceNumber],
    ['PO number', order.poReference],
    ['Subtotal (ex VAT)', money(order.subtotalMinor)],
    ['Total (inc VAT)', money(order.totalMinor)],
  ].filter(([, v]) => squash(v));
  const items = (order.items || []).map((it) => `<li>${esc(squash(it.offering_name))}${it.variant_name ? ' · ' + esc(squash(it.variant_name)) : ''}`
    + ` × ${Number(it.qty) || 1}: ${esc(money(it.line_total_minor))}</li>`);
  return [
    `<p><b>${order.kind === 'po' ? 'PO order' : 'Shop order'}</b> from the website.</p>`,
    rows.map(([k, v]) => `<p>${esc(k)}: ${esc(squash(v))}</p>`).join(''),
    items.length ? `<p>Items:</p><ul>${items.join('')}</ul>` : '',
  ].join('');
}

async function searchId(cfg, fetchImpl, kind, term, field) {
  const found = await call(cfg, fetchImpl, 'GET', `/${kind}/search?term=${encodeURIComponent(term)}&fields=${field}&exact_match=true&limit=1`);
  const hit = found && Array.isArray(found.items) && found.items[0] && found.items[0].item;
  return hit && Number.isSafeInteger(Number(hit.id)) && Number(hit.id) > 0 ? Number(hit.id) : null;
}

async function upsertOrg(cfg, fetchImpl, name) {
  const id = await searchId(cfg, fetchImpl, 'organizations', name, 'name');
  if (id) return id;
  return Number((await call(cfg, fetchImpl, 'POST', '/organizations', { name })).id);
}

// One Pipedrive product per shop variant, found again by its code (the variant id); then the deal's line.
async function addProducts(cfg, fetchImpl, dealId, order) {
  for (const it of order.items || []) {
    const name = [squash(it.offering_name), squash(it.variant_name)].filter(Boolean).join(' · ').slice(0, 250) || 'Shop item';
    const code = squash(it.variant_id) || null;
    let productId = code ? await searchId(cfg, fetchImpl, 'products', code, 'code') : null;
    if (!productId) productId = Number((await call(cfg, fetchImpl, 'POST', '/products', {
      name, ...(code ? { code } : {}), prices: [{ price: major(it.unit_minor), currency: order.currency }],
    })).id);
    await call(cfg, fetchImpl, 'POST', `/deals/${dealId}/products`, {
      product_id: productId, item_price: major(it.unit_minor), quantity: Number(it.qty) || 1,
    });
  }
}

// `claim` returns 'claimed' | 'taken' | 'error'; `release` undoes it after a failure so a later call can try again;
// `save` records the Pipedrive ids. Never throws: the order and its email do not wait on the CRM.
export async function syncOrderToCrm({ config, order, claim, release, save, fetchImpl = (...a) => fetch(...a) }) {
  if (!config) return { synced: false, reason: 'not configured' };
  const email = squash(order && order.email).toLowerCase();
  if (!order || !EMAIL.test(email)) return { synced: false, reason: 'no contact' };
  let got;
  try { got = await claim(); } catch { got = 'error'; }
  if (got === 'taken') return { synced: true, reason: 'already synced' };
  if (got !== 'claimed') return { synced: false, reason: 'claim failed' };
  try {
    const company = squash(order.company).slice(0, 200);
    const orgId = company ? await upsertOrg(config, fetchImpl, company) : null;
    const person = await upsertPerson(config, fetchImpl,
      { contact_email: email, contact_name: squash(order.name).slice(0, 200) || email.split('@')[0] }, orgId);
    const deal = await call(config, fetchImpl, 'POST', '/deals', {
      title: orderDealTitle(order), value: major(order.subtotalMinor), currency: order.currency || 'GBP',
      person_id: person.id, ...(orgId ? { org_id: orgId } : {}), ...(config.stageId ? { stage_id: config.stageId } : {}),
    });
    const dealId = Number(deal.id);
    const missing = [];
    // the deal is the record; a missing line or note is reported, not undone
    try { await addProducts(config, fetchImpl, dealId, order); } catch { missing.push('products'); }
    try { await call(config, fetchImpl, 'POST', '/notes', { deal_id: dealId, content: orderDealNote(order) }); } catch { missing.push('note'); }
    try { await save({ personId: person.id, orgId, dealId }); } catch { /* ids are a convenience; the claim stands */ }
    return { synced: true, reason: missing.length ? 'synced without ' + missing.join(' and ') : 'synced', personId: person.id, orgId, dealId };
  } catch (e) {
    try { await release(); } catch { /* the log is the trace */ }
    return { synced: false, reason: String((e && e.message) || 'failed') };
  }
}
