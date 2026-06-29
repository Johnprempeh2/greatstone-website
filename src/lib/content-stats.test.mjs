import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeContent, countWords, THIN_WORDS } from './content-stats.mjs';

const blk = (type, props = {}) => ({ type, props });
const page = (title, content = [], status = 'published') => ({ title, status, data: { root: { props: { title } }, content } });
const S = (pages) => ({ order: Object.keys(pages), pages });
const row = (r, slug) => r.rows.find((x) => x.slug === slug);
const wordsStr = (n) => Array(n).fill('w').join(' ');

test('countWords: empty / whitespace / bold-strip / multi-space', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n\t'), 0);
  assert.equal(countWords('**bold**'), 1);       // ** stripped, not its own token
  assert.equal(countWords('a **b** c'), 3);
  assert.equal(countWords('one   two\nthree'), 3);
  assert.equal(countWords(null), 0);
});

test('true positive: title + one block → exact words / blocks / wpb / readMins', () => {
  const r = analyzeContent(S({ home: page('Hello world', [blk('Text', { body: 'a b c' })]) }));
  const h = row(r, 'home');
  assert.equal(h.words, 5);          // title 2 + body 3
  assert.equal(h.blocks, 1);
  assert.equal(h.wordsPerBlock, 5);
  assert.equal(h.readMins, 1);
});

test('readMins: 220 words → 2 min; a non-empty page floors at 1', () => {
  assert.equal(row(analyzeContent(S({ a: page('t', [blk('B', { body: wordsStr(219) })]) })), 'a').readMins, 2); // title1+219=220
  assert.equal(row(analyzeContent(S({ a: page('hi', []) })), 'a').readMins, 1); // 1 word → 1 min
});

test('THIN fires on a near-empty page; not skeleton/bulk (single block)', () => {
  const h = row(analyzeContent(S({ n: page('Home', [blk('Hero', { body: 'Start composing here now please' })]) })), 'n');
  assert.equal(h.thin, true);        // 6 words < 120
  assert.equal(h.skeleton, false);   // 1 block
  assert.equal(h.bulk, false);       // single block + thin
});

test('SKELETON fires: 4+ blocks, near-zero prose each', () => {
  const five = Array.from({ length: 5 }, () => blk('Sec', { body: 'a b c' }));
  const h = row(analyzeContent(S({ s: page('S', five) })), 's');
  assert.equal(h.skeleton, true);    // 5 blocks, wpb 3 < 25
  assert.equal(h.thin, true);        // 16 words
});

test('BULK fires when one of several blocks dominates a substantial page; carries maxBlockType', () => {
  const h = row(analyzeContent(S({ b: page('a b', [blk('Big', { body: wordsStr(160) }), blk('Small', { body: 'a b' })]) })), 'b');
  assert.equal(h.bulk, true);        // 160 / (2+160+2)=0.976 > 0.70, blocks 2, words ≥ 120
  assert.equal(h.maxBlockType, 'Big');
  assert.equal(h.thin, false);
});

test('BULK boundary: ~0.70 share does NOT flag (strict >, mirrors industries 0.6966)', () => {
  // title 2 + 138 + 60 = 200 words; max share 138/200 = 0.69 < 0.70
  const h = row(analyzeContent(S({ x: page('a b', [blk('Pick', { body: wordsStr(138) }), blk('Rest', { body: wordsStr(60) })]) })), 'x');
  assert.equal(h.bulk, false);
});

test('a blank "+ New page" reads THIN (not skeleton, not bulk) — the live-demo case', () => {
  // a fresh page: a hero with a few placeholder words, one block
  const h = row(analyzeContent(S({ untitled: page('Untitled', [blk('Hero', { headline: 'New page', body: 'Add your content' })]) })), 'untitled');
  assert.equal(h.thin, true);
  assert.equal(h.skeleton, false);
  assert.equal(h.bulk, false);
});

test('edges: non-prose props contribute 0; nested array prose is counted', () => {
  const noProse = row(analyzeContent(S({ a: page('t', [blk('Img', { image: 'x.png', align: 'left', id: 'i1', ctaHref: '#go/x' })]) })), 'a');
  assert.equal(noProse.words, 1);    // title only; the block's keys are all skipped
  const nested = row(analyzeContent(S({ b: page('t', [blk('FAQ', { items: [{ q: 'one two', a: 'three' }] })]) })), 'b');
  assert.equal(nested.words, 4);     // title 1 + 'one two'(2) + 'three'(1)
});

test('malformed / empty state never throws', () => {
  assert.deepEqual(analyzeContent(null), { rows: [], summary: { pages: 0, totalWords: 0, totalReadMins: 0, medianWords: 0, thinCount: 0 } });
  assert.deepEqual(analyzeContent({}).rows, []);
  assert.equal(analyzeContent({ order: ['x'], pages: {} }).rows.length, 0);
  assert.doesNotThrow(() => analyzeContent(S({ a: { title: 'a', data: null } })));
});

test('summary: median (odd + even) + thinCount', () => {
  const mk = (n) => page('t', [blk('B', { body: wordsStr(n - 1) })]); // title 1 + (n-1) = n words
  const odd = analyzeContent(S({ a: mk(10), b: mk(20), c: mk(30) }));
  assert.equal(odd.summary.medianWords, 20);
  const even = analyzeContent(S({ a: mk(10), b: mk(20), c: mk(30), d: mk(40) }));
  assert.equal(even.summary.medianWords, 25); // mean(20,30)
  const thinny = analyzeContent(S({ a: mk(10), b: mk(200), c: mk(50) }));
  assert.equal(thinny.summary.thinCount, 2);  // 10 and 50 are < 120
});

test('seed-realism: a representative authored page is NOT thin/skeleton', () => {
  const four = Array.from({ length: 4 }, () => blk('Sec', { body: wordsStr(50) }));
  const h = row(analyzeContent(S({ about: page('About us', four) })), 'about');
  assert.equal(h.thin, false);       // ~202 words
  assert.equal(h.skeleton, false);   // wpb ~50 >= 25
  assert.ok(h.words >= THIN_WORDS);
});
