import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareChecklist, isShareReady, NEEDS_CONTENT } from './engagement-checklist.mjs';

test('shareChecklist: a milestone needs title + date (no content requirement)', () => {
  const items = shareChecklist({ kind: 'milestone', title: 'Go-live', occurredOn: '2026-06-30' });
  assert.deepEqual(items.map(i => i.key), ['title', 'date']);
  assert.ok(items.every(i => i.ok));
});

test('shareChecklist: a recap/deliverable adds a content requirement', () => {
  const items = shareChecklist({ kind: 'recap', title: 'Recap', occurredOn: '2026-06-30' });
  assert.deepEqual(items.map(i => i.key), ['title', 'date', 'content']);
  assert.equal(items.find(i => i.key === 'content').ok, false); // no link/body yet
  assert.equal(shareChecklist({ kind: 'recap', title: 'R', occurredOn: '2026-06-30', externalUrl: 'https://x' }).find(i => i.key === 'content').ok, true);
  assert.equal(shareChecklist({ kind: 'deliverable', title: 'D', occurredOn: '2026-06-30', bodyHtml: '<p>hi</p>' }).find(i => i.key === 'content').ok, true);
});

test('isShareReady: true only when every item passes', () => {
  assert.equal(isShareReady({ kind: 'milestone', title: 'X', occurredOn: '2026-06-30' }), true);
  assert.equal(isShareReady({ kind: 'milestone', title: '', occurredOn: '2026-06-30' }), false); // no title
  assert.equal(isShareReady({ kind: 'milestone', title: 'X', occurredOn: '' }), false); // no date
  assert.equal(isShareReady({ kind: 'recap', title: 'X', occurredOn: '2026-06-30' }), false); // recap, no content
  assert.equal(isShareReady({ kind: 'recap', title: 'X', occurredOn: '2026-06-30', bodyHtml: '<p>r</p>' }), true);
});

test('shareChecklist: whitespace-only fields are not "present"; empty arg is safe', () => {
  assert.equal(shareChecklist({ kind: 'note', title: '   ', occurredOn: '2026-06-30' }).find(i => i.key === 'title').ok, false);
  assert.deepEqual(shareChecklist().map(i => i.key), ['title', 'date']);
  assert.ok(NEEDS_CONTENT.has('recap') && NEEDS_CONTENT.has('deliverable'));
});
