// Unit tests for the pricing engine. Run: node --test src/lib/pricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePrice, offeringFromPrice, ruleApplies, fmtMoney, fmtFrom, usdToGbpMinor, shopCurrencyOf, toShopMinor } from './pricing.mjs';
import { priceCard, decorateOffering } from '../data/catalog.mjs';

test('usdToGbpMinor: whole-pound rounding matches the spec example', () => {
  assert.equal(usdToGbpMinor(100000, 1.32), 75800);   // $1000 / 1.32 = 757.57 → £758
  assert.equal(usdToGbpMinor(87000, 1.30), 66900);    // $870 / 1.30 = 669.23 → £669
  assert.equal(usdToGbpMinor(87000, 1.50), 58000);    // $870 / 1.50 = 580 → £580
});
test('usdToGbpMinor: POA and invalid rate → null', () => {
  assert.equal(usdToGbpMinor(null, 1.30), null);
  assert.equal(usdToGbpMinor(100000, 0), null);
  assert.equal(usdToGbpMinor(100000, -1), null);
  assert.equal(usdToGbpMinor(100000, NaN), null);
});

const offering = { id: 'o1', type: 'product', vendorId: 'aspose', categoryId: 'cat-spreadsheets' };
const variant = (basePriceMinor = 87000, currency = 'GBP') => ({ basePriceMinor, currency });
const NOW = new Date('2026-06-17T12:00:00Z');

// rule factory with sensible defaults
const rule = (o = {}) => ({
  id: 'r1', active: true, status: 'published', scopeType: 'all', targets: {},
  appliesToOfferingType: null, adjustmentType: 'percentage', adjustmentValuePct: 20,
  adjustmentValue: 0, currency: 'GBP', audience: 'public', audienceTierId: null,
  startsAt: null, endsAt: null, priority: 100, floorFraction: 0, label: null, createdAt: '2026-01-01', ...o,
});

test('no rules → base unchanged', () => {
  const p = effectivePrice(offering, variant(87000), [], null, NOW);
  assert.equal(p.final, 87000);
  assert.equal(p.hasDiscount, false);
  assert.equal(p.appliedRule, null);
});

test('vendor 20% → Aspose.Cells £870 becomes £696', () => {
  const r = rule({ scopeType: 'vendor', targets: { vendorIds: ['aspose'] }, adjustmentValuePct: 20 });
  const p = effectivePrice(offering, variant(87000), [r], null, NOW);
  assert.equal(p.final, 69600);           // £696.00
  assert.equal(p.savedMinor, 17400);
  assert.equal(p.hasDiscount, true);
});

test('vendor rule does NOT apply to a different vendor', () => {
  const r = rule({ scopeType: 'vendor', targets: { vendorIds: ['ironsoftware'] } });
  const p = effectivePrice(offering, variant(87000), [r], null, NOW);
  assert.equal(p.final, 87000);
});

test('fixed discount applies only when currency matches', () => {
  const gbp = rule({ adjustmentType: 'fixed', adjustmentValue: 10000, currency: 'GBP' });
  assert.equal(effectivePrice(offering, variant(87000, 'GBP'), [gbp], null, NOW).final, 77000);
  assert.equal(effectivePrice(offering, variant(87000, 'USD'), [gbp], null, NOW).final, 87000); // skipped
});

test('POA (null base) is never discounted', () => {
  const r = rule({ adjustmentValuePct: 50 });
  const p = effectivePrice(offering, variant(null, null), [r], null, NOW);
  assert.equal(p.poa, true);
  assert.equal(p.final, null);
  assert.equal(p.hasDiscount, false);
});

test('floor clamp: never below base*floorFraction', () => {
  const r = rule({ adjustmentType: 'fixed', adjustmentValue: 10000, currency: 'GBP', floorFraction: 0.5 });
  const p = effectivePrice(offering, variant(8000), [r], null, NOW); // £80, -£100, floor £40
  assert.equal(p.final, 4000);
});

test('never negative even with floorFraction 0', () => {
  const r = rule({ adjustmentType: 'fixed', adjustmentValue: 10000, currency: 'GBP', floorFraction: 0 });
  const p = effectivePrice(offering, variant(8000), [r], null, NOW);
  assert.equal(p.final, 0);
  assert.ok(p.final >= 0);
});

test('single-winner: lower priority wins, no stacking', () => {
  const a = rule({ id: 'a', priority: 20, adjustmentValuePct: 10 });
  const b = rule({ id: 'b', priority: 10, adjustmentValuePct: 30 });
  const p = effectivePrice(offering, variant(100000), [a, b], null, NOW);
  assert.equal(p.final, 70000);            // only b (-30%), not stacked
  assert.equal(p.appliedRule.id, 'b');
});

test('tie-break on equal priority: larger reduction wins', () => {
  const a = rule({ id: 'a', priority: 10, adjustmentValuePct: 10 });
  const b = rule({ id: 'b', priority: 10, adjustmentValuePct: 25 });
  const p = effectivePrice(offering, variant(100000), [a, b], null, NOW);
  assert.equal(p.appliedRule.id, 'b');
  assert.equal(p.final, 75000);
});

