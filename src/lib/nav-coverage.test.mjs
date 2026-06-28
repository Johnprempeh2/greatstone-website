import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditNavCoverage } from './nav-coverage.mjs';

const page = (slug, over = {}) => ({ title: slug, status: 'published', published: { content: [] }, data: { root: { props: { title: slug } }, content: [] }, ...over });
const draft = (slug) => page(slug, { status: 'draft', published: null });
const pg = (slug, over = {}) => ({ id: 'n-' + slug, type: 'page', pageSlug: slug, visible: true, ...over });
const lk = (href, over = {}) => ({ id: 'l', type: 'link', label: 'Link', href, visible: true, ...over });
const grp = (children, over = {}) => ({ id: 'g', type: 'group', label: 'Drop', children, visible: true, ...over });
const S = (pages, navigation, order = Object.keys(pages), redirects = []) => ({ pages, order, navigation, redirects });
const kinds = (r) => r.groups.flatMap((g) => g.issues.map((i) => i.kind));

// --- true positives ---
test('nav → never-published draft page = navToDraft error', () => {
  const r = auditNavCoverage(S({ home: page('home'), secret: draft('secret') }, [pg('home'), pg('secret')]));
  assert.ok(kinds(r).includes('navToDraft'));
  assert.equal(r.errors, 1);
});

test('custom link with an empty href = deadCustomLink error', () => {
  assert.ok(kinds(auditNavCoverage(S({ home: page('home') }, [pg('home'), lk('')]))).includes('deadCustomLink'));
});

test('custom link #go/<slug> to a missing page = deadCustomLink error', () => {
  assert.ok(kinds(auditNavCoverage(S({ home: page('home') }, [pg('home'), lk('#go/ghost')]))).includes('deadCustomLink'));
});

test('empty group (no children) = emptyGroup warning', () => {
  const r = auditNavCoverage(S({ home: page('home') }, [pg('home'), grp([])]));
  assert.ok(kinds(r).includes('emptyGroup'));
  assert.equal(r.warnings, 1);
});

test('group whose children are all hidden = emptyGroup warning', () => {
  const r = auditNavCoverage(S({ home: page('home'), a: page('a') }, [pg('home'), grp([pg('a', { visible: false })])]));
  assert.ok(kinds(r).includes('emptyGroup'));
});

test('published page in no menu item = missingFromNav warning (not an error)', () => {
  const r = auditNavCoverage(S({ home: page('home'), lonely: page('lonely') }, [pg('home')]));
  assert.ok(kinds(r).includes('missingFromNav'));
  assert.equal(r.errors, 0);
});

// --- false-positive guards ---
test('nav → published page is clean', () => {
  assert.equal(auditNavCoverage(S({ home: page('home') }, [pg('home')])).total, 0);
});

test('re-drafted page that still serves a published snapshot is NOT navToDraft', () => {
  const r = auditNavCoverage(S({ home: page('home'), edited: page('edited', { status: 'draft', published: { content: [] } }) }, [pg('home'), pg('edited')]));
  assert.ok(!kinds(r).includes('navToDraft'));
});

test('external / booking / valid #go custom links are not flagged dead', () => {
  const r = auditNavCoverage(S({ home: page('home'), svc: page('svc') }, [pg('home'), lk('https://x.com'), lk('mailto:a@b.com'), lk('#book'), lk('#go/svc')]));
  assert.ok(!kinds(r).includes('deadCustomLink'));
});

test('a page reached only via a custom #go menu link is NOT missingFromNav', () => {
  const r = auditNavCoverage(S({ home: page('home'), svc: page('svc') }, [pg('home'), lk('#go/svc')]));
  assert.ok(!kinds(r).includes('missingFromNav'));
});

test('nav → a deleted/missing page is NOT reported here (Link health owns it)', () => {
  const r = auditNavCoverage(S({ home: page('home') }, [pg('home'), pg('gone')]));
  assert.ok(!kinds(r).includes('navToDraft'));
  assert.equal(r.total, 0);
});

test('contact and products are never flagged missingFromNav', () => {
  const r = auditNavCoverage(S({ home: page('home'), contact: page('contact'), products: page('products') }, [pg('home')]));
  assert.ok(!kinds(r).includes('missingFromNav'));
});

test('a group with at least one visible published child is not emptyGroup', () => {
  assert.ok(!kinds(auditNavCoverage(S({ home: page('home'), a: page('a') }, [pg('home'), grp([pg('a')])]))).includes('emptyGroup'));
});

test('a hidden nav item to a draft page is not flagged (not public-facing)', () => {
  const r = auditNavCoverage(S({ home: page('home'), secret: draft('secret') }, [pg('home'), pg('secret', { visible: false })]));
  assert.ok(!kinds(r).includes('navToDraft'));
});

test('a page nested inside a group counts as in-nav (no missingFromNav)', () => {
  assert.ok(!kinds(auditNavCoverage(S({ home: page('home'), a: page('a') }, [pg('home'), grp([pg('a')])]))).includes('missingFromNav'));
});

// --- edge / empty ---
test('empty navigation = clean (header falls back to page order)', () => {
  const r = auditNavCoverage(S({ home: page('home'), b: page('b') }, []));
  assert.deepEqual([r.total, r.errors, r.warnings], [0, 0, 0]);
  assert.equal(r.groups.length, 0);
});

test('undefined / empty state does not throw', () => {
  assert.equal(auditNavCoverage(undefined).total, 0);
  assert.equal(auditNavCoverage({}).total, 0);
});

test('counts add up; errors sort before warnings; menu-shape issues key by (navigation)', () => {
  const r = auditNavCoverage(S(
    { home: page('home'), secret: draft('secret'), lonely: page('lonely') },
    [pg('home'), pg('secret'), lk(''), grp([])],
  ));
  assert.equal(r.total, r.errors + r.warnings);
  const navGroup = r.groups.find((g) => g.pageSlug === '(navigation)');
  assert.equal(navGroup.issues[0].severity, 'error'); // deadCustomLink(error) before emptyGroup(warn)
  assert.ok(r.groups.some((g) => g.pageSlug === 'secret')); // page issue keyed by page
});
