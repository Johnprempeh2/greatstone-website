import test from 'node:test';
import assert from 'node:assert/strict';
import catalogue from '../next-proof/fixtures/public-catalogue-2026-10-22.json' with { type: 'json' };
import { USE_CASES, useCaseOf, filterByUseCase, groupByUseCase, showsGroups, useCaseHref } from './shop-use-cases.mjs';

const item = (slug, category) => ({ slug, category: category && { slug: category } });

test('every catalogue category belongs to exactly one use case', () => {
  for (const category of catalogue.categories) {
    const owners = USE_CASES.filter((useCase) => useCase.categories.includes(category.slug));
    assert.equal(owners.length, 1, category.slug);
  }
});

test('a product with an unknown or missing category falls into the last group', () => {
  assert.equal(useCaseOf(item('a', 'something-new')).slug, 'suites');
  assert.equal(useCaseOf(item('b')).slug, 'suites');
});

test('groups keep use case order and row order, and drop empty groups', () => {
  const rows = [item('ocr', 'ocr-and-recognition'), item('pdf1', 'pdf'), item('pdf2', 'viewing')];
  const groups = groupByUseCase(rows);
  assert.deepEqual(groups.map((group) => group.slug), ['pdf', 'capture']);
  assert.deepEqual(groups[0].rows.map((row) => row.slug), ['pdf1', 'pdf2']);
});

test('filtering by use case keeps only its products; no slug keeps all', () => {
  const rows = [item('ocr', 'ocr-and-recognition'), item('pdf1', 'pdf')];
  assert.deepEqual(filterByUseCase(rows, 'capture').map((row) => row.slug), ['ocr']);
  assert.equal(filterByUseCase(rows, '').length, 2);
});

test('the sample catalogue loses no products when grouped', () => {
  const total = groupByUseCase(catalogue.offerings).reduce((sum, group) => sum + group.rows.length, 0);
  assert.equal(total, catalogue.offerings.length);
});

test('groups show only on the plain featured view', () => {
  assert.equal(showsGroups({}), true);
  assert.equal(showsGroups({ vendor: 'x', sort: 'featured' }), true);
  for (const filters of [{ q: 'pdf' }, { category: 'pdf' }, { platform: '.NET' }, { usecase: 'pdf' }, { sort: 'az' }]) assert.equal(showsGroups(filters), false);
});

test('use case links keep the vendor', () => {
  assert.equal(useCaseHref({}, 'pdf'), '/shop?usecase=pdf');
  assert.equal(useCaseHref({}, ''), '/shop');
  assert.equal(useCaseHref({ vendor: 'apryse' }, 'pdf'), '/shop?vendor=apryse&usecase=pdf');
  assert.equal(useCaseHref({ vendor: 'apryse' }, ''), '/shop/apryse');
});
