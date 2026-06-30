import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctaStyleClass, CTA_SIZES } from './cta-style.mjs';

test('defaults map to no class, so every button keeps its current look', () => {
  assert.equal(ctaStyleClass({}), '');
  assert.equal(ctaStyleClass(undefined), '');
  assert.equal(ctaStyleClass({ size: 'default', fillMobile: 'no' }), '');
});

test('size + fill map to their modifier classes', () => {
  assert.equal(ctaStyleClass({ size: 'lg' }), 'gs-cta-lg');
  assert.equal(ctaStyleClass({ fillMobile: 'yes' }), 'gs-cta-fill');
  assert.equal(ctaStyleClass({ size: 'lg', fillMobile: 'yes' }), 'gs-cta-lg gs-cta-fill');
});

test('unknown / garbage values produce no class (no injection)', () => {
  assert.equal(ctaStyleClass({ size: 'evil"></a>', fillMobile: 'maybe' }), '');
  assert.equal(ctaStyleClass({ size: '999' }), '');
});

test('CTA_SIZES is a closed set with a no-op default', () => {
  assert.deepEqual(CTA_SIZES.map((s) => s.id), ['default', 'lg']);
});
