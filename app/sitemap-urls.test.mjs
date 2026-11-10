import test from 'node:test';
import assert from 'node:assert/strict';
import { sitemapUrls } from './sitemap-urls.mjs';

test('the sitemap lists every published page once, plus the shop, the intelligence page and GS Agentic Manager', () => {
  const urls = sitemapUrls({ pages: [{ path: '/' }, { path: '/about' }, { path: '/shop' }] }).map((entry) => entry.url);
  assert.deepEqual(urls, ['https://greatstoneint.com/', 'https://greatstoneint.com/about', 'https://greatstoneint.com/shop', 'https://greatstoneint.com/ai-market-intelligence', 'https://greatstoneint.com/gs-agentic-manager']);
});
