import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchContent, fieldLabel, stripMarks } from './content-search.mjs';

const blk = (type, props) => ({ type, props: { id: type.toLowerCase() + '1', ...props } });
const page = (title, content) => ({ title, data: { root: { props: { title } }, content } });
function base() {
  return { order: ['home', 'about'], pages: {
    home: page('Home', [
      blk('Hero', { headline: 'The Foundation of', highlight: 'Digital Excellence', body: 'We build what holds everything up.', ctaHref: '#book', align: 'center' }),
      blk('Faq', { heading: 'Common questions', items: [{ q: 'What is a Diagnostic?', a: 'Thirty focused minutes on the eight pillars.' }] }),
    ]),
    about: page('About us', [blk('Chapter', { body: 'Twenty years of discovery work.' })]),
  } };
}

test('empty or too-short query returns nothing', () => {
  assert.equal(searchContent(base(), '').total, 0);
  assert.equal(searchContent(base(), 'a').total, 0);
  assert.deepEqual(searchContent(base(), '').groups, []);
});

test('basic body match, grouped by page', () => {
  const r = searchContent(base(), 'holds');
  assert.equal(r.total, 1);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].pageSlug, 'home');
  assert.equal(r.groups[0].hits[0].blockType, 'Hero');
  assert.equal(r.groups[0].hits[0].field, 'body');
});

test('case-insensitive; snippet keeps the original case', () => {
  const r = searchContent(base(), 'FOUNDATION');
  assert.equal(r.total, 1);
  assert.match(r.groups[0].hits[0].snippet.text, /Foundation/);
});

test('the page title is a searchable, highest-weight field', () => {
  const r = searchContent(base(), 'About');
  const g = r.groups.find((x) => x.pageSlug === 'about');
  assert.ok(g);
  assert.equal(g.hits[0].field, 'title');
  assert.equal(g.hits[0].blockType, 'Page title');
  assert.equal(g.hits[0].score, 100);
});

test('a title hit outranks a body-only hit across pages', () => {
  const s = { order: ['p1', 'p2'], pages: {
    p1: page('Synergy report', [blk('Chapter', { body: 'nothing relevant' })]),
    p2: page('Home', [blk('Chapter', { body: 'a synergy of teams' })]),
  } };
  const r = searchContent(s, 'synergy');
  assert.equal(r.groups[0].pageSlug, 'p1');
  assert.equal(r.groups[0].hits[0].score, 100);
});

test('nested FAQ array prose is found, with a readable label', () => {
  const r = searchContent(base(), 'Diagnostic');
  const home = r.groups.find((g) => g.pageSlug === 'home');
  const hit = home.hits.find((h) => h.field === 'items.0.q');
  assert.ok(hit);
  assert.match(hit.label, /question/);
});

test('array indices in field labels are 1-based', () => {
  assert.equal(fieldLabel('Steps', 'slabs.1.title'), 'Step 2 · Title');
  assert.equal(fieldLabel('Faq', 'items.0.q'), 'Item 1 · question');
  assert.equal(fieldLabel('Hero', 'body'), 'Body');
});

test('link / href props are NOT matched as prose', () => {
  assert.equal(searchContent(base(), 'book').total, 0); // only in ctaHref:'#book'
});

test('id props are NOT matched', () => {
  assert.equal(searchContent(base(), 'hero1').total, 0);
});

test('layout enum props are skipped', () => {
  assert.equal(searchContent(base(), 'center').total, 0); // only in align:'center'
});

test('**bold** markers are stripped for both match and display', () => {
  assert.equal(stripMarks('we **embed** alongside'), 'we embed alongside');
  const s = { order: ['h'], pages: { h: page('H', [blk('Chapter', { body: 'we **embed** alongside you' })]) } };
  const r = searchContent(s, 'embed alongside');
  assert.equal(r.total, 1);
  assert.match(r.groups[0].hits[0].snippet.text, /embed alongside/);
});

test('snippet highlight offsets are snippet-relative and exact', () => {
  const long = 'x'.repeat(120) + ' findme ' + 'y'.repeat(120);
  const s = { order: ['h'], pages: { h: page('H', [blk('Chapter', { body: long })]) } };
  const sn = searchContent(s, 'findme').groups[0].hits[0].snippet;
  assert.equal(sn.text.slice(sn.hi.start, sn.hi.end).toLowerCase(), 'findme');
  assert.ok(sn.truncatedStart && sn.truncatedEnd);
});

test('per-field match count reflects repeats; group count sums', () => {
  const s = { order: ['h'], pages: { h: page('H', [blk('Chapter', { body: 'pillar pillar pillar' })]) } };
  const r = searchContent(s, 'pillar');
  assert.equal(r.groups[0].hits[0].count, 3);
  assert.equal(r.groups[0].count, 3);
});

test('malformed / partial pages are skipped, not thrown', () => {
  const s = { order: ['a', 'b'], pages: { a: {}, b: { data: { content: null } } } };
  assert.equal(searchContent(s, 'anything').total, 0);
});

test('numbers ignored; a STRING under a skip key ignored; the stat label matched', () => {
  const s = { order: ['h'], pages: { h: page('H', [blk('StatStrip', { stats: [{ value: 21, suffix: '+ hrs', label: 'Capacity recovered weekly' }] })]) } };
  assert.equal(searchContent(s, '21').total, 0);       // numeric value → ignored before SKIP_KEYS
  assert.equal(searchContent(s, 'hrs').total, 0);      // string under SKIP_KEYS 'suffix'
  assert.equal(searchContent(s, 'Capacity').total, 1); // label is prose
});

test('whitespace-only and undefined props contribute nothing', () => {
  const s = { order: ['h'], pages: { h: page('H', [blk('Chapter', { body: '   ', coda: undefined, text: 'real words' })]) } };
  assert.equal(searchContent(s, 'real').total, 1);
});

test('equal-score pages keep state.order', () => {
  const s = { order: ['first', 'second'], pages: {
    first: page('First', [blk('Chapter', { body: 'shared word' })]),
    second: page('Second', [blk('Chapter', { body: 'shared word' })]),
  } };
  assert.deepEqual(searchContent(s, 'shared').groups.map((g) => g.pageSlug), ['first', 'second']);
});

test('special characters in the query are literal (no regex / ReDoS)', () => {
  const s = { order: ['h'], pages: { h: page('H', [blk('Chapter', { body: 'cost is $5 (approx)' })]) } };
  assert.equal(searchContent(s, '$5').total, 1);
  assert.equal(searchContent(s, '(approx)').total, 1);
  assert.equal(searchContent(s, '.*').total, 0); // literal, not a wildcard
});
