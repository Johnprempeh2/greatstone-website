import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditLinks, resolveRedirect, linkPageSlug } from './link-audit.mjs';

const page = (content) => ({ data: { content } });
const hero = (props) => ({ type: 'Hero', props: { id: 'h', ...props } });

// a small but realistic site: home links to about; nav lists all three live pages
function base() {
  return {
    order: ['home', 'about', 'services'],
    pages: {
      home: page([hero({ ctaLabel: 'About us', ctaHref: { kind: 'page', page: 'about' } })]),
      about: page([]),
      services: page([]),
    },
    navigation: [
      { id: 'n1', type: 'page', pageSlug: 'home' },
      { id: 'n2', type: 'page', pageSlug: 'about' },
      { id: 'n3', type: 'page', pageSlug: 'services' },
    ],
    redirects: [],
  };
}

test('a healthy site has no issues and no orphans', () => {
  const a = auditLinks(base());
  assert.equal(a.broken, 0);
  assert.equal(a.recoverable, 0);
  assert.deepEqual(a.orphans, []);
});

test('linkPageSlug reads page links from both shapes, ignores non-page links', () => {
  assert.equal(linkPageSlug({ kind: 'page', page: 'about' }), 'about');
  assert.equal(linkPageSlug('#go/about'), 'about');
  assert.equal(linkPageSlug('#book'), null);
  assert.equal(linkPageSlug({ kind: 'url', url: 'https://x.com' }), null);
  assert.equal(linkPageSlug({ kind: 'email', email: 'a@b.com' }), null);
  assert.equal(linkPageSlug({ kind: 'page', page: '' }), '');
});

test('a link to a deleted page is BROKEN (both structured and string shapes)', () => {
  const s = base();
  s.pages.home = page([hero({ ctaLabel: 'Gone', ctaHref: { kind: 'page', page: 'gone' } }),
                       { type: 'Chapter', props: { id: 'c', cta: '#go/missing', ctaHref: '#go/missing' } }]);
  const a = auditLinks(s);
  assert.equal(a.broken, 2);
  assert.ok(a.issues.every((i) => i.pageSlug === 'home'));
  assert.ok(a.issues.some((i) => i.target === 'gone' && i.blockType === 'Hero'));
});

test('a renamed page link is RECOVERABLE (amber) and carries the fix slug', () => {
  const s = base();
  s.pages.home = page([hero({ ctaLabel: 'Old', ctaHref: { kind: 'page', page: 'old-about' } })]);
  s.redirects = [{ from: 'old-about', to: 'about', ts: 1 }];
  const a = auditLinks(s);
  assert.equal(a.broken, 0);
  assert.equal(a.recoverable, 1);
  assert.equal(a.issues[0].severity, 'recoverable');
  assert.equal(a.issues[0].fixSlug, 'about');
});

test("'#book', external URLs and emails are never flagged", () => {
  const s = base();
  s.pages.home = page([hero({ ctaLabel: 'Book', ctaHref: '#book', ctaLabel2: 'Site', ctaHref2: { kind: 'url', url: 'https://x.com' } }),
                       { type: 'ContactBand', props: { id: 'cb', cardCtaLabel: 'Mail', cardCtaHref: { kind: 'email', email: 'a@b.com' } } }]);
  const a = auditLinks(s);
  assert.equal(a.broken, 0);
  assert.equal(a.recoverable, 0);
});

test('a labelled button with no link target is a dead CTA (broken)', () => {
  const s = base();
  s.pages.home = page([hero({ ctaLabel: 'Click me', ctaHref: '#' })]);
  const a = auditLinks(s);
  assert.equal(a.broken, 1);
  assert.ok(a.issues[0].dead);
});

test('an empty optional CTA with NO label is not nagged', () => {
  const s = base();
  s.pages.home = page([hero({ ctaHref: '#' })]); // no ctaLabel
  const a = auditLinks(s);
  assert.equal(a.broken, 0);
});

test('per-item array links (e.g. pillar cards) are walked', () => {
  const s = base();
  s.pages.home = page([{ type: 'PillarCards', props: { id: 'pc', pillars: [
    { name: 'A', href: { kind: 'page', page: 'about' } },
    { name: 'B', href: { kind: 'page', page: 'ghost' } },
  ] } }]);
  const a = auditLinks(s);
  assert.equal(a.broken, 1);
  assert.equal(a.issues[0].target, 'ghost');
});

test('orphan pages (nothing links here) are reported; reserved + linked pages are not', () => {
  const s = base();
  s.order = ['home', 'about', 'services', 'secret'];
  s.pages.secret = page([]); // in order + pages but in no nav item and linked from nowhere
  const a = auditLinks(s);
  assert.deepEqual(a.orphans, ['secret']);
  // home is reserved, about+services are in the nav → none are orphans
  assert.ok(!a.orphans.includes('home'));
  assert.ok(!a.orphans.includes('about'));
});

test('orphan detection is skipped when there is no navigation tree (order is the fallback)', () => {
  const s = base();
  s.navigation = [];
  s.pages.secret = page([]); s.order.push('secret');
  assert.deepEqual(auditLinks(s).orphans, []);
});

test('a broken link in the NAVIGATION bar is reported', () => {
  const s = base();
  s.navigation.push({ id: 'n4', type: 'page', pageSlug: 'nuked' });
  const a = auditLinks(s);
  assert.equal(a.broken, 1);
  assert.equal(a.issues[0].pageSlug, '(navigation)');
  assert.equal(a.issues[0].blockType, 'Navigation');
});

test('resolveRedirect collapses chains and is cycle-safe', () => {
  const s = { pages: { about: {} }, redirects: [{ from: 'a', to: 'b' }, { from: 'b', to: 'about' }] };
  assert.equal(resolveRedirect(s, 'a'), 'about'); // a -> b -> about
  assert.equal(resolveRedirect(s, 'about'), 'about'); // already live
  assert.equal(resolveRedirect(s, 'nope'), null); // dead end
  const cyc = { pages: {}, redirects: [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }] };
  assert.equal(resolveRedirect(cyc, 'x'), null); // cycle -> null, no hang
});
