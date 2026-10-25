import assert from 'node:assert/strict';
import test from 'node:test';
import baked from './data/release.json' with { type: 'json' };
import { PAGE_SCENE_PRESETS, pageSceneBackground, resolvePageSceneFields, validPageScene } from './page-scene.mjs';
import { validateRelease } from './release-validator.mjs';

test('the page field offers every mounted scene preset and no arbitrary style', () => {
  assert.deepEqual(PAGE_SCENE_PRESETS, ['stone', 'summit', 'cairn', 'tide', 'tide-radial', 'tide-calm']);
  for (const preset of PAGE_SCENE_PRESETS) {
    assert.equal(validPageScene({ surface: '3d', preset, motion: 'animate' }), true);
  }
  for (const invalid of [null, {}, { surface: '3d', preset: 'custom', motion: 'still' }, { surface: '3d', preset: 'stone', motion: 'fast' }, { surface: '3d', preset: 'stone', motion: 'still', color: '#f00' }]) {
    assert.equal(validPageScene(invalid), false);
  }
});

test('a chosen page scene expands into the renderer track; plain keeps the site surface', () => {
  assert.equal(pageSceneBackground({ surface: 'plain', preset: 'stone', motion: 'animate' }), null);
  const scene = pageSceneBackground({ surface: '3d', preset: 'cairn', motion: 'still' });
  assert.deepEqual(scene.scenes.map((item) => item.kind), ['cairn']);
  assert.equal(scene.ceil, 0.38);
});

test('draft root background survives release validation only with approved fields', () => {
  const release = structuredClone(baked);
  const page = release.pages[0];
  page.data.root.props.pageScene = { surface: '3d', preset: 'cairn', motion: 'still' };
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
  page.data.root.props.pageScene.motion = 'fast';
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R6');
});

test('scene and motion choices are offered only when 3D is on', () => {
  const fields = { pageScene: { objectFields: { surface: {}, preset: {}, motion: {} } } };
  assert.equal(resolvePageSceneFields({ props: { pageScene: { surface: 'plain' } } }, fields).pageScene.objectFields.preset, undefined);
  assert.ok(resolvePageSceneFields({ props: { pageScene: { surface: '3d' } } }, fields).pageScene.objectFields.motion);
});
