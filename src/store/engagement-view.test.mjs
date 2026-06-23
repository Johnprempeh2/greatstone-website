import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engagementView } from './engagement-view.mjs';

const ITEMS = [
  { kind: 'recap', status: 'shared' },
  { kind: 'milestone', status: 'draft' },
  { kind: 'recap', status: 'draft' },
  { kind: 'deliverable', status: 'archived' },
  { kind: 'milestone', status: 'shared' },
];

test('engagementView: distinct kinds in first-seen order', () => {
  assert.deepEqual(engagementView(ITEMS).kinds, ['recap', 'milestone', 'deliverable']);
});

test('engagementView: draftCount = not shared and not archived', () => {
  assert.equal(engagementView(ITEMS).draftCount, 2); // the two 'draft' rows; archived + shared excluded
});

test('engagementView: kind filter narrows the list, "all" passes through', () => {
  assert.equal(engagementView(ITEMS, 'all').filtered.length, 5);
  assert.equal(engagementView(ITEMS, 'recap').filtered.length, 2);
  assert.equal(engagementView(ITEMS, 'deliverable').filtered.length, 1);
  assert.equal(engagementView(ITEMS, 'nope').filtered.length, 0);
});

test('engagementView: guards null/empty/garbage', () => {
  assert.deepEqual(engagementView(null), { kinds: [], draftCount: 0, filtered: [] });
  assert.deepEqual(engagementView([]), { kinds: [], draftCount: 0, filtered: [] });
  const v = engagementView([null, { kind: 'recap', status: 'shared' }, { kind: 'note', status: 'draft' }]);
  assert.deepEqual(v.kinds, ['recap', 'note']);
  assert.equal(v.draftCount, 1); // null is skipped by the `e &&` guard; shared excluded; only the 'draft' counts
});
