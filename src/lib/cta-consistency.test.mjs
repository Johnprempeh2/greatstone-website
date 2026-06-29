import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCtaReport } from './cta-consistency.mjs';

// store-free fixtures — defaults are pre-merged (tests never call store.js blk()).
const blk = (props) => ({ type: 'Hero', props });
const page = (content, status = 'published') => ({ status, data: { root: { props: { title: 'P' } }, content } });
const S = (pages, redirects = []) => ({ order: Object.keys(pages), pages, redirects });

// the real seed's #go/method label spread (7 distinct, incl. the MethodTieIn default 'See the 8 pillars',
// pre-merged here since the fixture can't call blk()).
const METHOD_LABELS = ['Explore the eight pillars', 'See the Method', 'Explore the 8 pillars', 'See the method', 'See how we work', 'Explore the Method', 'See the 8 pillars'];

test('true positive: one destination reached by 7 distinct labels → inconsistent first + casingDupe', () => {
  const content = METHOD_LABELS.map((l, i) => blk({ id: 'b' + i, ctaLabel: l, ctaHref: '#go/method' }));
  const r = buildCtaReport(S({ a: page(content) }));
  assert.equal(r.destinations['#go/method'].distinct, 7);
  assert.equal(r.destinations['#go/method'].casingDupe, true);
  assert.equal(r.inconsistent[0].dest, '#go/method');
});

test('casing dupe: "See the Method" vs "See the method" grouped under one lowercase key', () => {
  const content = METHOD_LABELS.map((l, i) => blk({ id: 'b' + i, ctaLabel: l, ctaHref: '#go/method' }));
  const r = buildCtaReport(S({ a: page(content) }));
  const cd = r.casingDupes.find((c) => c.dest === '#go/method');
  assert.ok(cd);
  const grp = cd.groups.find((g) => g.lower === 'see the method');
  assert.ok(grp);
  assert.equal(grp.variants.length, 2);
});

test('hidden CTA: blank label + real href → emptyLabel, NOT in the conversion map (inverse dead CTA)', () => {
  const r = buildCtaReport(S({ a: page([blk({ id: 'h', ctaLabel: '', ctaHref: '#book' })]) }));
  assert.equal(r.emptyLabel.length, 1);
  assert.equal(r.emptyLabel[0].dest, '#book');
  assert.equal(r.perPage.a.length, 0);
  assert.equal(r.summary.emptyLabelCount, 1);
});

test('false-positive guard: a destination with one consistent label is never flagged', () => {
  const r = buildCtaReport(S({ a: page([blk({ ctaLabel: 'Book a Diagnostic', ctaHref: '#book' }), blk({ ctaLabel: 'Book a Diagnostic', ctaHref: '#book' }), blk({ ctaLabel: 'Book a Diagnostic', ctaHref: '#book' })]) }));
  assert.equal(r.destinations['#book'].distinct, 1);
  assert.equal(r.inconsistent.length, 0);
  assert.equal(r.casingDupes.length, 0);
});

test('redirect collapse: #go/process and #go/method bucket together (one destination)', () => {
  const st = { order: ['a'], pages: { a: page([blk({ ctaLabel: 'Old', ctaHref: '#go/process' }), blk({ ctaLabel: 'New', ctaHref: '#go/method' })]), method: page([]) }, redirects: [{ from: 'process', to: 'method' }] };
  const r = buildCtaReport(st);
  assert.ok(r.destinations['#go/method']);
  assert.equal(r.destinations['#go/method'].distinct, 2);
  assert.equal(r.destinations['#go/process'], undefined);
});

test('dynamic exclusion: the insights hub page contributes no CTAs', () => {
  const r = buildCtaReport(S({ insights: page([blk({ ctaLabel: 'X', ctaHref: '#go/method' })]), a: page([blk({ ctaLabel: 'Y', ctaHref: '#book' })]) }), { dynamic: ['insights'] });
  assert.equal(r.perPage.insights, undefined);
  assert.equal(r.destinations['#go/method'], undefined);
  assert.ok(r.destinations['#book']);
});

test('dead-ends: published pages with no visible CTA; drafts excluded; all-CTA → 0', () => {
  const st = S({ pub: page([], 'published'), hidden: page([blk({ ctaLabel: '', ctaHref: '#book' })], 'published'), draft: page([], 'draft') });
  const r = buildCtaReport(st);
  assert.ok(r.deadEnds.includes('pub'));
  assert.ok(r.deadEnds.includes('hidden')); // only a hidden CTA → still a dead end
  assert.ok(!r.deadEnds.includes('draft'));
  assert.equal(buildCtaReport(S({ a: page([blk({ ctaLabel: 'Go', ctaHref: '#book' })], 'published') })).deadEnds.length, 0);
});

test('empty / malformed state never throws; summary all-zero', () => {
  assert.doesNotThrow(() => buildCtaReport({}));
  const r = buildCtaReport({ order: [], pages: {} });
  assert.equal(r.inconsistent.length, 0);
  assert.equal(r.summary.destinations, 0);
  assert.equal(r.summary.casingDupeCount, 0);
  assert.equal(r.summary.deadEndCount, 0);
});

test("empty href ('' / '#') is not counted as a CTA", () => {
  const r = buildCtaReport(S({ a: page([blk({ ctaLabel: 'Ghost', ctaHref: '' }), blk({ cardCtaLabel: 'Also ghost', cardCtaHref: '#' })]) }));
  assert.equal(r.summary.destinations, 0);
  assert.equal(r.perPage.a.length, 0);
  assert.equal(r.emptyLabel.length, 0); // a blank-DEST is not a hidden CTA either
});
