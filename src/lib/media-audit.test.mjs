import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditMedia, dataUriBytes, fmtBytes } from './media-audit.mjs';

const blk = (type, props = {}) => ({ type, props: { id: type + '-1', ...props } });
const page = (slug, content = [], seo = {}) => ({ title: slug, data: { root: { props: { title: slug } }, content }, seo });
const asset = (id, url, alt = '') => ({ id, url, alt, ts: 1 });
const S = (o) => ({ order: o.order || Object.keys(o.pages || {}), pages: o.pages || {}, assets: o.assets || {}, products: o.products || [] });
const DATA100 = 'data:image/png;base64,' + 'A'.repeat(100); // 100 b64 chars → 75 bytes
const urls = (list) => list.map((x) => x.url);

// --- true positives ---
test('a library asset no page references is "unused"; bytes computed for data URIs, 0 for http', () => {
  const r = auditMedia(S({ pages: { home: page('home') }, assets: { a1: asset('a1', DATA100), a2: asset('a2', 'https://x/y.png') } }));
  assert.equal(r.unused.length, 2);
  assert.equal(r.unused.find((a) => a.id === 'a1').bytes, 75);
  assert.equal(r.unused.find((a) => a.id === 'a2').bytes, 0);
  assert.equal(r.bytes, 75);
});

test('a Figure image not in the library is "untracked" with one use (correct page/block/field)', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: 'https://x/fig.png', alt: 'a' })]) } }));
  assert.equal(r.untracked.length, 1);
  const u = r.untracked[0];
  assert.equal(u.url, 'https://x/fig.png');
  assert.equal(u.uses[0].pageSlug, 'home');
  assert.equal(u.uses[0].blockType, 'Figure');
  assert.equal(u.uses[0].field, 'image');
});

test('nested array images (InsightsGrid posts / Team photo / LogoWall logos / Quote companyLogo) are all found', () => {
  const r = auditMedia(S({ pages: { home: page('home', [
    blk('InsightsGrid', { posts: [{ image: 'p0.png', alt: 'x' }, { image: 'p1.png', alt: 'y' }] }),
    blk('Team', { items: [{ photo: 't0.png', name: 'A' }] }),
    blk('LogoWall', { logos: [{ image: 'l0.png' }] }),
    blk('Quote', { companyLogo: 'c.png', photo: 'q.png' }),
  ]) } }));
  const found = urls(r.untracked);
  ['p0.png', 'p1.png', 't0.png', 'l0.png', 'c.png', 'q.png'].forEach((u) => assert.ok(found.includes(u), 'missing ' + u));
});

test('a non-draft product image is a usage under (catalogue); a draft product image is ignored', () => {
  const r = auditMedia(S({ pages: { home: page('home') }, products: [
    { id: 'p1', name: 'Live', image: 'live.png', imageAlt: 'ok', status: 'active' },
    { id: 'p2', name: 'Draft', image: 'draft.png', imageAlt: '', status: 'draft' },
  ] }));
  assert.ok(urls(r.untracked).includes('live.png'));
  assert.ok(!urls(r.untracked).includes('draft.png'));
  assert.equal(r.untracked.find((u) => u.url === 'live.png').uses[0].pageSlug, '(catalogue)');
});

test('missing alt: Figure with blank alt + Team photo with no name are flagged; with alt/name they are not', () => {
  const bad = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: 'f.png', alt: '' }), blk('Team', { items: [{ photo: 't.png', name: '' }] })]) } }));
  assert.equal(bad.missingAlt.length, 2);
  const good = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: 'f.png', alt: 'desc' }), blk('Team', { items: [{ photo: 't.png', name: 'Ada' }] })]) } }));
  assert.equal(good.missingAlt.length, 0);
});

test('a product with blank imageAlt is flagged missing-alt under (catalogue)', () => {
  const r = auditMedia(S({ pages: { home: page('home') }, products: [{ id: 'p1', name: 'Live', image: 'live.png', imageAlt: '', status: 'active' }] }));
  assert.equal(r.missingAlt.length, 1);
  assert.equal(r.missingAlt[0].pageSlug, '(catalogue)');
});

test('the same image used on two pages collapses to one usage with two uses', () => {
  const r = auditMedia(S({ pages: { a: page('a', [blk('Figure', { image: 'x.png', alt: 'q' })]), b: page('b', [blk('Figure', { image: 'x.png', alt: 'q' })]) } }));
  assert.equal(r.untracked.length, 1);
  assert.equal(r.untracked[0].uses.length, 2);
});

test('dataUriBytes + fmtBytes boundaries', () => {
  assert.equal(dataUriBytes('https://x/y.png'), 0);
  assert.equal(dataUriBytes(DATA100), 75);
  assert.equal(fmtBytes(1023), '1023 B');
  assert.equal(fmtBytes(1024), '1.0 KB');
  assert.equal(fmtBytes(1048576), '1.0 MB');
});

// --- false-positive guards ---
test('a library asset whose url IS used by a page is not "unused"', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: 'used.png', alt: 'a' })]) }, assets: { a1: asset('a1', 'used.png') } }));
  assert.equal(r.unused.length, 0);
  assert.equal(r.untracked.length, 0); // it IS in the library, so not untracked either
});

test('a page image that matches a library asset is not "untracked"', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: 'lib.png', alt: 'a' })]) }, assets: { a1: asset('a1', 'lib.png') } }));
  assert.equal(r.untracked.length, 0);
});

test('trailing whitespace between block url and asset url is normalised (counts as used)', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: ' lib.png ', alt: 'a' })]) }, assets: { a1: asset('a1', 'lib.png') } }));
  assert.equal(r.unused.length, 0);
  assert.equal(r.untracked.length, 0);
});

test('non-image string props (body prose) are never collected as images', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('RichText', { body: 'Some words here', heading: 'Title' })]) } }));
  assert.equal(r.untracked.length, 0);
});

test('image keys with no curated alt field (companyLogo/ogImage/Hero image) are never flagged missing-alt', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('Quote', { companyLogo: 'c.png' }), blk('Hero', { image: 'h.png' })], { ogImage: 'og.png' }) } }));
  assert.equal(r.missingAlt.length, 0); // they are usages, but have no alt field to be "missing"
  assert.ok(urls(r.untracked).includes('og.png')); // ogImage is still a real usage
});

// --- edge / empty ---
test('auditMedia({}) and missing collections do not throw; all lists empty, bytes 0, errors 0', () => {
  const r = auditMedia({});
  assert.deepEqual([r.unused.length, r.untracked.length, r.missingAlt.length, r.bytes, r.errors], [0, 0, 0, 0, 0]);
});

test('empty library + pages with images → everything untracked, nothing unused', () => {
  const r = auditMedia(S({ pages: { home: page('home', [blk('Figure', { image: 'a.png', alt: 'x' })]) } }));
  assert.equal(r.unused.length, 0);
  assert.equal(r.untracked.length, 1);
});

test('library with assets + zero page usages → every asset unused; errors always 0', () => {
  const r = auditMedia(S({ pages: {}, assets: { a1: asset('a1', 'x.png'), a2: asset('a2', 'y.png') } }));
  assert.equal(r.unused.length, 2);
  assert.equal(r.counts.unused, 2);
  assert.equal(r.errors, 0);
});
