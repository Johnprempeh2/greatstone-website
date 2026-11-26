import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crmConfig } from './front-door-crm.mjs';
import { orderDealNote, orderDealTitle, orderLabel, syncOrderToCrm } from './order-crm.mjs';

const VARIANT = 'a0000000-0000-4000-8000-000000000001';
const card = {
  kind: 'card', reference: 'cs_test_a1b2c3d4e5f6g7h8', email: 'Buyer@Example.com', name: 'Sam Doe', company: 'Acme Ltd',
  currency: 'GBP', subtotalMinor: 14400, totalMinor: 17280,
  items: [{ offering_name: 'Aspose.Total', variant_name: 'Developer', variant_id: VARIANT, qty: 2, unit_minor: 7200, line_total_minor: 14400 }],
};
const po = { ...card, kind: 'po', reference: 'Q-1001-ORD', invoiceNumber: 'INV-0042', poReference: 'PO-77' };
const config = crmConfig({ PIPEDRIVE_API_TOKEN: 'test-token', PIPEDRIVE_STAGE_ID: '3' });

// a fake Pipedrive: records every call, answers by path
function fakePipedrive({ existing = {}, fail = {} } = {}) {
  const calls = [];
  const ok = (data) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const key = init.method + ' ' + u.pathname.replace(/^.*\/v1/, '');
    calls.push({ key, url: u, body: init.body ? JSON.parse(init.body) : null });
    if (fail[key]) return { ok: false, status: fail[key], json: async () => ({ success: false }) };
    const search = key.match(/^GET \/(persons|organizations|products)\/search$/);
    if (search) return ok({ items: existing[search[1]] ? [{ item: { id: existing[search[1]] } }] : [] });
    if (key === 'POST /organizations') return ok({ id: 301 });
    if (key === 'POST /persons') return ok({ id: 501 });
    if (key === 'POST /products') return ok({ id: 701 });
    if (key === 'POST /deals') return ok({ id: 901 });
    if (key === 'POST /deals/901/products') return ok({ id: 1 });
    if (key === 'POST /notes') return ok({ id: 1 });
    return { ok: false, status: 404, json: async () => null };
  };
  return { calls, fetchImpl, keys: () => calls.map((c) => c.key) };
}
function store(answer = 'claimed') {
  const s = { claims: 0, releases: 0, saved: null };
  return { s, claim: async () => { s.claims++; return answer; }, release: async () => { s.releases++; }, save: async (ids) => { s.saved = ids; } };
}

test('labels: a card order shows the short Stripe reference, a PO order its invoice', () => {
  assert.equal(orderLabel(card), 'a1b2c3d4e5f6');
  assert.equal(orderLabel(po), 'INV-0042');
  assert.equal(orderDealTitle(card), 'Shop order a1b2c3d4e5f6: Acme Ltd');
  assert.equal(orderDealTitle({ ...po, company: '' }), 'PO order INV-0042: Buyer@Example.com');
});

test('note: how it was paid, the references, the totals and each item, escaped', () => {
  const note = orderDealNote({ ...po, items: [{ ...po.items[0], offering_name: '<b>x</b>' }] });
  assert.match(note, /Purchase order \(invoice\)/);
  assert.match(note, /PO number: PO-77/);
  assert.match(note, /Subtotal \(ex VAT\): £144\.00/);
  assert.match(note, /&lt;b&gt;x&lt;\/b&gt; · Developer × 2: £144\.00/);
  assert.ok(!note.includes('<b>x</b>'));
});

test('not configured or no email: nothing is claimed and nothing is sent', async () => {
  const p = fakePipedrive(); const st = store();
  assert.equal((await syncOrderToCrm({ config: null, order: card, ...st, fetchImpl: p.fetchImpl })).reason, 'not configured');
  assert.equal((await syncOrderToCrm({ config, order: { ...card, email: 'nope' }, ...st, fetchImpl: p.fetchImpl })).reason, 'no contact');
  assert.equal(st.s.claims, 0); assert.equal(p.calls.length, 0);
});

