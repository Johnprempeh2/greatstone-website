import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRobotsTxt, buildSitemapXml } from '../src/lib/seo-files.mjs';
import { pageMetadata } from './page-metadata.mjs';
import { siteStructuredData } from './site-structured-data.mjs';

const origin = 'https://greatstoneint.com';

test('Next generates the same root-only sitemap and robots rules as Vite', async () => {
  const scripts = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  for (const name of ['build:next', 'dev:next']) assert.match(scripts[name], /node scripts\/gen-seo-files\.mjs/);
  const sitemap = buildSitemapXml(origin, { lastmod: '2026-10-22' });
  const robots = buildRobotsTxt(origin);
  assert.match(sitemap, /<loc>https:\/\/greatstoneint\.com<\/loc>/);
  assert.match(robots, /Sitemap: https:\/\/greatstoneint\.com\/sitemap\.xml/);
  for (const path of ['/admin', '/account', '/org', '/invoice', '/catalogue']) assert.match(robots, new RegExp(`Disallow: ${path}`));
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
