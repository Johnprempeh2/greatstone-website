import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCatalog, catalogStats, serviceSlug, duplicateSlugs, patchAt, removeAt, insertAt, moveAt, blankService } from './service-admin.mjs';

const catalogBlock = (services, categories) => ({ type: 'ServiceCatalog', props: { id: 'sc1', services, categories, inquiryEmail: 'dx@x.co' } });
const page = (content) => ({ title: 'Services', data: { root: { props: {} }, content } });
const S = (pages) => ({ order: Object.keys(pages), pages });

test('findCatalog locates the ServiceCatalog block + returns its arrays + location', () => {
  const svc = [{ name: 'A', category: 'X' }], cat = [{ name: 'X', blurb: 'b' }];
  const st = S({ home: page([{ type: 'Hero', props: {} }]), services: page([{ type: 'Hero', props: {} }, catalogBlock(svc, cat)]) });
  const loc = findCatalog(st);
  assert.equal(loc.slug, 'services');
  assert.equal(loc.index, 1);
  assert.equal(loc.services.length, 1);
  assert.equal(loc.categories.length, 1);
  assert.equal(loc.email, 'dx@x.co');
});

test('findCatalog returns null when no catalogue block exists', () => {
  assert.equal(findCatalog(S({ home: page([{ type: 'Hero', props: {} }]) })), null);
  assert.equal(findCatalog({}), null);
});

test('catalogStats counts services, categories, featured, new + per-category', () => {
  const cat = { services: [{ category: 'X', featured: true }, { category: 'X' }, { category: 'Y', isNew: true }], categories: [{ name: 'X' }, { name: 'Y' }] };
  const s = catalogStats(cat);
  assert.equal(s.services, 3);
  assert.equal(s.categories, 2);
  assert.equal(s.featured, 1);
  assert.equal(s.isNew, 1);
  assert.deepEqual(s.byCategory, { X: 2, Y: 1 });
});

test('serviceSlug uses explicit slug, else derives from name', () => {
  assert.equal(serviceSlug({ slug: 'my-svc', name: 'Whatever' }), 'my-svc');
  assert.equal(serviceSlug({ name: 'AI Customer Service' }), 'ai-customer-service');
});

test('duplicateSlugs flags services that would collide on the same URL', () => {
  const dupes = duplicateSlugs([{ name: 'Web Design' }, { slug: 'web-design', name: 'Other' }, { name: 'Unique' }]);
  assert.deepEqual(dupes, ['web-design']);
});

test('pure array ops never mutate + behave correctly', () => {
  const a = [{ n: 1 }, { n: 2 }, { n: 3 }];
  assert.deepEqual(patchAt(a, 1, { n: 9 }).map((x) => x.n), [1, 9, 3]);
  assert.deepEqual(removeAt(a, 0).map((x) => x.n), [2, 3]);
  assert.deepEqual(insertAt(a, 1, { n: 5 }).map((x) => x.n), [1, 5, 2, 3]);
  assert.deepEqual(moveAt(a, 0, 1).map((x) => x.n), [2, 1, 3]);
  assert.deepEqual(moveAt(a, 0, -1).map((x) => x.n), [1, 2, 3]); // out of range → unchanged
  assert.deepEqual(a.map((x) => x.n), [1, 2, 3]); // original untouched
});

test('blankService seeds the given category + sensible defaults', () => {
  const s = blankService('AI');
  assert.equal(s.category, 'AI');
  assert.equal(s.isNew, true);
  assert.deepEqual(s.bullets, []);
});
