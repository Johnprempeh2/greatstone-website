import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, recencyBucket, portfolioHealth, quietFirstRank } from './client-recency.mjs';

const NOW = Date.UTC(2026, 5, 23, 12, 0, 0);
const ago = (n) => new Date(NOW - n * 86400000).toISOString();

test('daysSince: guards absent + Invalid Date', () => {
  assert.equal(daysSince(null, NOW), null);
  assert.equal(daysSince('nope', NOW), null);
  assert.equal(daysSince(ago(5), NOW), 5);
});

test('recencyBucket: thresholds align with staleBadge (30/60)', () => {
  assert.equal(recencyBucket(ago(0), NOW), 'active');
  assert.equal(recencyBucket(ago(7), NOW), 'active');
  assert.equal(recencyBucket(ago(8), NOW), 'steady');
  assert.equal(recencyBucket(ago(30), NOW), 'steady');
  assert.equal(recencyBucket(ago(31), NOW), 'quiet');
  assert.equal(recencyBucket(ago(60), NOW), 'quiet');
  assert.equal(recencyBucket(ago(61), NOW), 'cold');
  assert.equal(recencyBucket(null, NOW), 'none');
});

test('portfolioHealth: counts each bucket, tolerates junk/empty', () => {
  const counts = portfolioHealth([ago(1), ago(5), ago(20), ago(45), ago(90), null, 'junk'], NOW);
  assert.deepEqual(counts, { active: 2, steady: 1, quiet: 1, cold: 1, none: 2 });
  assert.deepEqual(portfolioHealth([], NOW), { active: 0, steady: 0, quiet: 0, cold: 0, none: 0 });
  assert.deepEqual(portfolioHealth(null, NOW), { active: 0, steady: 0, quiet: 0, cold: 0, none: 0 });
});

test('quietFirstRank: more days = higher; no activity = Infinity (most quiet)', () => {
  assert.equal(quietFirstRank(ago(3), NOW), 3);
  assert.equal(quietFirstRank(ago(90), NOW), 90);
  assert.equal(quietFirstRank(null, NOW), Infinity);
  // a list sorted quiet-first surfaces the coldest + no-activity clients at the top
  const list = [ago(2), null, ago(45), ago(10)];
  const ordered = [...list].sort((a, b) => quietFirstRank(b, NOW) - quietFirstRank(a, NOW));
  assert.deepEqual(ordered, [null, ago(45), ago(10), ago(2)]);
});
