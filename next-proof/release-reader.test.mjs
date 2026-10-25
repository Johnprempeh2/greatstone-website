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
