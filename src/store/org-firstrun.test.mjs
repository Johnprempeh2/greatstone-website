import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstRunState } from './org-firstrun.mjs';

test('firstRunState: brand-new org (no engagements, no orders)', () => {
  assert.deepEqual(firstRunState({ engagements: [], orders: [] }), { timelineEmpty: true, isBrandNew: true, hasOrdersNoEngagements: false });
});

test('firstRunState: bought but no engagements yet', () => {
  assert.deepEqual(firstRunState({ engagements: [], orders: [{ id: 1 }] }), { timelineEmpty: true, isBrandNew: false, hasOrdersNoEngagements: true });
});

test('firstRunState: has engagements → not a timeline empty-state', () => {
  const r = firstRunState({ engagements: [{ id: 1 }], orders: [] });
  assert.equal(r.timelineEmpty, false);
  assert.equal(r.isBrandNew, false);
  assert.equal(r.hasOrdersNoEngagements, false);
});

test('firstRunState: null/undefined/garbage is treated as empty and safe', () => {
  assert.deepEqual(firstRunState(), { timelineEmpty: true, isBrandNew: true, hasOrdersNoEngagements: false });
  assert.deepEqual(firstRunState({ engagements: null, orders: undefined }), { timelineEmpty: true, isBrandNew: true, hasOrdersNoEngagements: false });
  // falsy entries are ignored in the counts
  assert.equal(firstRunState({ engagements: [null, false], orders: [] }).isBrandNew, true);
});
