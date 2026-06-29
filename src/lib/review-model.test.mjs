import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewQueue } from './review-model.mjs';

const blk = (type, props = {}) => ({ type, props: { id: type + '1', ...props } });
const page = (over) => ({ title: 'P', status: 'published', data: { root: { props: { title: 'P' } }, content: [] }, published: { root: { props: { title: 'P' } }, content: [] }, versions: [], ...over });
const S = (pages) => ({ order: Object.keys(pages), pages });

test('a published page with edits = drift, carries a diff of what changed', () => {
  const data = { root: { props: { title: 'P' } }, content: [blk('Hero', { headline: 'New' })] };
  const published = { root: { props: { title: 'P' } }, content: [blk('Hero', { headline: 'Old' })] };
  const r = buildReviewQueue(S({ a: page({ data, published }) }));
  const it = r.review.find((x) => x.slug === 'a');
  assert.equal(it.kind, 'drift');
  assert.ok(it.diff);
  assert.equal(it.diff.counts.changed, 1); // the Hero headline changed
  assert.equal(r.counts.drift, 1);
});

test('a never-published page = unpublished (no diff)', () => {
  const r = buildReviewQueue(S({ a: page({ published: null, status: 'draft', data: { content: [blk('Hero')] } }) }));
  const it = r.review.find((x) => x.slug === 'a');
  assert.equal(it.kind, 'unpublished');
  assert.equal(it.diff, null);
  assert.equal(it.everPublished, false);
  assert.equal(r.counts.unpublished, 1);
});

test('a published page identical to live = live, not in the review queue', () => {
  const same = { root: { props: { title: 'P' } }, content: [blk('Hero', { headline: 'Same' })] };
  const r = buildReviewQueue(S({ a: page({ data: same, published: same }) }));
  assert.equal(r.review.length, 0);
  assert.equal(r.counts.live, 1);
});

test('review queue is ordered drift-first, then unpublished', () => {
  const data = { content: [blk('Hero', { headline: 'X' })] };
  const r = buildReviewQueue(S({
    nu: page({ published: null, status: 'draft', data: { content: [blk('Hero')] } }),
    dr: page({ data, published: { content: [blk('Hero', { headline: 'Y' })] } }),
    lv: page(),
  }));
  assert.deepEqual(r.review.map((i) => i.slug), ['dr', 'nu']); // drift before unpublished; live excluded
  assert.equal(r.counts.pending, 2);
});

test('lastPub reads the dedicated Published label, not a newer non-publish snapshot', () => {
  const data = { content: [blk('Hero', { headline: 'New' })] };
  const published = { content: [blk('Hero', { headline: 'Old' })] };
  const versions = [
    { label: 'Published', ts: 1000, by: 'ann@x', status: 'published' },
    { label: 'Before discard', ts: 2000, by: 'bob@x', status: 'draft' }, // newer, but NOT a publish
  ];
  const it = buildReviewQueue(S({ a: page({ data, published, versions }) })).review[0];
  assert.equal(it.lastPub.ts, 1000);
  assert.equal(it.lastPub.by, 'ann@x');
});

test('empty / malformed state never throws', () => {
  assert.doesNotThrow(() => buildReviewQueue());
  const r = buildReviewQueue({ order: [], pages: {} });
  assert.deepEqual(r.review, []);
  assert.equal(r.counts.pending, 0);
});
