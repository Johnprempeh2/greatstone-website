import assert from 'node:assert/strict';
import test from 'node:test';
import baked from './data/release.json' with { type: 'json' };
import { PAGE_SCENE_PRESETS, PAGE_SCENE_STRENGTHS, editablePageScene, pageSceneBackground, validPageScene } from './page-scene.mjs';
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

test('a three-scene track validates its order, anchors and named strengths', () => {
  let n = 0;
  const pageScene = editablePageScene({ surface: '3d', preset: 'stone', motion: 'animate' }, () => `sc-${++n}`);
  const track = pageScene.track;
  track.scenes.push({ id: 'sc-2', kind: 'summit', strength: 'quiet' }, { id: 'sc-3', kind: 'tideRadial', strength: 'bold' });
  track.transitions.push({ id: 'tr-1', at: 0.35, fade: 0.2, anchor: { type: 'block', blockId: 'hero-1', edge: 'top', fallbackAt: 0.35 } },
    { id: 'tr-2', at: 0.75, fade: 0.2, anchor: { type: 'block', blockId: 'hero-1', edge: 'center', fallbackAt: 0.75 } });
  assert.equal(validPageScene(pageScene, new Set(['hero-1'])), true);
  assert.deepEqual(pageSceneBackground(pageScene).strengthCeil, PAGE_SCENE_STRENGTHS);
  assert.equal(PAGE_SCENE_STRENGTHS.standard, 0.38);
  for (const change of [
    (v) => v.track.scenes.push({ id: 'sc-4', kind: 'stone', strength: 'standard' }),
    (v) => { v.track.transitions[1].at = 0.2; },
    (v) => { v.track.scenes[1].strength = '0.7'; },
    (v) => { v.track.transitions[0].fade = 1; },
    (v) => { v.track.transitions[1].anchor.blockId = ''; },
    (v) => { v.color = '#f00'; },
  ]) {
    const invalid = structuredClone(pageScene);
    change(invalid);
    assert.equal(validPageScene(invalid), false);
  }
  assert.equal(validPageScene(pageScene, new Set(['other'])), false);
  const release = structuredClone(baked);
  pageScene.track.transitions[0].anchor.blockId = release.pages[0].data.content[0].props.id;
  pageScene.track.transitions[1].anchor.blockId = release.pages[0].data.content[0].props.id;
  release.pages[0].data.root.props.pageScene = pageScene;
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
  release.pages[0].data.root.props.pageScene.track.transitions[0].fade = 1;
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R6');
});

test('a later pinned transition cannot point to an earlier section', () => {
  const scene = editablePageScene({ surface: '3d', preset: 'stone', motion: 'animate' }, () => 'scene-1');
  scene.track.scenes.push({ id: 'scene-2', kind: 'summit', strength: 'standard' }, { id: 'scene-3', kind: 'cairn', strength: 'standard' });
  scene.track.transitions.push(
    { id: 'tr-1', at: 0.35, fade: 0.2, anchor: { type: 'block', blockId: 'second', edge: 'center', fallbackAt: 0.35 } },
    { id: 'tr-2', at: 0.75, fade: 0.2, anchor: { type: 'block', blockId: 'first', edge: 'center', fallbackAt: 0.75 } },
  );
  assert.equal(validPageScene(scene, ['first', 'second']), false);
  scene.track.transitions[1].anchor = { type: 'scroll' };
  assert.equal(validPageScene(scene, ['first', 'second']), false);
  scene.track.transitions[1].anchor = { type: 'block', blockId: 'first', edge: 'center', fallbackAt: 0.75 };
  scene.track.transitions[1].anchor.blockId = 'second';
  scene.track.transitions[1].anchor.edge = 'bottom';
  assert.equal(validPageScene(scene, ['first', 'second']), true);
  scene.track.transitions[1].anchor.edge = 'top';
  assert.equal(validPageScene(scene, ['first', 'second']), false);
  scene.track.transitions[1].anchor.edge = 'bottom';
  const release = structuredClone(baked);
  const [first, second] = release.pages[0].data.content.map((block) => block.props.id);
  scene.track.transitions[0].anchor.blockId = second;
  scene.track.transitions[1].anchor.blockId = first;
  release.pages[0].data.root.props.pageScene = scene;
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R6');
});
