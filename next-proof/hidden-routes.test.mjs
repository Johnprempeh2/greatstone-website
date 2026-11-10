import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenRedirects, hiddenTarget, isHidden } from './hidden-routes.mjs';
import release from './data/release.json' with { type: 'json' };
import { sitemapUrls } from '../app/sitemap-urls.mjs';
import config from '../next.config.mjs';

test('Case Studies is hidden: 302 to DX Consultancy, ahead of every other redirect, and out of the sitemap', async () => {
  const rules = await config.redirects();
  const paths = release.pages.map((page) => page.path);
  assert.deepEqual(rules.slice(0, 4), hiddenRedirects(paths));
  assert.ok(hiddenRedirects(paths).every((rule) => rule.statusCode === 302 && paths.includes(rule.destination) && !('permanent' in rule)));
  assert.equal(hiddenTarget(['/', '/consultancy']), '/consultancy');
  assert.equal(hiddenTarget(['/', '/dx-consultancy']), '/dx-consultancy');
  assert.ok(isHidden('/proof/a-case') && isHidden('/case-studies') && !isHidden('/proofing'));
  const urls = sitemapUrls({ pages: [{ path: '/' }, { path: '/proof' }, { path: '/case-studies' }, { path: '/consultancy' }] }).map((u) => u.url);
  assert.deepEqual(urls.filter((u) => /proof|case-studies/.test(u)), []);
  assert.ok(urls.includes('https://greatstoneint.com/consultancy'));
});
