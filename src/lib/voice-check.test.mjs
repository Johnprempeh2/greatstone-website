import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkVoice } from './voice-check.mjs';

const blk = (type, props) => ({ type, props: { id: type.toLowerCase() + '1', ...props } });
const page = (title, content) => ({ title, data: { root: { props: { title } }, content } });
const S = (content, title = 'Home') => ({ order: ['home'], pages: { home: page(title, content) } });
const ids = (r) => r.groups.flatMap((g) => g.issues.map((i) => i.ruleId));

// ---- true positives ----
test('a banned word is flagged with its rule + suggestion', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'We leverage our network.' })]));
  assert.equal(r.total, 1);
  assert.equal(r.groups[0].issues[0].ruleId, 'banned');
  assert.equal(r.groups[0].issues[0].severity, 'flag');
  assert.match(r.groups[0].issues[0].suggestion, /use 'use'/);
});

test('two banned words in one block → two issues', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'A robust, holistic approach.' })]));
  assert.equal(r.flags, 2);
});

test('whilst is flagged with a while suggestion', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'Wait here whilst we set up.' })]));
  assert.ok(ids(r).includes('whilst'));
  assert.match(r.groups[0].issues.find((i) => i.ruleId === 'whilst').suggestion, /while/);
});

test('an em-dash is a HARD issue and sorts first', () => {
  const r = checkVoice(S([blk('Hero', { headline: 'We build — and we hold.' })]));
  const hard = r.groups[0].issues[0];
  assert.equal(hard.ruleId, 'em-dash');
  assert.equal(hard.severity, 'hard');
  assert.equal(r.hard, 1);
});

test('the "not just X, it\'s Y" tic is flagged once', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'Not just a vendor, it’s a partner.' })]));
  assert.ok(ids(r).includes('not-just'));
});

test('a filler phrase is flagged', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'At the end of the day, results matter.' })]));
  assert.ok(ids(r).includes('phrase'));
});

test('a banned word in the PAGE TITLE is flagged', () => {
  const r = checkVoice(S([blk('Hero', { headline: 'clean' })], 'Our transformative offer'));
  const hit = r.groups[0].issues.find((i) => i.field === 'title');
  assert.ok(hit);
  assert.equal(hit.blockType, 'Page title');
});

test('worst-offender ordering: the busier page sorts first', () => {
  const s = { order: ['a', 'b'], pages: {
    a: page('A', [blk('Chapter', { body: 'one leverage' })]),
    b: page('B', [blk('Chapter', { body: 'robust holistic seamless' })]),
  } };
  assert.equal(checkVoice(s).groups[0].pageSlug, 'b');
});

test('counts add up (total = hard + flags)', () => {
  const r = checkVoice(S([blk('Hero', { headline: 'A — b', body: 'leverage robust' })]));
  assert.equal(r.total, r.hard + r.flags);
  assert.equal(r.hard, 1);
});

// ---- false-positive guards (the load-bearing half) ----
test('clean on-brand copy yields zero issues', () => {
  const r = checkVoice(S([blk('Hero', { headline: 'We build what holds everything up.', body: 'A transformation partner, not a software house.' })]));
  assert.equal(r.total, 0);
  assert.deepEqual(r.groups, []);
});

test('"Deep Dive" the noun is NOT flagged', () => {
  assert.equal(checkVoice(S([blk('Chapter', { body: 'Book a Deep Dive with us.' })])).total, 0);
});

test('hyphens and en-dash ranges are NOT em-dashes', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'Our best-in-class, fast-paced range of 5–10 days.' })]));
  // "best-in-class" / "world-class" are word-list flags, but NEVER the hard em-dash rule
  assert.equal(r.hard, 0);
  assert.ok(!ids(r).includes('em-dash'));
});

test('a banned word inside a larger token is NOT flagged (word boundary)', () => {
  assert.equal(checkVoice(S([blk('Chapter', { body: 'We roast Robusta beans.' })])).total, 0); // not "robust"
});

test('literal navigate / geographic landscape are NOT flagged (metaphor collocation only)', () => {
  assert.equal(checkVoice(S([blk('Chapter', { body: 'Navigate to the next page across the river landscape.' })])).total, 0);
});

test('metaphor collocations ARE flagged', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'We help you navigate complexity in the AI landscape on your digital journey.' })]));
  const got = ids(r);
  assert.ok(got.includes('navigate') && got.includes('landscape') && got.includes('journey'));
});

test('the not-just tic used twice on a page yields ONE issue, relabelled', () => {
  const r = checkVoice(S([blk('Chapter', { body: 'Not just fast, it’s precise. Also not just cheap, it’s worth it.' })]));
  const nj = r.groups[0].issues.filter((i) => i.ruleId === 'not-just');
  assert.equal(nj.length, 1);
  assert.match(nj[0].label, /used 2 times/);
});

test('a banned-looking token inside a link/href is NOT flagged (upstream exclusion)', () => {
  assert.equal(checkVoice(S([blk('Hero', { headline: 'clean', ctaHref: '#leverage-page' })])).total, 0);
});

test('British spellings are clean', () => {
  assert.equal(checkVoice(S([blk('Chapter', { body: 'We organise and optimise the programme while you watch.' })])).total, 0);
});
