import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveChecklist } from './onboarding-model.mjs';

const D = { defaultSiteName: 'Greatstone International', defaultLogo: '/assets/greatstone-logo-web.png', defaultEmail: 'dx@greatstonesoftware.co.uk', defaultCta: 'Book a Diagnostic' };
// a fresh seed-like state: every settings field equals its Greatstone default; nav seeded; one published page with a description.
const seedLike = (over = {}) => ({
  settings: { siteName: D.defaultSiteName, logo: D.defaultLogo, headerCtaLabel: D.defaultCta, footerEmail: D.defaultEmail, ...(over.settings || {}) },
  navigation: over.navigation !== undefined ? over.navigation : [{ id: 'n1' }],
  order: over.order !== undefined ? over.order : ['home'],
  pages: over.pages !== undefined ? over.pages : { home: { published: {}, seo: { description: 'A real description.' } } },
});
const item = (r, key) => r.items.find((i) => i.key === key);

test('false-positive guard: default-valued branded fields are NOT done (changed-from-default, not non-empty)', () => {
  const r = deriveChecklist(seedLike(), D);
  assert.equal(item(r, 'siteName').done, false);
  assert.equal(item(r, 'logo').done, false);
  assert.equal(item(r, 'cta').done, false);
  assert.equal(item(r, 'footerEmail').done, false); // a valid email but still the default
  // on the seed nav + published + seo ARE done:
  assert.equal(item(r, 'nav').done, true);
  assert.equal(item(r, 'published').done, true);
  assert.equal(item(r, 'seo').done, true);
  assert.equal(r.doneCount, 3);
});

test('true positives: overriding each branded field flips it done', () => {
  const r = deriveChecklist(seedLike({ settings: { siteName: 'Acme Co', logo: 'data:image/png;base64,AAA', headerCtaLabel: 'Get a quote', footerEmail: 'hi@acme.com' } }), D);
  assert.equal(item(r, 'siteName').done, true);
  assert.equal(item(r, 'logo').done, true);
  assert.equal(item(r, 'cta').done, true);
  assert.equal(item(r, 'footerEmail').done, true);
});

test('footerEmail: a custom but INVALID email is not done', () => {
  assert.equal(item(deriveChecklist(seedLike({ settings: { footerEmail: 'notanemail' } }), D), 'footerEmail').done, false);
});

test('published / seo logic', () => {
  // a draft-only site → published + seo both false
  const draft = deriveChecklist(seedLike({ pages: { home: { published: null, seo: {} } } }), D);
  assert.equal(item(draft, 'published').done, false);
  assert.equal(item(draft, 'seo').done, false);
  // one published page missing a description → seo false
  const noDesc = deriveChecklist(seedLike({ pages: { home: { published: {}, seo: { description: '' } } } }), D);
  assert.equal(item(noDesc, 'seo').done, false);
  // mixed: 2 published, 1 missing desc → seo false
  const mixed = deriveChecklist(seedLike({ order: ['a', 'b'], pages: { a: { published: {}, seo: { description: 'x' } }, b: { published: {}, seo: {} } } }), D);
  assert.equal(item(mixed, 'seo').done, false);
});

test('nav edge: empty / non-array → false; one item → true', () => {
  assert.equal(item(deriveChecklist(seedLike({ navigation: [] }), D), 'nav').done, false);
  assert.equal(item(deriveChecklist(seedLike({ navigation: undefined }), D), 'nav').done, true); // seedLike default = one item
  assert.doesNotThrow(() => deriveChecklist({ ...seedLike(), navigation: 'oops' }, D));
});

test('analytics seam: absent without analyticsKnown; present + reflects the flag', () => {
  assert.equal(item(deriveChecklist(seedLike(), D), 'analytics'), undefined);
  const off = deriveChecklist(seedLike(), { ...D, analyticsKnown: true, analyticsConfigured: false });
  assert.equal(item(off, 'analytics').done, false);
  assert.equal(off.total, 8);
  const on = deriveChecklist(seedLike(), { ...D, analyticsKnown: true, analyticsConfigured: true });
  assert.equal(item(on, 'analytics').done, true);
});

test('empty / malformed state never throws and returns a valid shape', () => {
  for (const r of [deriveChecklist(), deriveChecklist({}, {}), deriveChecklist({ settings: null, pages: null, order: null, navigation: null })]) {
    assert.equal(typeof r.pct, 'number');
    assert.equal(r.doneCount + r.remaining, r.total);
    assert.equal(r.allDone, r.total > 0 && r.doneCount === r.total);
  }
});

test('allDone / pct on a fully-configured custom tenant', () => {
  const r = deriveChecklist({
    settings: { siteName: 'Acme', logo: 'x', headerCtaLabel: 'Buy', footerEmail: 'a@b.com' },
    navigation: [{ id: 'n' }], order: ['p'], pages: { p: { published: {}, seo: { description: 'd' } } },
  }, { ...D, analyticsKnown: true, analyticsConfigured: true });
  assert.equal(r.allDone, true);
  assert.equal(r.pct, 100);
  assert.equal(r.remaining, 0);
});
