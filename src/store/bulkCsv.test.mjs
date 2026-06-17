import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offeringsToCsv, parseCsv, csvToObjects, diffOfferings, changesToPatch, parseUsdPriceToMinor, buildSkuPlan } from './bulkCsv.mjs';

// ── SKU-keyed importer ──────────────────────────────────────────────────────
test('parseUsdPriceToMinor: formats, blank, invalid', () => {
  assert.deepEqual(parseUsdPriceToMinor('$1,299.99'), { minor: 129999 });
  assert.deepEqual(parseUsdPriceToMinor('870'), { minor: 87000 });
  assert.deepEqual(parseUsdPriceToMinor(''), { minor: null });
  assert.ok(parseUsdPriceToMinor('abc').error);
});

const skuCurrent = () => ({
  variantsBySku: new Map([
    ['IRON-LITE', { id: 'v1', offering_id: 'o1', name: 'Lite', license_type: 'Single', billing_period: 'perpetual', base_price_minor: 50900, currency: 'USD' }],
  ]),
  offeringsBySlug: new Map([['ironpdf', { id: 'o1', slug: 'ironpdf', name: 'IronPDF', status: 'published', featured: false }]]),
});

test('buildSkuPlan: USD price change on an existing SKU → update', () => {
  const p = buildSkuPlan([{ sku: 'IRON-LITE', list_price_usd: '599.00' }], skuCurrent());
  assert.equal(p.counts.matching, 1);
  assert.deepEqual(p.updates[0].changes.base_price_minor, { from: 50900, to: 59900 });
});

test('buildSkuPlan: new SKU under an existing offering_slug → create', () => {
  const p = buildSkuPlan([{ sku: 'IRON-PRO', offering_slug: 'ironpdf', edition_name: 'Pro', list_price_usd: '1999' }], skuCurrent());
  assert.equal(p.counts.new, 1);
  assert.equal(p.creates[0].offeringSlug, 'ironpdf');
  assert.equal(p.creates[0].variant.base_price_minor, 199900);
});

test('buildSkuPlan: missing sku, invalid price, in-file duplicate', () => {
  const p = buildSkuPlan([
    { sku: '', list_price_usd: '10' },                       // missing sku → invalid
    { sku: 'X-1', list_price_usd: 'nope' },                  // bad price → invalid
    { sku: 'DUP', list_price_usd: '10' },                    // duplicate ↓
    { sku: 'DUP', list_price_usd: '20' },                    // duplicate
  ], skuCurrent());
  assert.equal(p.counts.invalid, 2);
  assert.equal(p.counts.duplicate, 1);
  assert.equal(p.duplicates[0].rowIndexes.length, 2);
  assert.ok(p.invalid.some(e => /missing sku/.test(e.reason)));
});

test('buildSkuPlan: new product under a NEW offering with no vendor → invalid', () => {
  const p = buildSkuPlan([{ sku: 'NEW-1', offering_slug: 'brand-new', edition_name: 'X', list_price_usd: '100' }], skuCurrent());
  assert.equal(p.counts.new, 0);
  assert.equal(p.counts.invalid, 1);
  assert.ok(p.invalid.some(e => /needs a vendor/.test(e.reason)));
});

test('buildSkuPlan: new product with a vendor → create', () => {
  const p = buildSkuPlan([{ sku: 'NEW-2', offering_slug: 'brand-new', offering_name: 'Brand New', vendor: 'Acme', edition_name: 'X', list_price_usd: '100' }], skuCurrent());
  assert.equal(p.counts.new, 1);
  assert.equal(p.creates[0].vendor, 'Acme');
});

test('buildSkuPlan: unchanged SKU (same price, blank text) → unchanged', () => {
  const p = buildSkuPlan([{ sku: 'IRON-LITE', list_price_usd: '509.00' }], skuCurrent());
  assert.equal(p.counts.matching, 0);
  assert.deepEqual(p.unchanged, ['IRON-LITE']);
});


const current = [
  { id: 'a', slug: 'ironpdf', name: 'IronPDF for .NET', status: 'published', featured: true, short_description: 'PDF lib', vendor: { name: 'Iron Software' }, category: { name: 'PDF' }, type: 'product' },
  { id: 'b', slug: 'aspose-cells', name: 'Aspose.Cells', status: 'published', featured: false, short_description: 'Spreadsheets', vendor: { name: 'Aspose' }, category: { name: 'Spreadsheets' }, type: 'product' },
];

test('export → parse round-trips, quoting commas', () => {
  const withComma = [{ ...current[0], short_description: 'Build, format, and ship PDFs' }];
  const csv = offeringsToCsv(withComma);
  const objs = csvToObjects(csv);
  assert.equal(objs.length, 1);
  assert.equal(objs[0].slug, 'ironpdf');
  assert.equal(objs[0].short_description, 'Build, format, and ship PDFs'); // comma survived quoting
});

test('parseCsv handles quoted newlines + escaped quotes', () => {
  const rows = parseCsv('slug,name\n"x","a ""b"" c\nline2"\n');
  assert.deepEqual(rows[1], ['x', 'a "b" c\nline2']);
});

test('diff: detects a name change', () => {
  const d = diffOfferings([{ slug: 'ironpdf', name: 'IronPDF 2026' }], current);
  assert.equal(d.updates.length, 1);
  assert.deepEqual(d.updates[0].changes.name, { from: 'IronPDF for .NET', to: 'IronPDF 2026' });
});

test('diff: featured + status changes; unchanged ignored', () => {
  const d = diffOfferings([
    { slug: 'ironpdf', featured: 'false', status: 'published' }, // featured changes true→false; status same
    { slug: 'aspose-cells', name: 'Aspose.Cells' },              // unchanged
  ], current);
  assert.equal(d.updates.length, 1);
  assert.deepEqual(d.updates[0].changes.featured, { from: true, to: false });
  assert.ok(!d.updates[0].changes.status); // status unchanged not recorded
  assert.deepEqual(d.unchanged, ['aspose-cells']);
});

test('diff: unknown slug + invalid status → errors', () => {
  const d = diffOfferings([
    { slug: 'nope', name: 'X' },
    { slug: 'ironpdf', status: 'live' }, // invalid
    { slug: '', name: 'Y' },             // missing slug
  ], current);
  assert.equal(d.errors.length, 3);
  assert.ok(d.errors.some(e => /unknown slug/.test(e.reason)));
  assert.ok(d.errors.some(e => /invalid status/.test(e.reason)));
  assert.ok(d.errors.some(e => /missing slug/.test(e.reason)));
});

test('changesToPatch flattens to {field:value}', () => {
  assert.deepEqual(changesToPatch({ name: { from: 'a', to: 'b' }, featured: { from: false, to: true } }), { name: 'b', featured: true });
});

test('empty rows / blank cells ignored', () => {
  const d = diffOfferings([{ slug: 'ironpdf', name: '', short_description: '' }], current); // blanks = no change
  assert.equal(d.updates.length, 0);
  assert.deepEqual(d.unchanged, ['ironpdf']);
});
