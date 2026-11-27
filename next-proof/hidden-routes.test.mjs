import test from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN_ROUTES, hiddenRedirects, hiddenTarget, isHidden } from './hidden-routes.mjs';
import release from './data/release.json' with { type: 'json' };
import { sitemapUrls } from '../app/sitemap-urls.mjs';
import config from '../next.config.mjs';

test('27 Nov: Case Studies is hidden again until real cases arrive: /case-studies and /proof 302 to DX Consultancy and leave the sitemap', async () => {
  const paths = release.pages.map((page) => page.path);
  assert.deepEqual(HIDDEN_ROUTES, ['/case-studies', '/proof']);
  assert.ok(isHidden('/case-studies') && isHidden('/proof') && isHidden('/proof/a-case') && !isHidden('/case-studies-two'));
  assert.deepEqual(hiddenRedirects(['/', '/consultancy']).filter((rule) => rule.source === '/case-studies'), [{ source: '/case-studies', destination: '/consultancy', statusCode: 302 }]);
  assert.ok(hiddenRedirects(paths).every((rule) => rule.statusCode === 302));
  const urls = sitemapUrls({ pages: [{ path: '/' }, { path: '/proof' }, { path: '/case-studies' }, { path: '/consultancy' }] }).map((u) => u.url);
  assert.deepEqual(urls.filter((u) => /proof|case-studies/.test(u)), []);
  assert.ok(urls.includes('https://greatstoneint.com/consultancy'));
  assert.equal(hiddenTarget(['/', '/consultancy']), '/consultancy');
  assert.equal(hiddenTarget(['/', '/dx-consultancy']), '/dx-consultancy');
});
