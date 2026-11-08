import assert from 'node:assert/strict';
import test from 'node:test';
import { toProofRelease } from './release-adapter.mjs';
import { browseOfferings, catalogueFromRelease, offeringBySlug, priceCatalogue } from './catalogue-data.mjs';
import { decorateOffering, priceCard } from '../src/data/catalog.mjs';
import { publishedCatalogue } from './catalogue-source.mjs';
import { validateRelease } from './release-validator.mjs';

const page = { data: { content: [{ type: 'Hero', props: { id: 'hero-1', shopHref: '#shop/sample-vendor', productHref: '#product/sample-one' } }] }, title: 'Page', seo: { title: 'Page', description: 'Page' } };
const snapshot = {
  pages: { home: page, 'dev-tools': page }, settings: { siteName: 'Test' }, navigation: [],
  catalogue: {
    vendors: [{ id: 'vendor-1', slug: 'sample-vendor', name: 'Sample Vendor' }],
    categories: [{ id: 'category-1', slug: 'documents', name: 'Documents' }],
    offerings: [
      { id: 'offering-1', slug: 'sample-one', name: 'Sample One', status: 'published', vendor: { slug: 'sample-vendor', name: 'Sample Vendor' }, category: { slug: 'documents' }, platforms: ['.NET'], pricing: { final: null }, variants: [], seo: { metaTitle: 'Sample One' } },
      { id: 'offering-2', slug: 'sample-two', name: 'Sample Two', status: 'published', vendor: { slug: 'sample-vendor', name: 'Sample Vendor' }, category: { slug: 'documents' }, platforms: ['Java'], pricing: { final: null }, variants: [] },
      { id: 'offering-3', slug: 'sample-draft', name: 'Sample Draft', status: 'draft', vendor: { slug: 'sample-vendor' }, variants: [] },
    ],
  },
};

test('published catalogue is encoded as release collections with the owning organisation', () => {
  const release = toProofRelease(snapshot);
  assert.equal(release.pages[0].data.content[0].props.shopHref, '/shop/sample-vendor');
  assert.equal(release.pages[0].data.content[0].props.productHref, '/product/sample-one');
  assert.equal(page.data.content[0].props.shopHref, '#shop/sample-vendor');
  assert.deepEqual(Object.keys(release.collections), ['vendors', 'categories', 'offerings']);
  assert.equal(release.collections.offerings.entries[0].orgId, release.orgId);
  assert.equal(release.collections.offerings.entries[0].slug, 'sample-one');
  assert.equal(new Set(release.collections.offerings.entries.map((entry) => entry.revisionId)).size, 2);
  const catalogue = catalogueFromRelease(release);
  assert.equal(offeringBySlug(catalogue, 'sample-one').seo.metaTitle, 'Sample One');
  assert.equal(offeringBySlug(catalogue, 'missing'), null);
  assert.deepEqual(browseOfferings(catalogue, { platform: 'Java' }).map((item) => item.slug), ['sample-two']);
  assert.deepEqual(browseOfferings(catalogue, { vendor: 'sample-vendor', q: 'one' }).map((item) => item.slug), ['sample-one']);
});

test('collection reads do not cross organisation boundaries', () => {
  const release = toProofRelease(snapshot);
  release.collections.offerings.entries.push({ ...release.collections.offerings.entries[0], orgId: 'other-organisation', slug: 'leak' });
  assert.equal(offeringBySlug(catalogueFromRelease(release), 'leak'), null);
});

test('legacy product URL slugs stay in public data without breaking the release schema', () => {
  const legacy = structuredClone(snapshot);
  legacy.catalogue.offerings[0].slug = 'sample-for--net';
  const release = toProofRelease(legacy);
  assert.equal(release.collections.offerings.entries[0].slug, undefined);
  assert.equal(offeringBySlug(catalogueFromRelease(release), 'sample-for--net').slug, 'sample-for--net');
});

