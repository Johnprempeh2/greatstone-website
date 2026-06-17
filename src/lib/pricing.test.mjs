// Unit tests for the pricing engine. Run: node --test src/lib/pricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePrice, offeringFromPrice, ruleApplies, fmtMoney, fmtFrom } from './pricing.mjs';

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
