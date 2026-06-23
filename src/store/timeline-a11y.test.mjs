import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendeeOverflow, filterAnnouncement } from './timeline-a11y.mjs';

test('attendeeOverflow: splits shown avatars from the hidden remainder', () => {
  const r = attendeeOverflow(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 5);
  assert.deepEqual(r.shown, ['A', 'B', 'C', 'D', 'E']);
  assert.equal(r.hiddenCount, 2);
  assert.deepEqual(r.hiddenNames, ['F', 'G']);
});

test('attendeeOverflow: no overflow at or under the cap', () => {
  assert.equal(attendeeOverflow(['A', 'B', 'C'], 5).hiddenCount, 0);
  assert.equal(attendeeOverflow(['A', 'B', 'C', 'D', 'E'], 5).hiddenCount, 0);
});

test('attendeeOverflow: ignores empty/blank/garbage entries; safe on null', () => {
  const r = attendeeOverflow(['A', '', null, '  ', 'B'], 5);
  assert.deepEqual(r.shown, ['A', 'B']);
  assert.equal(r.hiddenCount, 0);
  assert.deepEqual(attendeeOverflow(null), { shown: [], hiddenCount: 0, hiddenNames: [] });
});

test('filterAnnouncement: silent when no filter is active', () => {
  assert.equal(filterAnnouncement({ filtering: false, visible: 3, total: 8 }), '');
  assert.equal(filterAnnouncement({}), '');
});

test('filterAnnouncement: reports the narrowed / empty / all-match counts', () => {
  assert.equal(filterAnnouncement({ filtering: true, visible: 3, total: 8 }), 'Showing 3 of 8 engagements.');
  assert.equal(filterAnnouncement({ filtering: true, visible: 0, total: 8 }), 'No engagements match your filters.');
  assert.equal(filterAnnouncement({ filtering: true, visible: 8, total: 8 }), 'Showing all 8 engagements.');
  assert.equal(filterAnnouncement({ filtering: true, visible: 1, total: 1 }), 'Showing all 1 engagement.');
});
