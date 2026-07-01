import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxStaleness, fxStalenessDays, FX_AGEING_DAYS, FX_STALE_DAYS } from './fx-staleness.mjs';

const NOW = new Date('2026-07-01T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);

test('fxStalenessDays: whole-day floor, never negative', () => {
  assert.equal(fxStalenessDays(daysAgo(0), NOW), 0);
  assert.equal(fxStalenessDays(daysAgo(1), NOW), 1);
  assert.equal(fxStalenessDays(daysAgo(45), NOW), 45);
  // a future timestamp (clock skew) clamps to 0, not a negative age
  assert.equal(fxStalenessDays(new Date(NOW.getTime() + 5 * 86_400_000), NOW), 0);
});

test('fxStalenessDays: missing or unparseable → null', () => {
  assert.equal(fxStalenessDays(null, NOW), null);
  assert.equal(fxStalenessDays(undefined, NOW), null);
  assert.equal(fxStalenessDays('not-a-date', NOW), null);
});

test('fxStaleness: fresh below the ageing threshold', () => {
  const v = fxStaleness(daysAgo(FX_AGEING_DAYS - 1), NOW);
  assert.equal(v.level, 'fresh');
  assert.equal(v.warn, false);
});

test('fxStaleness: ageing at the threshold, still short of stale', () => {
  const v = fxStaleness(daysAgo(FX_AGEING_DAYS), NOW);
  assert.equal(v.level, 'ageing');
  assert.equal(v.warn, true);
});

test('fxStaleness: stale at/after the stale threshold', () => {
  assert.equal(fxStaleness(daysAgo(FX_STALE_DAYS), NOW).level, 'stale');
  assert.equal(fxStaleness(daysAgo(FX_STALE_DAYS + 10), NOW).level, 'stale');
  assert.equal(fxStaleness(daysAgo(FX_STALE_DAYS), NOW).warn, true);
});

test('fxStaleness: human labels', () => {
  assert.equal(fxStaleness(daysAgo(0), NOW).label, 'Rate last updated today');
  assert.equal(fxStaleness(daysAgo(1), NOW).label, 'Rate last updated yesterday');
  assert.equal(fxStaleness(daysAgo(9), NOW).label, 'Rate last updated 9 days ago');
});

test('fxStaleness: unknown when timestamp absent', () => {
  const v = fxStaleness(null, NOW);
  assert.equal(v.level, 'unknown');
  assert.equal(v.days, null);
  assert.equal(v.warn, false);
});
