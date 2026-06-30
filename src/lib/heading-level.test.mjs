import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingTag, headingLevelNum, HEADING_LEVELS } from './heading-level.mjs';

test('headingTag returns a safe element, clamped to the H2-H4 allowlist', () => {
  assert.equal(headingTag('h2'), 'h2');
  assert.equal(headingTag('h3'), 'h3');
  assert.equal(headingTag('h4'), 'h4');
  assert.equal(headingTag('H3'), 'h3'); // case-insensitive
});

test('headingTag rejects anything outside the allowlist (no H1, no scripts, no h7)', () => {
  for (const bad of ['h1', 'h5', 'h7', 'script', '', null, undefined, 'h3 onload=x']) {
    assert.equal(headingTag(bad), 'h2', JSON.stringify(bad) + ' must fall back to h2');
  }
});

test('headingTag honours a custom fallback (a block whose default is not h2)', () => {
  assert.equal(headingTag(undefined, 'h3'), 'h3');
  assert.equal(headingTag('nonsense', 'h3'), 'h3');
});

test('headingLevelNum mirrors headingTag for the outline tooling', () => {
  assert.equal(headingLevelNum('h3'), 3);
  assert.equal(headingLevelNum('h4'), 4);
  assert.equal(headingLevelNum(undefined), 2);
  assert.equal(headingLevelNum('h9'), 2);
});

test('HEADING_LEVELS is a closed H2/H3/H4 set with H2 default first', () => {
  assert.deepEqual(HEADING_LEVELS.map((h) => h.id), ['h2', 'h3', 'h4']);
});
