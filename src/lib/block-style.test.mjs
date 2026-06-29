import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appearanceClass, SURROUNDS, PADS } from './block-style.mjs';

test('defaults map to no class, so existing pages render byte-identically', () => {
  assert.equal(appearanceClass({}), '');
  assert.equal(appearanceClass(undefined), '');
  assert.equal(appearanceClass({ surround: 'none', pad: 'standard' }), '');
});

test('a chosen surround maps to its safe class pair', () => {
  assert.equal(appearanceClass({ surround: 'card' }), 'gs-surround gs-surround-card');
  assert.equal(appearanceClass({ surround: 'emerald', pad: 'roomy' }), 'gs-surround gs-surround-emerald gs-pad-roomy');
});

test('padding maps only when non-default', () => {
  assert.equal(appearanceClass({ pad: 'snug' }), 'gs-pad-snug');
  assert.equal(appearanceClass({ pad: 'standard' }), '');
});

test('unknown / garbage enum values are dropped (no injection)', () => {
  assert.equal(appearanceClass({ surround: 'rainbow"><script>', pad: 'huge' }), '');
  assert.equal(appearanceClass({ surround: 123, pad: {} }), '');
});

test('every declared option produces a class token (no dead options)', () => {
  for (const s of SURROUNDS) {
    const cls = appearanceClass({ surround: s.id });
    if (s.id === 'none') assert.equal(cls, '');
    else assert.match(cls, new RegExp('gs-surround-' + s.id + '$'));
  }
  for (const p of PADS) {
    const cls = appearanceClass({ pad: p.id });
    if (p.id === 'standard') assert.equal(cls, '');
    else assert.equal(cls, 'gs-pad-' + p.id);
  }
});
