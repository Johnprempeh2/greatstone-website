import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBlocks } from './block-usage-model.mjs';

const blk = (type, props = {}) => ({ type, props });
const page = (content = []) => ({ data: { root: { props: {} }, content } });
const S = (pages, order) => ({ order: order || Object.keys(pages), pages });
const KNOWN = ['Hero', 'Invite', 'Faq', 'Quote'];
const CATS = { page: { title: 'Page', components: ['Hero', 'Invite'] }, proof: { title: 'Proof', components: ['Faq', 'Quote'] } };
const row = (r, t) => r.rows.find((x) => x.type === t);

test('an unused KNOWN type surfaces as a row (instances 0, unused true) — the core point', () => {
  const r = analyzeBlocks(S({ a: page([blk('Hero')]) }), KNOWN, CATS);
  assert.equal(row(r, 'Quote').unused, true);
  assert.equal(row(r, 'Quote').instances, 0);
  assert.deepEqual(row(r, 'Quote').pages, []);
  assert.equal(row(r, 'Hero').unused, false);
  assert.equal(r.rows.length, 4); // every known type is a row
});

test('instances + pageCount + pages list (state.order order)', () => {
  const r = analyzeBlocks(S({ a: page([blk('Hero'), blk('Hero')]), b: page([blk('Hero')]) }), KNOWN, CATS);
  const h = row(r, 'Hero');
  assert.equal(h.instances, 3);
  assert.equal(h.pageCount, 2);
  assert.deepEqual(h.pages, ['a', 'b']);
});

test('two placements of one type on ONE page → 2 instances / 1 page', () => {
  const h = row(analyzeBlocks(S({ a: page([blk('Faq'), blk('Faq')]) }), KNOWN, CATS), 'Faq');
  assert.equal(h.instances, 2);
  assert.equal(h.pageCount, 1);
});

test('category mapping from puck.config.categories; unmapped → empty', () => {
  const r = analyzeBlocks(S({ a: page([blk('Faq')]) }), KNOWN, CATS);
  assert.equal(row(r, 'Faq').category, 'Proof');
  assert.equal(row(r, 'Hero').category, 'Page');
  assert.equal(row(analyzeBlocks(S({ a: page([]) }), ['Mystery'], CATS), 'Mystery').category, '');
});

test('summary math: used/unused/total + most & least common (M3 surfaced)', () => {
  const r = analyzeBlocks(S({ a: page([blk('Hero'), blk('Hero'), blk('Faq')]), b: page([blk('Hero')]) }), KNOWN, CATS);
  assert.equal(r.summary.knownTypes, 4);
  assert.equal(r.summary.usedTypes, 2);   // Hero, Faq
  assert.equal(r.summary.unusedTypes, 2); // Invite, Quote
  assert.equal(r.summary.totalInstances, 4);
  assert.equal(r.summary.mostCommon, 'Hero');
  assert.equal(r.summary.leastCommon, 'Faq');
});

test('M1: a non-navigable page (in pages but NOT order) is still counted (Storefront/products guard)', () => {
  // order omits 'products' (like migrate strips it), but pages.products + its block exist
  const r = analyzeBlocks({ order: ['a'], pages: { a: page([blk('Hero')]), products: page([blk('Quote')]) } }, KNOWN, CATS);
  assert.equal(row(r, 'Quote').unused, false);
  assert.equal(row(r, 'Quote').pages.includes('products'), true);
  assert.equal(r.summary.pages, 2);
});

test('extras: a placed-but-unregistered type → in extras, not rows; counts toward total', () => {
  const r = analyzeBlocks(S({ a: page([blk('Hero'), blk('Mystery')]) }), KNOWN, CATS);
  assert.equal(row(r, 'Mystery'), undefined);
  assert.equal(r.extras.length, 1);
  assert.equal(r.extras[0].type, 'Mystery');
  assert.equal(r.extras[0].extra, true);
  assert.equal(r.summary.extraTypes, 1);
  assert.equal(r.summary.totalInstances, 2);
});

test('knownTypes empty → all placements become extras, rows empty', () => {
  const r = analyzeBlocks(S({ a: page([blk('Hero')]) }), [], CATS);
  assert.equal(r.rows.length, 0);
  assert.equal(r.summary.usedTypes, 0);
  assert.equal(r.extras.length, 1);
});

test('ghost slug in order + typeless block are skipped without throwing', () => {
  assert.doesNotThrow(() => analyzeBlocks({ order: ['phantom', 'a'], pages: { a: page([{ props: {} }, blk('Hero')]) } }, KNOWN, CATS));
  const r = analyzeBlocks({ order: ['phantom', 'a'], pages: { a: page([{ props: {} }, blk('Hero')]) } }, KNOWN, CATS);
  assert.equal(row(r, 'Hero').instances, 1); // the typeless block didn't count
});

test('empty / malformed state never throws; every known type reads unused', () => {
  const r = analyzeBlocks({}, KNOWN);
  assert.ok(r.rows.every((x) => x.unused));
  assert.equal(r.summary.pages, 0);
  assert.equal(r.summary.mostCommon, '');
  assert.deepEqual(analyzeBlocks(undefined, undefined).rows, []);
});
