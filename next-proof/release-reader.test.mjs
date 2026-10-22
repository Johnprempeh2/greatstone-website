import assert from 'node:assert/strict';
import test from 'node:test';
import baked from './data/release.json' with { type: 'json' };
import { createReleaseReader } from './release-reader.mjs';
import { validateRelease } from './release-validator.mjs';
import { resolveMediaRefs } from './release-media.mjs';

const copy = (value) => structuredClone(value);
const ids = { siteId: baked.siteId, orgId: baked.orgId };
const live = () => {
  const release = copy(baked);
  release.release.number = 2;
  release.release.id = '22222222-2222-4222-8222-222222222222';
  release.pages.find((page) => page.path === '/').seo.title = 'Release two home';
  return release;
};
const pointer = (release) => ({ schema: 1, number: release.release.number, releaseId: release.release.id, switchedAt: '2026-10-22T12:00:00Z' });
const reader = ({ current = null, release = null } = {}) => createReleaseReader({
  baked, ...ids,
  readCurrent: async () => current,
  readRelease: async () => release && JSON.stringify(release),
});

test('good release serves its page data and metadata source', async () => {
  const release = live();
  const active = await reader({ current: pointer(release), release })();
  assert.equal(active.source, 'blobs');
  assert.equal(active.release.release.number, 2);
  assert.equal(active.release.pages.find((page) => page.path === '/').seo.title, 'Release two home');
  assert.equal(active.refused, null);
});

test('stale file under current key retains the last good release', async () => {
  const release = live();
  let current = pointer(release);
  let file = release;
  const activeRelease = createReleaseReader({ baked, ...ids, readCurrent: async () => current, readRelease: async () => JSON.stringify(file) });
  assert.equal((await activeRelease()).source, 'blobs');
  current = { ...current, number: 3 };
  file = baked;
  const stale = await activeRelease();
  assert.equal(stale.source, 'cache');
  assert.equal(stale.release.release.number, 2);
  assert.equal(stale.refused.rule, 'current');
});

test('missing pointer or release falls back to baked release', async () => {
  const missingPointer = await reader()();
  assert.equal(missingPointer.source, 'baked');
  assert.equal(missingPointer.refused.rule, 'current');
  const missingFile = await reader({ current: pointer(live()) })();
  assert.equal(missingFile.source, 'baked');
  assert.equal(missingFile.refused.rule, 'missing');
});

test('invalid releases are refused and keep the last good page', async () => {
  const changes = [
    [ 'R2', (r) => { r.schema = 2; } ],
    [ 'R3', (r) => { r.siteId = '33333333-3333-4333-8333-333333333333'; } ],
    [ 'R4', (r) => { r.orgId = 'other-org'; } ],
    [ 'R5', (r) => { r.pages[1].path = '/'; } ],
    [ 'R6', (r) => { r.pages[0].data.content[0].type = 'UnknownBlock'; } ],
    [ 'R7', (r) => { r.pages[0].title = 'media:missing'; } ],
    [ 'R8', (r) => { r.site.navigation[0].target.pageId = '33333333-3333-4333-8333-333333333333'; } ],
    [ 'R9', (r) => { r.redirects.push({ id: 'bad', from: '/old', to: '/missing', status: 301 }); } ],
    [ 'R10', (r) => { r.collections.offerings.fieldsVersion = 2; } ],
    [ 'R1', (r) => { delete r.theme; } ],
  ];
  for (const [rule, mutate] of changes) {
    const release = live();
    mutate(release);
    assert.equal(validateRelease(release, ids)?.rule, rule, rule);
    const active = await reader({ current: pointer(release), release })();
    assert.equal(active.source, 'baked', rule);
    assert.equal(active.refused.rule, rule);
  }
});

test('redirect loops and duplicate nested ids are refused', () => {
  const redirect = live();
  redirect.redirects.push({ id: 'a', from: '/a', to: '/b', status: 301 }, { id: 'b', from: '/b', to: '/a', status: 301 });
  assert.equal(validateRelease(redirect, ids)?.rule, 'R9');
  const blocks = live();
  const item = blocks.pages[0].data.content[0];
  blocks.pages[0].data.content.push(copy(item));
  assert.equal(validateRelease(blocks, ids)?.rule, 'R6');
});

test('published media references resolve to content-addressed public paths', () => {
  const hash = 'a'.repeat(64);
  const value = { logo: 'media:logo', text: 'Read media:logo in prose.' };
  assert.deepEqual(resolveMediaRefs(value, { logo: { key: `media/${hash}.webp` } }), {
    logo: `/media/${hash}.webp`, text: 'Read media:logo in prose.',
  });
});
