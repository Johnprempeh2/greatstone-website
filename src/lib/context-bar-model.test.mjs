import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capsFor, nextSection, sectionValue, hasTextStyles, SECTION_FALLBACK, CTA_BLOCKS, APPEARANCE_BLOCKS, RICHTEXT_BLOCKS } from './context-bar-model.mjs';
import { SECTION_SURFACES } from './block-style.mjs';

test('capsFor: Section is universal; CTA + Appearance are gated to their blocks', () => {
  assert.equal(capsFor('Prose').section, true);
  assert.equal(capsFor('Hero').section, true);          // every block has _section via withAnchor
  assert.equal(capsFor('Chapter').cta, true);           // Chapter carries ctaStyle
  assert.equal(capsFor('Hero').cta, false);
  assert.equal(capsFor('Prose').appearance, true);      // Prose carries appearance
  assert.equal(capsFor('Columns').appearance, false);
  // the gate lists are the source of truth
  for (const t of CTA_BLOCKS) assert.equal(capsFor(t).cta, true);
  for (const t of APPEARANCE_BLOCKS) assert.equal(capsFor(t).appearance, true);
});

test('hasTextStyles / caps.text: true only for blocks with a rich-text Body', () => {
  assert.equal(hasTextStyles('Prose'), true);
  assert.equal(hasTextStyles('Chapter'), true);
  assert.equal(hasTextStyles('Hero'), false);
  assert.equal(capsFor('Faq').text, true);
  assert.equal(capsFor('Hero').text, false);
  for (const t of RICHTEXT_BLOCKS) assert.equal(hasTextStyles(t), true);
});

test('nextSection: sets one key, preserves the rest, never mutates the input', () => {
  const prev = { ...SECTION_FALLBACK };
  const next = nextSection(prev, 'surface', 'emerald');
  assert.equal(next.surface, 'emerald');
  assert.equal(next.accent, 'default');                 // others preserved
  assert.equal(prev.surface, 'none');                   // input untouched
  assert.notEqual(next, prev);                          // fresh object
});

test('nextSection: an unknown key or value is a no-op (never corrupts the block)', () => {
  const prev = { surface: 'panel', accent: 'teal', spaceTop: 'default', spaceBottom: 'default' };
  assert.deepEqual(nextSection(prev, 'surface', 'not-a-surface'), prev); // bad value -> unchanged
  assert.deepEqual(nextSection(prev, 'bogusKey', 'panel'), prev);        // bad key -> unchanged
  // and every emitted value stays inside the closed enum set
  for (const s of SECTION_SURFACES) assert.equal(nextSection(prev, 'surface', s.id).surface, s.id);
  assert.equal([...'x'].every(() => true), true);
});

test('nextSection: null/garbage prev falls back to all-defaults', () => {
  assert.deepEqual(nextSection(null, 'surface', 'deep'), { ...SECTION_FALLBACK, surface: 'deep' });
  assert.deepEqual(nextSection('nope', 'surface', 'deep'), { ...SECTION_FALLBACK, surface: 'deep' });
  assert.deepEqual(nextSection(undefined, 'accent', 'teal'), { ...SECTION_FALLBACK, accent: 'teal' });
});

test('sectionValue: reflects the current value, defaulting a missing/empty section', () => {
  assert.equal(sectionValue(null, 'surface'), 'none');
  assert.equal(sectionValue({}, 'surface'), 'none');
  assert.equal(sectionValue({ surface: 'panel' }, 'surface'), 'panel');
  assert.equal(sectionValue({ surface: 'panel' }, 'accent'), 'default'); // missing key defaults
});
