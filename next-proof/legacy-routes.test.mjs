import assert from 'node:assert/strict';
import test from 'node:test';
import release from './data/release.json' with { type: 'json' };
import catalogue from './fixtures/public-catalogue-2026-10-22.json' with { type: 'json' };
import { legacyPaths, nextLegacyDestination, nextLegacyRedirects } from './legacy-routes.mjs';

const pages = release.pages.map((page) => page.path);
const rules = nextLegacyRedirects(legacyPaths, pages);

function redirectFor(path) {
  return rules.find((rule) => rule.source === path ||
    (rule.source.endsWith('/:path*') && path.startsWith(rule.source.slice(0, -7) + '/')));
}

test('every one of the 108 legacy paths has a Next landing route', () => {
  assert.equal(legacyPaths.length, 108);
  for (const path of legacyPaths) {
    const expected = nextLegacyDestination(path, pages);
    const rule = redirectFor(path);
    if (expected === path) assert.equal(rule, undefined, `${path} is a published Next route`);
    else {
      assert.ok(rule, `${path} has a redirect`);
      assert.equal(rule.destination, expected, path);
      assert.equal(rule.permanent, true, path);
    }
    assert.ok(expected === '/' || pages.includes(expected) || expected === '/shop' ||
      catalogue.vendors.some((vendor) => expected === `/shop/${vendor.slug}`), `${path} lands on a known route`);
  }
});

test('vendor paths, account paths and old page aliases reach the intended route', () => {
  assert.equal(nextLegacyDestination('/ironsoftware/ironpdf', pages), '/shop/ironsoftware');
  assert.equal(nextLegacyDestination('/login', pages), '/contact');
  assert.equal(nextLegacyDestination('/blog', pages), '/insights');
  assert.equal(nextLegacyDestination('/privacy-policy', pages), '/privacy');
  assert.equal(nextLegacyDestination('/our-services', pages), '/services');
  assert.equal(nextLegacyDestination('/about', pages), '/about');
});
