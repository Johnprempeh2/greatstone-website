import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import baked from './data/release.json' with { type: 'json' };
import { createReleaseReader } from './release-reader.mjs';
import { resolveMediaRefs } from './release-media.mjs';
import { pageMetadata } from '../app/page-metadata.mjs';
import { releaseNumber, releaseReport } from '../app/release-observation.mjs';

const ids = { siteId: baked.siteId, orgId: baked.orgId };
const live = (number = 2) => ({
  schema: 1, siteId: baked.siteId, orgId: null, release: number, theme: {},
  pages: baked.pages.map((page) => ({ id: page.id, slug: page.path, title: page.title,
    seo: page.seo, content: page.data, menu: page.slug === 'home' ? 'main' : null })),
  collections: {}, redirects: [], media: {},
});
const signed = (release) => {
  const raw = JSON.stringify(release);
  const current = { schema: 1, release: release.release, key: `releases/${release.release}.json`,
    sha256: createHash('sha256').update(raw).digest('hex'), switchedAt: '2026-10-22T12:00:00Z', fence: 1 };
  return { current, raw };
};
const reader = ({ current = null, raw = null } = {}) => createReleaseReader({
  baked, ...ids, readCurrent: async () => current, readRelease: async () => raw,
});

test('good GSAM release serves its page and number', async () => {
  const release = live();
  release.pages[0].seo.title = 'Release two home';
  const active = await reader(signed(release))();
  assert.equal(active.source, 'blobs');
  assert.equal(active.release.release.number, 2);
  assert.equal(active.release.pages[0].seo.title, 'Release two home');
  assert.equal(active.refused, null);
});

test('page marker and /_release report the same accepted number', async () => {
  const active = await reader(signed(live(4)))();
  const number = releaseNumber(active.release);
  assert.equal(pageMetadata(active.release.pages[0], number).other['gsam-release'], '4');
  assert.equal(releaseReport(active, baked.release.engine, [1]).release, 4);
});

test('stale file under current key retains the last good release', async () => {
  const good = signed(live());
  let { current, raw } = good;
  const activeRelease = createReleaseReader({ baked, ...ids, readCurrent: async () => current, readRelease: async () => raw });
  assert.equal((await activeRelease()).source, 'blobs');
  current = signed(live(3)).current;
  const stale = await activeRelease();
  assert.equal(stale.source, 'cache');
  assert.equal(stale.release.release.number, 2);
  assert.equal(stale.refused.rule, 'sha256');
});

test('missing pointer and release fall back to baked release', async () => {
  assert.equal((await reader()()).refused.rule, 'current');
  const missingFile = await reader({ current: signed(live()).current })();
  assert.equal(missingFile.source, 'baked');
  assert.equal(missingFile.refused.rule, 'missing');
});

test('invalid pointer, digest, envelope, and pages are refused', async () => {
  const good = signed(live());
  const cases = [
    { ...good, current: { ...good.current, fence: 0 }, rule: 'current' },
    { ...good, current: { ...good.current, key: 'releases/3.json' }, rule: 'current' },
    { ...good, raw: '{}', rule: 'sha256' },
    { ...signed({ ...live(), siteId: 'wrong-site' }), rule: 'release' },
    { ...signed({ ...live(), pages: [] }), rule: 'release' },
  ];
  for (const item of cases) {
    const active = await reader(item)();
    assert.equal(active.source, 'baked');
    assert.equal(active.refused.rule, item.rule);
  }
});

test('media asset ids resolve to content addressed public paths', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(resolveMediaRefs({ logo: 'asset-id' }, { 'asset-id': { key: `media/${hash}.webp` } }), {
    logo: `/media/${hash}.webp`,
  });
});

// GRE-3776: schema 2 releases carry page HTML and CSS, shared chrome and one site stylesheet.
const htmlLive = (number = 5) => ({
  schema: 2, siteId: baked.siteId, orgId: null, release: number, theme: {},
  stylesheet: ':root{--ink:#111}',
  chrome: { header: { html: '<header>Logo</header>', css: '.a{color:red}' }, footer: { html: '<footer>f</footer>', css: '' },
    nav: { html: '<nav><a href="/">Home</a></nav>', css: '' } },
  pages: [
    { id: 'p-home', slug: '/', title: 'Home', parentPageId: null, menu: 'header', menuOrder: 1, navOrder: 1, seo: { description: 'Home page' },
      html: '<section class="hero"><h1>Hello</h1></section>', css: '.hero{padding:2rem}' },
    { id: 'p-contact', slug: '/contact', title: 'Contact', parentPageId: null, menu: null, menuOrder: null, navOrder: 2, seo: {},
      html: '<gs-island name="enquiry-form" data-form="contact"></gs-island>', css: '' },
  ],
  collections: {}, redirects: [], media: {},
});