test('schedule: rule outside its window does not apply', () => {
  const past = rule({ endsAt: '2026-01-01T00:00:00Z' });
  const future = rule({ startsAt: '2027-01-01T00:00:00Z' });
  const live = rule({ startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' });
  assert.equal(effectivePrice(offering, variant(100000), [past], null, NOW).hasDiscount, false);
  assert.equal(effectivePrice(offering, variant(100000), [future], null, NOW).hasDiscount, false);
  assert.equal(effectivePrice(offering, variant(100000), [live], null, NOW).hasDiscount, true);
});

test('audience=tier: applies only to the matching customer tier', () => {
  const r = rule({ audience: 'tier', audienceTierId: 'tier-partner' });
  assert.equal(effectivePrice(offering, variant(100000), [r], null, NOW).hasDiscount, false);          // public
  assert.equal(effectivePrice(offering, variant(100000), [r], 'tier-other', NOW).hasDiscount, false);  // wrong tier
  assert.equal(effectivePrice(offering, variant(100000), [r], 'tier-partner', NOW).hasDiscount, true); // match
});

test('applies_to_offering_type gates product vs service', () => {
  const r = rule({ appliesToOfferingType: 'service' });
  assert.equal(ruleApplies(r, { offering, tier: null, now: NOW }), false); // offering is a product
});

test('inactive / draft rules never apply', () => {
  assert.equal(effectivePrice(offering, variant(100000), [rule({ active: false })], null, NOW).hasDiscount, false);
  assert.equal(effectivePrice(offering, variant(100000), [rule({ status: 'draft' })], null, NOW).hasDiscount, false);
});

test('category + offering scopes match correctly', () => {
  const cat = rule({ scopeType: 'category', targets: { categoryIds: ['cat-spreadsheets'] } });
  const off = rule({ scopeType: 'offering', targets: { offeringIds: ['o1'] } });
  const miss = rule({ scopeType: 'offering', targets: { offeringIds: ['other'] } });
  assert.equal(effectivePrice(offering, variant(100000), [cat], null, NOW).hasDiscount, true);
  assert.equal(effectivePrice(offering, variant(100000), [off], null, NOW).hasDiscount, true);
  assert.equal(effectivePrice(offering, variant(100000), [miss], null, NOW).hasDiscount, false);
});

test('offeringFromPrice picks the lowest effective price across variants', () => {
  const r = rule({ scopeType: 'all', adjustmentValuePct: 10 });
  const vs = [variant(100000), variant(50000), variant(null, null)]; // £1000, £500, POA
  const best = offeringFromPrice(offering, vs, [r], null, NOW);
  assert.equal(best.final, 45000); // £500 - 10%
});

test('formatting', () => {
  assert.equal(fmtMoney(69600), '£696.00');
  assert.equal(fmtMoney(null), 'POA');
  assert.equal(fmtFrom(50900), 'from £509.00');
  assert.equal(fmtFrom(null), 'Price on application');
});

test('shop currency: USD sells the stored dollars; anything else, missing included, is GBP at the rate', () => {
  for (const v of [undefined, null, '', 'usd', 'EUR', 'GBP', 7]) assert.equal(shopCurrencyOf(v), 'GBP', String(v));
  assert.equal(shopCurrencyOf('USD'), 'USD');
  assert.equal(toShopMinor(100000, 1.32), 75800);                 // default: today's pounds
  assert.equal(toShopMinor(100000, 1.32, 'GBP'), 75800);
  assert.equal(toShopMinor('100099', 1.32, 'USD'), 100099);       // as stored: no rate, no rounding (pg bigint is a string)
  assert.equal(toShopMinor(100000, 0, 'USD'), 100000);            // the rate does not matter in dollars
  assert.equal(toShopMinor(null, 1.32, 'USD'), null);             // POA stays POA
  assert.equal(fmtMoney(123400, 'USD'), 'US$1,234.00');
  assert.equal(fmtMoney(123400, null), '£1,234.00');
});

test('cards and product pages price in the shop currency, and carry it', () => {
  const o = { id: 'o', type: 'product', from_price_minor: '100000', vendor: { id: 'v' }, category: { id: 'c' },
    offering_variants: [{ id: 'a', sort_order: 1, base_price_minor: '100000' }] };
  assert.deepEqual([priceCard(o, [], null, 1.32).final, priceCard(o, [], null, 1.32).currency], [75800, 'GBP']);
  assert.deepEqual([priceCard(o, [], null, 1.32, 'USD').final, priceCard(o, [], null, 1.32, 'USD').currency], [100000, 'USD']);
  const usd = decorateOffering(o, [], 1.32, null, 'USD');
  assert.deepEqual([usd.variants[0].pricing.final, usd.variants[0].pricing.currency, usd.from.final], [100000, 'USD', 100000]);
  assert.equal(decorateOffering(o, [], 1.32).from.final, 75800);
  // a fixed pound discount does not apply to a dollar price
  const rule = { id: 'r', active: true, scopeType: 'all', adjustmentType: 'fixed', adjustmentValue: 1000, currency: 'GBP' };
  assert.equal(priceCard(o, [rule], null, 1.32).final, 74800);
  assert.equal(priceCard(o, [rule], null, 1.32, 'USD').final, 100000);
});

test('productOffer follows the shop currency, not the stored USD', async () => {
  const { productOffer } = await import('./pricing.mjs');
  const gbp = { from_price_currency: 'USD', from: { final: 11200, currency: 'GBP' }, pricing: { final: 11200, currency: 'GBP' } };
  assert.deepEqual(productOffer(gbp, 'https://x/p'), { '@type': 'Offer', priceCurrency: 'GBP', availability: 'https://schema.org/InStock', price: '112.00', url: 'https://x/p' });
  const usd = { from_price_currency: 'USD', pricing: { final: 14500, currency: 'USD' } };
  assert.equal(productOffer(usd).priceCurrency, 'USD');
  assert.equal(productOffer(usd).price, '145.00');
  const poa = { from_price_currency: null, from: null, pricing: { poa: true, final: null, currency: 'GBP' } };
  assert.equal(productOffer(poa).priceCurrency, 'GBP');
  assert.equal('price' in productOffer(poa), false);
});
