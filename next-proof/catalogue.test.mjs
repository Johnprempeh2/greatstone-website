import assert from 'node:assert/strict';
import test from 'node:test';
import { toProofRelease } from './release-adapter.mjs';
import { browseOfferings, catalogueFromRelease, offeringBySlug } from './catalogue-data.mjs';
import { publishedCatalogue } from './catalogue-source.mjs';

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