test('public catalogue fixture is usable locally but rejected by required release builds', async () => {
  const previous = process.env.NEXT_CATALOGUE_FIXTURE;
  const required = process.env.NEXT_CATALOGUE_REQUIRED;
  process.env.NEXT_CATALOGUE_FIXTURE = new URL('./fixtures/public-catalogue-2026-10-22.json', import.meta.url).pathname;
  try {
    delete process.env.NEXT_CATALOGUE_REQUIRED;
    const catalogue = await publishedCatalogue();
    assert.equal(catalogue.vendors.length, 10);
    assert.equal(catalogue.categories.length, 32);
    assert.equal(catalogue.offerings.length, 24);
    assert.equal(catalogue.offerings[0].from_price_minor, null);
    process.env.NEXT_CATALOGUE_REQUIRED = '1';
    await assert.rejects(publishedCatalogue(), /fixture cannot be used/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_CATALOGUE_FIXTURE;
    else process.env.NEXT_CATALOGUE_FIXTURE = previous;
    if (required === undefined) delete process.env.NEXT_CATALOGUE_REQUIRED;
    else process.env.NEXT_CATALOGUE_REQUIRED = required;
  }
});

test('empty catalogue text, a deleted category and BIGINT prices from the database still pass the release schema', () => {
  const nullable = structuredClone(snapshot);
  for (const key of Object.keys(nullable.pages)) nullable.pages[key].data.root = { props: {} };
  const vendor = { id: 'vendor-1', slug: 'sample-vendor', name: 'Sample Vendor', logo_url: null, description: null };
  nullable.catalogue.vendors = [vendor];
  nullable.catalogue.categories = [{ id: 'category-1', slug: 'documents', name: 'Documents', description: null }];
  nullable.catalogue.offerings = [{
    id: 'offering-1', slug: 'sample-one', name: 'Sample One', short_description: null, description: null,
    from_price_minor: null, from_price_currency: null, featured: false, platforms: [], type: 'product', attributes: {},
    vendor: { id: 'vendor-1', slug: 'sample-vendor', name: 'Sample Vendor', logo_url: null }, category: null, from_price_minor: '120000', from_price_currency: 'GBP',
    variants: [{ id: 'variant-1', sku: 'S1', name: 'One', currency: 'GBP', platform: null, sort_order: 0, license_type: null, min_order_qty: 1, billing_period: null, base_price_minor: '120000' }],
  }];
  const release = toProofRelease(nullable);
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
  assert.equal(release.collections.vendors.entries[0].fields.data.logo_url, '');
  // BIGINT minor units arrive from Postgres as strings.
  assert.equal(release.collections.offerings.entries[0].fields.data.from_price_minor, 120000);
  assert.equal(release.collections.offerings.entries[0].fields.data.variants[0].base_price_minor, 120000);
});

test('a CLI build reads the published catalogue over a site\'s /api/catalogue with the same operations (Next cutover)', async () => {
  const { catalogueApiReader, collectPublishedCatalogue } = await import('./catalogue-source.mjs');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(`${url.searchParams.get('op')}:${url.searchParams.get('slug') ?? url.searchParams.get('page') ?? ''}`);
    const op = url.searchParams.get('op');
    const body = op === 'vendors' ? [{ slug: 'v' }] : op === 'categories' ? [{ slug: 'c' }]
      : op === 'list' ? { items: url.searchParams.get('page') === '1' ? [{ slug: 'p1', pricing: { from: 1 } }] : [], total: 1 }
        : { slug: url.searchParams.get('slug'), name: 'P1' };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const catalogue = await collectPublishedCatalogue(catalogueApiReader('https://greatstoneint.com/api/catalogue', fetchImpl));
  assert.deepEqual(catalogue, { vendors: [{ slug: 'v' }], categories: [{ slug: 'c' }], offerings: [{ slug: 'p1', name: 'P1', pricing: { from: 1 } }] });
  assert.ok(calls.includes('detail:p1'));
  assert.throws(() => catalogueApiReader('http://greatstoneint.com/api/catalogue'), /https \/api\/catalogue/);
  const failing = catalogueApiReader('https://greatstoneint.com/api/catalogue', async () => new Response('', { status: 503 }));
  await assert.rejects(failing('vendors'), /answered 503/);
  // A slug with capitals that the older live API refuses keeps its list card; any other 400 still fails the build.
  const strict = catalogueApiReader('https://greatstoneint.com/api/catalogue', async () => new Response('', { status: 400 }));
  await assert.rejects(strict('detail', { slug: 'lower-only' }), /answered 400/);
  const read = catalogueApiReader('https://greatstoneint.com/api/catalogue', async (url) => {
    const op = url.searchParams.get('op');
    if (op === 'detail') return new Response('', { status: 400 });
    return new Response(JSON.stringify(op === 'list' ? { items: url.searchParams.get('page') === '1' ? [{ slug: 'devexpress-winForms', name: 'WinForms' }] : [], total: 1 } : []), { status: 200 });
  });
  assert.deepEqual((await collectPublishedCatalogue(read)).offerings, [{ slug: 'devexpress-winForms', name: 'WinForms' }]);
});

test('Next pages price release products with the live rules and rate, as /api/catalogue does (GRE-4714)', () => {
  // Made-up figures. Rows are shaped as the public catalogue read returns them.
  const vendor = { id: 'vendor-1', slug: 'sample-vendor', name: 'Sample Vendor', logo_url: null };
  const category = { id: 'category-1', slug: 'documents', name: 'Documents' };
  const variant = (id, base, currency, sort) => ({ id, sku: id, name: id, currency, platform: null, sort_order: sort, license_type: null, min_order_qty: 1, billing_period: null, base_price_minor: base });
  const priced = { id: 'offering-1', slug: 'sample-priced', name: 'Sample Priced', type: 'product', status: 'published', vendor, category, vendor_id: vendor.id, category_id: category.id,
    from_price_minor: '50000', from_price_currency: 'USD', platforms: ['.NET'], short_description: null, description: null, featured: false, attributes: {},
    offering_variants: [variant('edition-usd', '50000', 'USD', 1), variant('edition-gbp', '80000', 'GBP', 2)], offering_specs: [] };
  const cheaper = { ...priced, id: 'offering-2', slug: 'sample-cheaper', name: 'Sample Cheaper', from_price_minor: '20000', offering_variants: [variant('edition-low', '20000', 'USD', 1)] };
  const poa = { ...priced, id: 'offering-3', slug: 'sample-poa', name: 'Sample POA', from_price_minor: null, offering_variants: [variant('edition-poa', null, 'USD', 1)] };
  const source = structuredClone(snapshot);
  for (const key of Object.keys(source.pages)) source.pages[key].data.root = { props: {} };
  const release = toProofRelease({ ...source, catalogue: { vendors: [{ ...vendor, description: null }], categories: [{ ...category, description: null }], offerings: [poa, priced, cheaper] } });
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
  const rule = { id: 'rule-1', active: true, status: 'published', scopeType: 'vendor', targets: { vendorIds: ['vendor-1'] }, adjustmentType: 'percentage', adjustmentValuePct: 10, priority: 1, floorFraction: 0 };
  const price = { rules: [rule], rate: 1.25 };

  const catalogue = priceCatalogue(catalogueFromRelease(release), price);
  const item = offeringBySlug(catalogue, 'sample-priced');
  assert.equal(item.pricing.final, 36000); // $500 at 1.25 is £400, less 10%
  assert.deepEqual(item.variants.map((v) => v.pricing.final), [36000, 57600]);
  assert.equal(item.from.final, 36000);
  // Same figures as the old site's read of the same database rows.
  const old = { ...priced, from_price_minor: 50000, offering_variants: priced.offering_variants.map((v) => ({ ...v, base_price_minor: Number(v.base_price_minor) })) };
  assert.deepEqual(item.pricing, priceCard(old, price.rules, null, price.rate));
  const oldDetail = decorateOffering(old, price.rules, price.rate);
  assert.deepEqual(item.variants.map((v) => v.pricing), oldDetail.variants.map((v) => v.pricing));
  assert.deepEqual(item.from, oldDetail.from);

  assert.equal(offeringBySlug(catalogue, 'sample-poa').pricing.final, null);
  assert.equal(offeringBySlug(catalogue, 'sample-poa').from, null);
  assert.deepEqual(browseOfferings(catalogue, { sort: 'price' }).map((row) => row.slug), ['sample-cheaper', 'sample-priced', 'sample-poa']);
  assert.deepEqual(browseOfferings(catalogue, { sort: 'price-desc' }).map((row) => row.slug), ['sample-priced', 'sample-cheaper', 'sample-poa']);

  // No live price inputs (no database): products keep no price, so the cards read "Price on application".
  const unpriced = priceCatalogue(catalogueFromRelease(release), null);
  assert.equal(offeringBySlug(unpriced, 'sample-priced').pricing, undefined);
});