test('schema 2 release serves HTML pages, chrome and stylesheet', async () => {
  const active = await reader(signed(htmlLive()))();
  assert.equal(active.source, 'blobs');
  assert.equal(active.refused, null);
  assert.equal(active.release.releaseSchema, 2);
  assert.equal(active.release.stylesheet, ':root{--ink:#111}');
  assert.deepEqual(active.release.chrome.nav, { html: '<nav><a href="/">Home</a></nav>', css: '' });
  const home = active.release.pages.find((page) => page.path === '/');
  assert.deepEqual([home.format, home.html, home.css, home.data], ['html', '<section class="hero"><h1>Hello</h1></section>', '.hero{padding:2rem}', undefined]);
  assert.equal(home.seo.title, 'Home');
  assert.deepEqual(active.release.site.navigation.map((item) => item.label), ['Home']);
});

test('schema 1 releases still render Puck data after schema 2 support', async () => {
  const active = await reader(signed(live(6)))();
  assert.equal(active.release.releaseSchema, 1);
  assert.equal(active.release.chrome, null);
  assert.ok(active.release.pages.every((page) => page.data && !page.format));
});

test('/_release reports schemas 1 and 2', async () => {
  const { supportedReleaseSchemas } = await import('./release-reader.mjs');
  assert.deepEqual(supportedReleaseSchemas, [1, 2]);
  const report = releaseReport(await reader(signed(htmlLive(7)))(), baked.release.engine, supportedReleaseSchemas);
  assert.deepEqual([report.release, report.supportedReleaseSchemas], [7, [1, 2]]);
});

test('invalid schema 2 releases are refused', async () => {
  const withPage = (change) => { const release = htmlLive(); Object.assign(release.pages[0], change); return release; };
  const cases = [
    [{ ...htmlLive(), schema: 3 }, 'release'],
    [{ ...htmlLive(), stylesheet: undefined }, 'chrome'],
    [{ ...htmlLive(), chrome: { ...htmlLive().chrome, sidebar: { html: '', css: '' } } }, 'chrome'],
    [{ ...htmlLive(), chrome: { header: { html: '<header></header>' } } }, 'chrome'],
    [withPage({ html: undefined }), 'pages'],
    [withPage({ css: 42 }), 'pages'],
    // A schema 2 page with only Puck data is not valid schema 2.
    [withPage({ html: undefined, css: undefined, content: baked.pages[0].data }), 'pages'],
  ];
  for (const [release, rule] of cases) {
    const active = await reader(signed(release))();
    assert.equal(active.source, 'baked');
    assert.equal(active.refused.rule, rule, JSON.stringify(release).slice(0, 80));
  }
});

// GRE-3789: page SEO can carry FAQ structured data (plain text), which the engine writes as JSON-LD.
test('schema 2 page SEO carries FAQ questions; malformed ones refuse the release', async () => {
  const release = htmlLive(8);
  release.pages[1].seo = { faq: [{ q: 'Where does data go?', a: 'Your own instance.', extra: 'dropped' }] };
  const active = await reader(signed(release))();
  assert.equal(active.refused, null);
  assert.deepEqual(active.release.pages.find((page) => page.path === '/contact').seo.faq, [{ q: 'Where does data go?', a: 'Your own instance.' }]);
  assert.equal(active.release.pages.find((page) => page.path === '/').seo.faq, undefined);
  for (const faq of ['text', [{ q: 'Q' }], [{ q: '', a: 'A' }], [{ q: 'Q', a: 'x'.repeat(4001) }], Array(51).fill({ q: 'Q', a: 'A' })]) {
    const bad = htmlLive(8);
    bad.pages[0].seo = { faq };
    const refused = await reader(signed(bad))();
    assert.equal(refused.refused?.rule, 'pages', JSON.stringify(faq).slice(0, 40));
  }
});
