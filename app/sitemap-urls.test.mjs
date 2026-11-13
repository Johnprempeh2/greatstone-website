import test from 'node:test';
import assert from 'node:assert/strict';
import { sitemapUrls } from './sitemap-urls.mjs';

test('the sitemap lists every published page once, plus the shop, the intelligence page and GS Agentic Manager', () => {
  const urls = sitemapUrls({ pages: [{ path: '/' }, { path: '/about' }, { path: '/shop' }] }).map((entry) => entry.url);
  assert.deepEqual(urls, ['https://greatstoneint.com/', 'https://greatstoneint.com/about', 'https://greatstoneint.com/shop', 'https://greatstoneint.com/ai-market-intelligence', 'https://greatstoneint.com/gs-agentic-manager']);
});

test('the sitemap lists the shop brand and product pages from the release catalogue', () => {
  const entry = (data) => ({ orgId: 'o', fields: { data } });
  const release = { orgId: 'o', media: {}, pages: [{ path: '/' }], collections: { vendors: { entries: [entry({ slug: 'aspose' })] }, offerings: { entries: [entry({ slug: 'aspose-tex-for-c++' })] } } };
  const urls = sitemapUrls(release).map((e) => e.url);
  assert.ok(urls.includes('https://greatstoneint.com/shop/aspose'));
  assert.ok(urls.includes('https://greatstoneint.com/product/aspose-tex-for-c%2B%2B'));
});
