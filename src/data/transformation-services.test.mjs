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
