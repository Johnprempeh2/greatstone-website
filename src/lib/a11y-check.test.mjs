import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkA11y } from './a11y-check.mjs';

const blk = (type, props) => ({ type, props: { id: type.toLowerCase() + '1', ...props } });
const page = (title, content) => ({ title, data: { root: { props: { title } }, content } });
const S = (content, title = 'Home') => ({ order: ['home'], pages: { home: page(title, content) } });
const ids = (r) => r.groups.flatMap((g) => g.issues.map((i) => i.ruleId));
const HERO = (h = 'We build what holds everything up.') => blk('Hero', { headline: h });

// ---- vague link text (2.4.4): true positives ----
test('"Read more" CTA with a real link is flagged (2.4.4)', () => {
  const r = checkA11y(S([HERO(), blk('Chapter', { ctaLabel: 'Read more', ctaHref: '#go/method' })]));
  const hit = r.groups[0].issues.find((i) => i.ruleId === 'link-text');
  assert.ok(hit);
  assert.equal(hit.wcag, '2.4.4');
  assert.equal(hit.severity, 'warn');
});

test('"Click here" / "learn more" / "details" / "this" are all flagged', () => {
  for (const label of ['Click here', 'learn more', 'Details', 'this']) {
    const r = checkA11y(S([HERO(), blk('Chapter', { ctaLabel: label, ctaHref: '#go/about' })]));
    assert.ok(ids(r).includes('link-text'), label + ' should be flagged');
  }
});

// ---- vague link text: false-positive guards ----
test('a descriptive CTA is NOT flagged', () => {
  assert.ok(!ids(checkA11y(S([HERO(), blk('Chapter', { ctaLabel: 'See the eight pillars', ctaHref: '#go/method' })]))).includes('link-text'));
});

test('"Book a Diagnostic" is NOT flagged', () => {
  assert.equal(checkA11y(S([blk('Hero', { headline: 'X', ctaLabel: 'Book a Diagnostic', ctaHref: '#book' })])).total, 0);
});

test('"Read our 2026 report" (vague word inside real words) is NOT flagged — exact set, not substring', () => {
  assert.ok(!ids(checkA11y(S([HERO(), blk('Chapter', { ctaLabel: 'Read our 2026 report', ctaHref: '#go/insights' })]))).includes('link-text'));
});

test('a vague label with NO real link is NOT flagged (that is Link-health\'s job)', () => {
  assert.ok(!ids(checkA11y(S([HERO(), blk('Chapter', { ctaLabel: 'Read more', ctaHref: '#' })]))).includes('link-text'));
});

test('an array-item label like "Read more" is NOT flagged (whole card is the anchor)', () => {
  // PillarCards pillars[].name is part of a card-wide anchor, not a standalone link label → not 2.4.4
  const r = checkA11y(S([HERO(), blk('PillarCards', { pillars: [{ name: 'Read more', href: '#go/method' }] })]));
  assert.ok(!ids(r).includes('link-text'));
});

// ---- headings (2.4.6 / 1.3.1) ----
test('a single Hero page is clean (one H1)', () => {
  assert.equal(checkA11y(S([HERO(), blk('Chapter', { headline: 'A second section' })])).total, 0);
});

test('a page with no H1-emitting block → no-h1 error', () => {
  const r = checkA11y(S([blk('Chapter', { headline: 'Just a chapter' })]));
  assert.ok(ids(r).includes('no-h1'));
  assert.equal(r.errors, 1);
});

test('two non-empty H1 blocks → one multi-h1 error on the second', () => {
  const r = checkA11y(S([HERO('First main heading'), blk('TimeCounter', { headline: 'Second main heading' })]));
  const multi = r.groups[0].issues.filter((i) => i.ruleId === 'multi-h1');
  assert.equal(multi.length, 1);
  assert.equal(multi[0].blockType, 'TimeCounter');
});

test('a Hero with a blank headline AND blank highlight → empty-h1 (not no-h1)', () => {
  const r = checkA11y(S([blk('Hero', { headline: '   ', highlight: '' })]));
  assert.ok(ids(r).includes('empty-h1'));
  assert.ok(!ids(r).includes('no-h1'));
});

test('a Hero with a blank headline but a non-empty highlight is a valid H1 (realistic case)', () => {
  assert.equal(checkA11y(S([blk('Hero', { headline: '', highlight: 'We build what holds everything up.' })])).total, 0);
});

test('headlineSuffix counts toward the heading text', () => {
  assert.equal(checkA11y(S([blk('Hero', { headline: '', highlight: '', headlineSuffix: 'the rest.' })])).total, 0);
});

test('Hero stacked lines count as the heading text', () => {
  assert.equal(checkA11y(S([blk('Hero', { headline: '', lines: [{ text: 'Pebble.' }, { text: 'Peak.' }] })])).total, 0);
});

// ---- shape / grouping ----
test('errors sort before warnings within a page', () => {
  const r = checkA11y(S([blk('Chapter', { ctaLabel: 'here', ctaHref: '#go/x' })])); // no-h1 (error) + vague link (warn)
  assert.equal(r.groups[0].issues[0].severity, 'error');
});

test('counts add up (total = errors + warnings) and the worst page sorts first', () => {
  const s = { order: ['a', 'b'], pages: {
    a: page('A', [HERO(), blk('Chapter', { ctaLabel: 'See the method', ctaHref: '#go/method' })]),
    b: page('B', [blk('Chapter', { ctaLabel: 'more', ctaHref: '#go/x' })]),
  } };
  const r = checkA11y(s);
  assert.equal(r.total, r.errors + r.warnings);
  assert.equal(r.groups[0].pageSlug, 'b');
});

test('a fully clean site returns no groups', () => {
  assert.deepEqual(checkA11y(S([HERO()])).groups, []);
});