test('already claimed: one deal per order, so a second call sends nothing', async () => {
  const p = fakePipedrive(); const st = store('taken');
  assert.deepEqual(await syncOrderToCrm({ config, order: card, ...st, fetchImpl: p.fetchImpl }), { synced: true, reason: 'already synced' });
  assert.equal(p.calls.length, 0);
  const failed = store('error');
  assert.equal((await syncOrderToCrm({ config, order: card, ...failed, fetchImpl: p.fetchImpl })).reason, 'claim failed');
  assert.equal(p.calls.length, 0);
});

test('a new buyer: organisation, person in it, deal with value and products, note; ids saved', async () => {
  const p = fakePipedrive(); const st = store();
  const out = await syncOrderToCrm({ config, order: card, ...st, fetchImpl: p.fetchImpl });
  assert.deepEqual(out, { synced: true, reason: 'synced', personId: 501, orgId: 301, dealId: 901 });
  assert.deepEqual(p.keys(), ['GET /organizations/search', 'POST /organizations', 'GET /persons/search', 'POST /persons',
    'POST /deals', 'GET /products/search', 'POST /products', 'POST /deals/901/products', 'POST /notes']);
  const body = (key) => p.calls.find((c) => c.key === key).body;
  assert.deepEqual(body('POST /organizations'), { name: 'Acme Ltd' });
  assert.equal(body('POST /persons').org_id, 301);
  assert.equal(body('POST /persons').email[0].value, 'buyer@example.com');
  assert.deepEqual(body('POST /deals'), { title: 'Shop order a1b2c3d4e5f6: Acme Ltd', value: 144, currency: 'GBP',
    person_id: 501, org_id: 301, stage_id: 3 });
  assert.deepEqual(body('POST /products'), { name: 'Aspose.Total · Developer', code: VARIANT, prices: [{ price: 72, currency: 'GBP' }] });
  assert.deepEqual(body('POST /deals/901/products'), { product_id: 701, item_price: 72, quantity: 2 });
  assert.equal(p.calls.find((c) => c.key === 'GET /products/search').url.searchParams.get('term'), VARIANT);
  assert.equal(p.calls[0].url.searchParams.get('exact_match'), 'true');
  assert.deepEqual(st.s.saved, { personId: 501, orgId: 301, dealId: 901 });
  assert.equal(st.s.releases, 0);
});

test('a known buyer and product are reused; no company means no organisation', async () => {
  const p = fakePipedrive({ existing: { persons: 42, products: 77 } }); const st = store();
  const out = await syncOrderToCrm({ config, order: { ...po, company: '' }, ...st, fetchImpl: p.fetchImpl });
  assert.equal(out.personId, 42); assert.equal(out.orgId, null);
  assert.ok(!p.keys().some((k) => k.includes('organizations') || k === 'POST /persons' || k === 'POST /products'));
  const deal = p.calls.find((c) => c.key === 'POST /deals').body;
  assert.equal(deal.org_id, undefined); assert.equal(deal.title, 'PO order INV-0042: Buyer@Example.com');
  assert.equal(p.calls.find((c) => c.key === 'POST /deals/901/products').body.product_id, 77);
});

test('the deal stands when its products or note fail', async () => {
  const p = fakePipedrive({ fail: { 'POST /deals/901/products': 500, 'POST /notes': 500 } }); const st = store();
  const out = await syncOrderToCrm({ config, order: card, ...st, fetchImpl: p.fetchImpl });
  assert.equal(out.synced, true); assert.equal(out.reason, 'synced without products and note');
  assert.equal(st.s.releases, 0); assert.equal(st.s.saved.dealId, 901);
});

test('a failed deal releases the claim so the next call tries again, and never throws', async () => {
  const p = fakePipedrive({ fail: { 'POST /deals': 500 } }); const st = store();
  const out = await syncOrderToCrm({ config, order: card, ...st, fetchImpl: p.fetchImpl });
  assert.equal(out.synced, false); assert.match(out.reason, /pipedrive POST \/deals 500/);
  assert.equal(st.s.releases, 1); assert.equal(st.s.saved, null);
  const down = await syncOrderToCrm({ config, order: card, ...store(), fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(down.synced, false);
});

test('the token goes in a header, never in the URL', async () => {
  const p = fakePipedrive(); const st = store();
  await syncOrderToCrm({ config, order: card, ...st, fetchImpl: p.fetchImpl });
  assert.ok(p.calls.every((c) => !c.url.href.includes('test-token')));
});
