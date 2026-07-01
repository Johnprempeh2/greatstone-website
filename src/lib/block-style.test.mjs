import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appearanceClass, SURROUNDS, PADS, TEXT_SCALES, sectionClass, SECTION_SURFACES, SECTION_SPACES, SECTION_ACCENTS, SECTION_TEXT_HEX, SECTION_SURFACE_HEX, SECTION_ACCENT_TEAL_HEX } from './block-style.mjs';
import { contrastRatio } from './richtext-marks.mjs';

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

test('text size maps only when non-default, and every scale is a real option', () => {
  assert.equal(appearanceClass({ textScale: 'default' }), '');
  assert.equal(appearanceClass({ textScale: 'lg' }), 'gs-textscale-lg');
  assert.equal(appearanceClass({ surround: 'card', textScale: 'sm' }), 'gs-surround gs-surround-card gs-textscale-sm');
  assert.equal(appearanceClass({ textScale: 'gigantic' }), ''); // unknown dropped
  for (const t of TEXT_SCALES) assert.equal(appearanceClass({ textScale: t.id }), t.id === 'default' ? '' : 'gs-textscale-' + t.id);
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

// ── universal Section group ──
test('sectionClass defaults map to no class (existing pages byte-identical)', () => {
  assert.equal(sectionClass({}), '');
  assert.equal(sectionClass(undefined), '');
  assert.equal(sectionClass({ spaceTop: 'default', spaceBottom: 'default', surface: 'none', accent: 'default' }), '');
});

test('sectionClass maps each enum to its safe class; unknown values are dropped (no injection)', () => {
  assert.equal(sectionClass({ spaceTop: 'lg' }), 'gs-sec-spt-lg');
  assert.equal(sectionClass({ spaceBottom: 'sm' }), 'gs-sec-spb-sm');
  assert.equal(sectionClass({ surface: 'emerald' }), 'gs-sec-surface gs-sec-surface-emerald');
  assert.equal(sectionClass({ accent: 'teal' }), 'gs-sec-accent-teal');
  assert.equal(sectionClass({ spaceTop: 'lg', surface: 'panel', accent: 'teal' }), 'gs-sec-spt-lg gs-sec-surface gs-sec-surface-panel gs-sec-accent-teal');
  // garbage / injection attempts produce no class
  assert.equal(sectionClass({ surface: 'evil"></div><script>', accent: 'red', spaceTop: '999' }), '');
});

test('every Section surface keeps the body text AA-readable (>=4.5:1)', () => {
  for (const s of SECTION_SURFACES) {
    if (s.id === 'none') continue;
    const ratio = contrastRatio(SECTION_TEXT_HEX, SECTION_SURFACE_HEX[s.id]);
    assert.ok(ratio >= 4.5, 'surface ' + s.id + ' text contrast ' + ratio.toFixed(2) + ' must be >= 4.5');
  }
});

test('the teal accent re-tint passes AA on the darkest surface', () => {
  const ratio = contrastRatio(SECTION_ACCENT_TEAL_HEX, SECTION_SURFACE_HEX.deep);
  assert.ok(ratio >= 4.5, 'teal accent on deep surface ' + ratio.toFixed(2) + ' must be >= 4.5');
});
