import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { themeStyle } from '../app/theme-style.mjs';
import { pageMetadata } from '../app/page-metadata.mjs';
import { toProofRelease } from './release-adapter.mjs';

const release = JSON.parse(await readFile(process.env.PROOF_RELEASE_PATH || new URL('./data/release.json', import.meta.url), 'utf8'));
const pages = Object.fromEntries(release.pages.map((page) => [page.slug, page]));

test('the release carries every published marketing and legal page with complete SEO and stable block identities', () => {
  assert.equal(release.schema, 1);
  assert.deepEqual(release.pages.map((page) => page.slug), [
    'home', 'dx-consultancy', 'dev-tools', 'how-we-help', 'services', 'method', 'proof',
    'about', 'insights', 'climb', 'industries', 'contact', 'privacy', 'cookies', 'terms',
  ]);
  for (const slug of release.pages.map((page) => page.slug)) {
    const page = pages[slug];
    assert.equal(page.path, slug === 'home' ? '/' : `/${slug}`);
    assert.ok(page.seo.title && page.seo.description, `${slug} SEO metadata`);
    assert.ok(page.data.content.length, `${slug} blocks`);
    assert.equal(new Set(page.data.content.map((block) => block.props.id)).size, page.data.content.length, `${slug} unique block IDs`);
  }
  assert.deepEqual(pages.home.data.content.map((block) => block.type), ['TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof', 'TwoDoorsTools']);
  assert.deepEqual(pages['dev-tools'].data.content.map((block) => block.type), ['DevTools']);
  assert.ok(!pages.refunds && !pages['ai-market-intelligence']);
});

test('release navigation resolves to published page ids and all pages inherit one org', () => {
  const paths = new Map(release.pages.map((page) => [page.id, page.path]));
  assert.deepEqual(release.site.navigation.map((item) => paths.get(item.target.pageId)), ['/', '/dev-tools', '/proof', '/about', '/insights']);
  assert.equal(release.orgId, 'org-greatstone');
  assert.equal(new Set(release.pages.map((page) => page.id)).size, release.pages.length);
  assert.deepEqual(themeStyle(release.theme.tokens)['--gs-accent'], '#c8ff00');
});

test('server metadata supplies canonical and social URLs from the released page', () => {
  const meta = pageMetadata(pages.privacy, release.release.number);
  assert.equal(meta.title, pages.privacy.seo.title);
  assert.equal(meta.description, pages.privacy.seo.description);
  assert.equal(meta.alternates.canonical, 'https://greatstoneint.com/privacy');
  assert.equal(meta.openGraph.url, meta.alternates.canonical);
  assert.equal(meta.other['gsam-release'], '1');
});

test('unsafe release theme values are refused', () => {
  assert.throws(() => themeStyle({ 'gs.accent': 'red; background: blue' }), /Invalid release theme token/);
  assert.throws(() => themeStyle({ 'gs.accent': 'url(https://invalid.test)' }), /Invalid release theme token/);
});

test('proof release adapter refuses a missing published page', () => {
  assert.throws(() => toProofRelease({ pages: {}, settings: {}, navigation: [] }), /Missing published proof page/);
});
