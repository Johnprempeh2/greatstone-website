import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenRedirects, isHidden } from './hidden-routes.mjs';
import { sitemapUrls } from '../app/sitemap-urls.mjs';
import config from '../next.config.mjs';

test('Case Studies is hidden: 302 to DX Consultancy, ahead of every other redirect, and out of the sitemap', async () => {
  const rules = await config.redirects();
  assert.deepEqual(rules.slice(0, 4), hiddenRedirects());
  assert.ok(hiddenRedirects().every((rule) => rule.statusCode === 302 && rule.destination === '/consultancy' && !('permanent' in rule)));
  assert.ok(isHidden('/proof/a-case') && isHidden('/case-studies') && !isHidden('/proofing'));
  const urls = sitemapUrls({ pages: [{ path: '/' }, { path: '/proof' }, { path: '/case-studies' }, { path: '/consultancy' }] }).map((u) => u.url);
  assert.deepEqual(urls.filter((u) => /proof|case-studies/.test(u)), []);
  assert.ok(urls.includes('https://greatstoneint.com/consultancy'));
});
