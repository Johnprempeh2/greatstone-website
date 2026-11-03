import assert from 'node:assert/strict';
import test from 'node:test';
import release from './data/release.json' with { type: 'json' };
import catalogue from './fixtures/public-catalogue-2026-10-22.json' with { type: 'json' };
import { legacyDecisions } from './legacy-decisions.mjs';
import { legacyLanding, legacyPaths, nextLegacyDestination, nextLegacyRedirects } from './legacy-routes.mjs';
import { normalisePath } from '../src/lib/legacy-redirects.mjs';

const pages = release.pages.map((page) => page.path);
const rules = nextLegacyRedirects(legacyPaths, pages);

function redirectFor(path) {
  const source = normalisePath(path);
  return rules.find((rule) => rule.source === source ||
    (rule.source.endsWith('/:path*') && source.startsWith(rule.source.slice(0, -7) + '/')));
}

function existsToday(path) {
  return pages.includes(path) || ['/', '/shop', '/account'].includes(path) ||
    catalogue.vendors.some((vendor) => path === `/shop/${vendor.slug}`) ||
    catalogue.offerings.some((item) => path === `/product/${item.slug}`);
}

test('the sitemap decisions cover exactly the 108 crawled legacy paths', () => {
  assert.equal(legacyPaths.length, 108);
  assert.deepEqual(legacyDecisions.map((row) => row.from).sort(), legacyPaths.map(normalisePath).sort());
});

test('every legacy path lands on a page that exists today', () => {
  for (const path of legacyPaths) {
    const expected = nextLegacyDestination(path, pages);
    const rule = redirectFor(path);
    if (expected === normalisePath(path)) assert.equal(rule, undefined, `${path} is a published Next route`);
    else {
      assert.ok(rule, `${path} has a redirect`);
      assert.equal(rule.destination, expected, path);
      assert.equal(rule.permanent, true, path);
    }
    assert.ok(existsToday(expected), `${path} lands on ${expected}, which exists`);
  }
});

test('exact rules come before the vendor, blog and news wildcards', () => {
  const firstWildcard = rules.findIndex((rule) => rule.source.endsWith('/:path*'));
  assert.ok(firstWildcard > 0);
  assert.ok(rules.slice(firstWildcard).every((rule) => rule.source.endsWith('/:path*')));
  assert.equal(redirectFor('/aspose/a-product-the-crawl-missed').destination, '/shop/aspose');
  assert.equal(redirectFor('/news/an-old-article').destination, '/insights');
});

test('published sitemap targets are used directly', () => {
  assert.deepEqual(legacyLanding('/privacy-policy', pages).to, '/privacy');
  assert.equal(legacyLanding('/privacy-policy', pages).state, 'live');
  assert.equal(nextLegacyDestination('/terms-and-conditions-for-goods-and-services', pages), '/terms');
  assert.equal(nextLegacyDestination('/why-choose-us', pages), '/about');
  assert.equal(nextLegacyDestination('/blog', pages), '/insights');
  assert.equal(nextLegacyDestination('/home-page-alt', pages), '/');
  assert.equal(nextLegacyDestination('/callback', pages), '/account');
  assert.equal(nextLegacyDestination('/about', pages), '/about');
});

test('an unpublished target uses the interim page, then switches once the target is published', () => {
  assert.deepEqual([nextLegacyDestination('/faqs', pages), legacyLanding('/faqs', pages).state], ['/contact', 'interim']);
  assert.equal(nextLegacyDestination('/document-processing', pages), '/dev-tools');
  assert.equal(nextLegacyDestination('/assessment-framework/people-and-purpose', pages), '/method');
  assert.equal(nextLegacyDestination('/our-services', pages), '/transformation-services');
  assert.equal(nextLegacyDestination('/testimonials', pages), '/case-studies');
  assert.equal(nextLegacyDestination('/login', pages), '/account');
  assert.equal(nextLegacyDestination('/faqs', [...pages, '/support']), '/support');
  assert.equal(nextLegacyDestination('/document-processing', [...pages, '/dev-tools/document-solutions']), '/dev-tools/document-solutions');
});

// GRE-1822: the content targets built as GSAM pages (four new drafts, four release 1 pages at their sitemap
// paths). Once they publish, every old content page lands on its final page; only the old article waits.
const contentTargets = ['/support', '/dev-tools/choosing-tools', '/dev-tools/trials', '/dev-tools/document-solutions',
  '/consultancy/services', '/consultancy/how-we-work', '/consultancy/how-we-help', '/proof'];

test('when the GSAM content pages publish, every old content page goes live', () => {
  const published = [...pages, ...contentTargets];
  const content = legacyDecisions.filter((row) => !row.target.startsWith('/dev-tools/brands/') &&
    !row.target.startsWith('/dev-tools/products') && !row.target.startsWith('/account') &&
    !['/dev-tools/basket', '/dev-tools/checkout', '/'].includes(row.target));
  const notLive = content.filter((row) => legacyLanding(row.from, published).state !== 'live').map((row) => row.from);
  assert.deepEqual(notLive, ['/news/seamless-api-integration-for-developers']);
  assert.equal(nextLegacyDestination('/trial-confirm', published), '/dev-tools/trials');
  assert.equal(nextLegacyDestination('/assessment-framework/the-external-view', published), '/consultancy/how-we-work');
  assert.equal(nextLegacyDestination('/testimonials', published), '/proof');
});

test('products with an exact catalogue match go to that product; the rest wait for Ben on the brand page', () => {
  const moves = legacyDecisions.filter((row) => row.product);
  assert.equal(moves.length, 15);
  for (const row of moves) {
    assert.ok(catalogue.offerings.some((item) => item.slug === row.product), `${row.product} is in the catalogue`);
    assert.equal(nextLegacyDestination(row.from, pages), '/product/' + row.product);
  }
  assert.equal(nextLegacyDestination('/ironsoftware/ironpdf', pages), '/product/ironpdf');
  assert.deepEqual(legacyLanding('/ironsoftware/ironocr', pages), {
    to: '/shop/ironsoftware', state: 'pending Ben', decision: legacyDecisions.find((row) => row.from === '/ironsoftware/ironocr') });
  assert.equal(nextLegacyDestination('/devexpress/devexpress-winForms', pages), '/shop/devexpress');
});
