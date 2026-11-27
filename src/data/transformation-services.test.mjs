import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformationServices } from './transformation-services.mjs';

test('approved categories have unique section targets and both paths', () => {
  assert.equal(transformationServices.length, 8);
  assert.equal(new Set(transformationServices.map((item) => item.id)).size, 8);
  for (const item of transformationServices) {
    assert.match(item.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(item.title && item.nav && item.step && item.whole);
    assert.ok(item.nav.split(' ').length <= 7);
  }
  assert.ok(transformationServices.every((item) => item.title !== 'The Method'));
});

// GRE-6446: each category opens its services from the catalogue, matched by name, so a renamed category
// or catalogue heading would leave a step with nothing to add to the basket.
test('every category has services in the catalogue, and none of them shows a price', async () => {
  const { services } = await import('./service-catalog.mjs');
  for (const item of transformationServices) {
    const list = services.filter((s) => s.category === item.title);
    assert.ok(list.length > 0, item.title + ' has no catalogue services');
    for (const s of list) assert.ok(!('price' in s) && !('priceFrom' in s), s.name + ' carries a price');
  }
});
