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
