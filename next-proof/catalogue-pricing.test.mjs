import assert from 'node:assert/strict';
import test from 'node:test';
import { priceCatalogue } from './catalogue-pricing.mjs';

const row = (slug, from, prices) => ({ id: slug, slug, type: 'product', from_price_minor: from, vendor: { id: 'v1' }, category: { id: 'c1' },
  variants: prices.map((p, i) => ({ id: `${slug}-${i}`, name: `E${i}`, base_price_minor: p, sort_order: i })) });

test('prices cards and editions in GBP as /api/catalogue does: USD over the display rate, whole pounds', () => {
  const { offerings: [able, poa] } = priceCatalogue({ offerings: [row('able', 8000, [14500, 8000]), row('poa', null, [null])] }, [], 1.3);
  assert.equal(able.pricing.final, 6200);
  assert.equal(able.pricing.currency, 'GBP');
  assert.deepEqual(able.variants.map((v) => v.pricing.final), [11200, 6200]);
  assert.equal(able.from.final, 6200);
  assert.equal(poa.pricing.poa, true);
  assert.equal(poa.variants[0].pricing.final, null);
  assert.equal(poa.from, null);
});

test('applies a published pricing rule the same way', () => {
  const rule = { id: 'r', active: true, status: 'published', scopeType: 'vendor', targets: { vendorIds: ['v1'] }, adjustmentType: 'percentage', adjustmentValuePct: 10, floorFraction: 0 };
  const { offerings: [able] } = priceCatalogue({ offerings: [row('able', 8000, [8000])] }, [rule], 1.3);
  assert.equal(able.pricing.final, 5580);
  assert.equal(able.variants[0].pricing.final, 5580);
});
