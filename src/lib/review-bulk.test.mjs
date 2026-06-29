import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBulkActions, canApprove, canDiscard } from './review-bulk.mjs';

const queue = [
  { slug: 'home', kind: 'drift' },
  { slug: 'about', kind: 'unpublished' },
  { slug: 'services', kind: 'drift' },
];

test('canApprove/canDiscard predicates', () => {
  assert.equal(canApprove({ kind: 'drift' }), true);
  assert.equal(canApprove({ kind: 'unpublished' }), true);
  assert.equal(canApprove({ kind: 'live' }), false);
  assert.equal(canDiscard({ kind: 'drift' }), true);
  assert.equal(canDiscard({ kind: 'unpublished' }), false);
});

test('drift selection is both approvable and discardable', () => {
  const r = reviewBulkActions(queue, ['home', 'services']);
  assert.equal(r.approvable, 2);
  assert.equal(r.discardable, 2);
  assert.deepEqual(r.approveSlugs.sort(), ['home', 'services']);
  assert.deepEqual(r.discardSlugs.sort(), ['home', 'services']);
});

test('unpublished selection is approvable but NOT discardable', () => {
  const r = reviewBulkActions(queue, ['about']);
  assert.equal(r.approvable, 1);
  assert.equal(r.discardable, 0);
  assert.deepEqual(r.approveSlugs, ['about']);
  assert.deepEqual(r.discardSlugs, []);
});

test('mixed selection splits the counts correctly', () => {
  const r = reviewBulkActions(queue, ['home', 'about']);
  assert.equal(r.approvable, 2);   // both publish
  assert.equal(r.discardable, 1);  // only the drift one reverts
});

test('empty selection yields zeroes', () => {
  const r = reviewBulkActions(queue, []);
  assert.deepEqual(r, { approvable: 0, discardable: 0, approveSlugs: [], discardSlugs: [] });
});

test('slugs not in the queue are ignored', () => {
  const r = reviewBulkActions(queue, ['ghost', 'home']);
  assert.equal(r.approvable, 1);
  assert.deepEqual(r.approveSlugs, ['home']);
});
