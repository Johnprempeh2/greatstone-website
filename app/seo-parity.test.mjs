import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRobotsTxt, buildSitemapXml } from '../src/lib/seo-files.mjs';
import { pageMetadata } from './page-metadata.mjs';
import { siteStructuredData } from './site-structured-data.mjs';

const origin = 'https://greatstoneint.com';

test('Next serves the same root-only sitemap and robots rules as Vite', async () => {
  const [sitemap, robots] = await Promise.all([
    readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8'),
    readFile(new URL('../public/robots.txt', import.meta.url), 'utf8'),
  ]);
  assert.equal(sitemap, buildSitemapXml(origin, { lastmod: sitemap.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] }));
  assert.equal(robots, buildRobotsTxt(origin));
  assert.equal((sitemap.match(/<url>/g) || []).length, 1);
});

test('page metadata retains canonical and default social image', () => {
  const result = pageMetadata({ path: '/services', seo: { title: 'Services', description: 'The services.' } }, 2);
  assert.equal(result.alternates.canonical, origin + '/services');
  assert.equal(result.openGraph.images[0], origin + '/og-default.png');
  assert.equal(result.twitter.card, 'summary_large_image');
  assert.equal(result.other['gs-release'], '2');
});

test('site structured data keeps the organisation and website graph', () => {
  const graph = siteStructuredData('Greatstone International')['@graph'];
  assert.deepEqual(graph.map((item) => item['@type']), ['Organization', 'WebSite']);
  assert.equal(graph[1].publisher['@id'], graph[0]['@id']);
});
