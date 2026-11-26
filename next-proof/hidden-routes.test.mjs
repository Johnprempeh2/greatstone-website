import test from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN_ROUTES, hiddenRedirects, hiddenTarget, isHidden } from './hidden-routes.mjs';
import release from './data/release.json' with { type: 'json' };
import { sitemapUrls } from '../app/sitemap-urls.mjs';
import config from '../next.config.mjs';

test('GRE-6331: Case Studies is public again: no hidden page, /proof moves permanently to /case-studies, the page is in the sitemap', async () => {
  const rules = await config.redirects();
  const paths = release.pages.map((page) => page.path);
  assert.deepEqual(HIDDEN_ROUTES, []);
  assert.deepEqual(hiddenRedirects(paths), []);
  assert.ok(!isHidden('/case-studies') && !isHidden('/proof') && !isHidden('/proof/a-case'));
  assert.deepEqual(rules.filter((rule) => /^\/(proof|case-studies)/.test(rule.source)), [{ source: '/proof', destination: '/case-studies', permanent: true }]);
  assert.ok(!rules.some((rule) => rule.statusCode === 302), 'no temporary redirect is left');
  const urls = sitemapUrls({ pages: [{ path: '/' }, { path: '/proof' }, { path: '/consultancy' }] }).map((u) => u.url);
  assert.deepEqual(urls.filter((u) => /proof|case-studies/.test(u)), ['https://greatstoneint.com/case-studies']);
  assert.ok(urls.includes('https://greatstoneint.com/consultancy'));
});

test('hiding a page still works: a hidden path answers with a 302 to the published DX Consultancy page and leaves the sitemap', () => {
  assert.equal(hiddenTarget(['/', '/consultancy']), '/consultancy');
  assert.equal(hiddenTarget(['/', '/dx-consultancy']), '/dx-consultancy');
  HIDDEN_ROUTES.push('/case-studies');
  try {
    assert.ok(isHidden('/case-studies') && isHidden('/case-studies/one') && !isHidden('/case-studies-two'));
    assert.deepEqual(hiddenRedirects(['/', '/consultancy']), [
      { source: '/case-studies', destination: '/consultancy', statusCode: 302 },
      { source: '/case-studies/:rest*', destination: '/consultancy', statusCode: 302 },
    ]);
    assert.deepEqual(sitemapUrls({ pages: [{ path: '/' }, { path: '/case-studies' }] }).map((u) => u.url), ['https://greatstoneint.com/']
      .concat(['/shop', '/ai-market-intelligence', '/gs-agentic-manager'].map((path) => 'https://greatstoneint.com' + path)));
  } finally {
    HIDDEN_ROUTES.length = 0;
  }
});
