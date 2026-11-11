import { test } from 'node:test';
import assert from 'node:assert/strict';
import release from './data/release.json' with { type: 'json' };
import frozenBlocks from './frozen/form-blocks.json' with { type: 'json' };
import { services as defaults } from '../src/data/service-catalog.mjs';
import { findService } from '../src/store/service-lookup.mjs';
import { serviceCatalogueFromRelease } from './service-pages.mjs';

const listed = { type: 'ServiceCatalog', props: { services: [{ name: 'Edited Service', slug: 'edited-service', category: 'Websites' }], categories: [{ name: 'Websites' }], inquiryEmail: 'team@example.com' } };

test('the baked release lists its services on How we help, and every default service has a page', () => {
  const catalogue = serviceCatalogueFromRelease(release);
  assert.equal(catalogue.path, '/how-we-help');
  assert.ok(catalogue.services.length > 0);
  for (const service of defaults) assert.ok(findService(catalogue.services, service.slug), service.slug);
});

test('schema 1: service pages read the published ServiceCatalog block, so an editor change reaches them', () => {
  const catalogue = serviceCatalogueFromRelease({ pages: [{ path: '/', data: { content: [] } }, { path: '/our-services', data: { content: [listed] } }] });
  assert.equal(catalogue.path, '/our-services');
  assert.equal(catalogue.email, 'team@example.com');
  assert.deepEqual(catalogue.services.map((service) => service.slug), ['edited-service']);
});

test('schema 2: service pages read the frozen props of the page with the catalogue island', () => {
  const html = '<div class="gs-blk"><gs-island name="service-catalog" data-block="servicecatalog-x"></gs-island></div>';
  const catalogue = serviceCatalogueFromRelease({ releaseSchema: 2, pages: [{ path: '/', html: '<p>Home</p>' }, { path: '/how-we-help', html }] }, { 'servicecatalog-x': listed.props });
  assert.equal(catalogue.path, '/how-we-help');
  assert.deepEqual(catalogue.services.map((service) => service.slug), ['edited-service']);
  assert.ok(Object.hasOwn(frozenBlocks, 'servicecatalog-ghxib'));
});

test('with no catalogue block the bundled services still route, with no listing page', () => {
  const catalogue = serviceCatalogueFromRelease({ pages: [{ path: '/', data: { content: [] } }] });
  assert.equal(catalogue.path, null);
  assert.equal(catalogue.services, defaults);
});

// Admin parity round 2: the 78 services are a GSAM collection. These build the release GSAM publishes from the
// bundled copy (the import), so the listing and the service pages must come out the same as before.
import { categories as defaultCategories } from '../src/data/service-catalog.mjs';
import { releaseServices, withReleaseServices } from './service-pages.mjs';

const asCollection = (items) => ({ fieldsVersion: 1, entries: items.map((fields, index) => ({ id: `e-${index}`, key: `k-${index}`, orgId: 'org', sortOrder: index, fields })).reverse() });
const published = { services: asCollection(defaults), 'service-categories': asCollection(defaultCategories) };

test('published services: the 78 from GSAM, in GSAM order, list exactly as the bundled copy did', () => {
  const html = '<div class="gs-blk"><gs-island name="service-catalog" data-block="servicecatalog-ghxib"></gs-island></div>';
  const before = serviceCatalogueFromRelease({ releaseSchema: 2, pages: [{ path: '/how-we-help', html }] }, frozenBlocks);
  const after = serviceCatalogueFromRelease({ releaseSchema: 2, collections: published, pages: [{ path: '/how-we-help', html }] }, frozenBlocks);
  assert.equal(after.services.length, 78);
  assert.equal(new Set(after.services.map((service) => service.category)).size, 9);
  assert.deepEqual(after, before);
  assert.deepEqual(releaseServices({ collections: published }), { services: defaults, categories: defaultCategories });
});

test('published services replace the block props, and an edit in GSAM reaches the listing and the pages', () => {
  const edited = structuredClone(defaults);
  edited[0].name = 'Edited in GSAM';
  const release = { pages: [{ path: '/our-services', data: { content: [listed] } }], collections: { services: asCollection(edited) } };
  const catalogue = serviceCatalogueFromRelease(release);
  assert.equal(findService(catalogue.services, edited[0].slug).name, 'Edited in GSAM');
  assert.equal(catalogue.email, 'team@example.com');
  assert.equal(withReleaseServices('ServiceCatalog', listed.props, releaseServices(release)).services[0].name, 'Edited in GSAM');
  assert.equal(withReleaseServices('Hero', { a: 1 }, releaseServices(release)).a, 1);
});

test('before the first Publish that carries services, nothing changes', () => {
  assert.equal(releaseServices({ collections: {} }), null);
  assert.equal(releaseServices({ collections: { services: { fieldsVersion: 1, entries: [] } } }), null);
  assert.equal(withReleaseServices('ServiceCatalog', listed.props, null), listed.props);
});
