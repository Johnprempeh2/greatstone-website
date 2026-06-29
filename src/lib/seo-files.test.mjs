import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemapXml, buildRobotsTxt, normaliseOrigin } from './seo-files.mjs';

test('normaliseOrigin trims, strips trailing slashes, applies fallback', () => {
  assert.equal(normaliseOrigin('https://x.test/'), 'https://x.test');
  assert.equal(normaliseOrigin('  https://x.test///  '), 'https://x.test');
  assert.equal(normaliseOrigin('', 'https://fallback.test/'), 'https://fallback.test');
  assert.equal(normaliseOrigin('   ', 'https://fallback.test'), 'https://fallback.test');
  assert.equal(normaliseOrigin('https://win.test', 'https://fallback.test'), 'https://win.test');
});

test('sitemap has exactly one <loc> equal to the normalised origin', () => {
  const xml = buildSitemapXml('https://greatstone-home.netlify.app/');
  const locs = xml.match(/<loc>/g) || [];
  assert.equal(locs.length, 1);
  assert.match(xml, /<loc>https:\/\/greatstone-home\.netlify\.app<\/loc>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
});

test('sitemap includes lastmod only when provided', () => {
  assert.doesNotMatch(buildSitemapXml('https://x.test'), /<lastmod>/);
  assert.match(buildSitemapXml('https://x.test', { lastmod: '2026-06-29' }), /<lastmod>2026-06-29<\/lastmod>/);
});

test('sitemap XML-escapes special characters in the origin', () => {
  const xml = buildSitemapXml('https://x.test/?a=1&b=2');
  assert.match(xml, /&amp;/);
  assert.doesNotMatch(xml, /a=1&b=2/); // the raw ampersand must not survive
});

test('robots.txt allows the site, disallows private surfaces, points at the sitemap', () => {
  const txt = buildRobotsTxt('https://greatstone-home.netlify.app/');
  assert.match(txt, /^User-agent: \*$/m);
  assert.match(txt, /^Allow: \/$/m);
  for (const p of ['/admin', '/account', '/org', '/invoice', '/catalogue']) {
    assert.match(txt, new RegExp('^Disallow: ' + p.replace('/', '\\/') + '$', 'm'));
  }
  assert.match(txt, /^Sitemap: https:\/\/greatstone-home\.netlify\.app\/sitemap\.xml$/m);
});

test('no em-dash or en-dash appears in either output (house style)', () => {
  const xml = buildSitemapXml('https://x.test', { lastmod: '2026-06-29' });
  const txt = buildRobotsTxt('https://x.test');
  for (const out of [xml, txt]) {
    assert.equal(out.includes('—'), false, 'em-dash present');
    assert.equal(out.includes('–'), false, 'en-dash present');
  }
});
