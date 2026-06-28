import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSeo } from './seo-check.mjs';

const page = (slug, seo) => ({ title: slug, seo, data: { root: { props: { title: slug } }, content: [] } });
const S = (pageMap) => ({ order: Object.keys(pageMap), pages: pageMap });
const ids = (r) => r.groups.flatMap((g) => g.issues.map((i) => i.ruleId));
const GOOD_T = 'Digital transformation partners in London for teams'; // intended 40–60
const GOOD_D = 'Greatstone embeds alongside your team to modernise how you work, with AI as the accelerator and twenty years of delivery behind it.'; // intended 110–158
const ALT_T = 'A distinct, sufficiently long meta title for page B';
const ALT_D = 'A clearly different description that sits comfortably inside the SeoPanel ideal length range for snippets shown.';

test('GOOD_T / GOOD_D / ALT_* land in the SeoPanel ideal ranges (fixture sanity)', () => {
  assert.ok(GOOD_T.length >= 40 && GOOD_T.length <= 60, 'GOOD_T len=' + GOOD_T.length);
  assert.ok(GOOD_D.length >= 110 && GOOD_D.length <= 158, 'GOOD_D len=' + GOOD_D.length);
  assert.ok(ALT_T.length >= 40 && ALT_T.length <= 60, 'ALT_T len=' + ALT_T.length);
  assert.ok(ALT_D.length >= 110 && ALT_D.length <= 158, 'ALT_D len=' + ALT_D.length);
});

test('a well-formed unique page is clean', () => {
  assert.equal(checkSeo(S({ home: page('home', { title: GOOD_T, description: GOOD_D }) })).total, 0);
});

test('missing title → no-title error', () => {
  const r = checkSeo(S({ home: page('home', { title: '', description: GOOD_D }) }));
  assert.ok(ids(r).includes('no-title'));
  assert.equal(r.errors, 1);
});

test('missing description → no-desc error (the common real finding)', () => {
  assert.ok(ids(checkSeo(S({ home: page('home', { title: GOOD_T, description: '' }) }))).includes('no-desc'));
});

test('title too short / too long → warn', () => {
  assert.ok(ids(checkSeo(S({ a: page('a', { title: 'Home', description: GOOD_D }) }))).includes('title-short'));
  assert.ok(ids(checkSeo(S({ a: page('a', { title: 'x'.repeat(80), description: GOOD_D }) }))).includes('title-long'));
});

test('description too short / too long → warn', () => {
  assert.ok(ids(checkSeo(S({ a: page('a', { title: GOOD_T, description: 'too short' }) }))).includes('desc-short'));
  assert.ok(ids(checkSeo(S({ a: page('a', { title: GOOD_T, description: 'y'.repeat(200) }) }))).includes('desc-long'));
});

test('a duplicate TITLE across two pages is an error on BOTH, naming the other', () => {
  const r = checkSeo(S({
    about: page('about', { title: GOOD_T, description: GOOD_D }),
    services: page('services', { title: GOOD_T, description: ALT_D }),
  }));
  assert.equal(r.groups.filter((g) => g.issues.some((i) => i.ruleId === 'dup-title')).length, 2);
  assert.match(r.groups.find((g) => g.pageSlug === 'about').issues.find((i) => i.ruleId === 'dup-title').suggestion, /services/);
});

test('a duplicate DESCRIPTION across two pages is an error', () => {
  const r = checkSeo(S({ a: page('a', { title: GOOD_T, description: GOOD_D }), b: page('b', { title: ALT_T, description: GOOD_D }) }));
  assert.ok(ids(r).includes('dup-desc'));
});

test('a single page is never a duplicate with itself', () => {
  assert.ok(!ids(checkSeo(S({ home: page('home', { title: GOOD_T, description: GOOD_D }) }))).includes('dup-title'));
});

test('empty descriptions do NOT collide as duplicates (just no-desc each)', () => {
  const r = checkSeo(S({ a: page('a', { title: GOOD_T, description: '' }), b: page('b', { title: ALT_T, description: '' }) }));
  assert.ok(!ids(r).includes('dup-desc'));
  assert.equal(ids(r).filter((x) => x === 'no-desc').length, 2);
});

test('length rules do not co-fire with missing', () => {
  const r = checkSeo(S({ home: page('home', { title: '', description: GOOD_D }) }));
  assert.deepEqual(r.groups[0].issues.filter((i) => i.field === 'title').map((i) => i.ruleId), ['no-title']);
});

test('boundary lengths (40 / 60 / 110 / 158) are clean', () => {
  assert.equal(checkSeo(S({ a: page('a', { title: 'a'.repeat(40), description: 'c'.repeat(110) }) })).total, 0);
  assert.equal(checkSeo(S({ b: page('b', { title: 'b'.repeat(60), description: 'd'.repeat(158) }) })).total, 0);
});

test('counts add up and the worst page sorts first', () => {
  const r = checkSeo(S({ clean: page('clean', { title: GOOD_T, description: GOOD_D }), bad: page('bad', { title: '', description: '' }) }));
  assert.equal(r.total, r.errors + r.warnings);
  assert.equal(r.groups[0].pageSlug, 'bad');
});

test('tolerates missing state / a page with no seo key without throwing', () => {
  assert.equal(checkSeo({}).total, 0);
  assert.equal(checkSeo(S({ home: { title: 'home', data: { root: { props: { title: 'home' } }, content: [] } } })).errors, 2);
});
