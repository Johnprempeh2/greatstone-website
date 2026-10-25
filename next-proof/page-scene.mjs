import { STAGE_OPTIONS, normalizeBackground } from '../src/stage-presets.js';

export const PAGE_SCENE_PRESETS = STAGE_OPTIONS.filter((option) => option.scenes.length === 1).map((option) => option.id);
export const PAGE_SCENE_MODES = ['animate', 'still'];

export function validPageScene(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => ['surface', 'preset', 'motion'].includes(key)) &&
    ['plain', '3d'].includes(value.surface) && PAGE_SCENE_PRESETS.includes(value.preset) && PAGE_SCENE_MODES.includes(value.motion);
}

export function pageSceneBackground(value) {
  if (!validPageScene(value) || value.surface === 'plain') return null;
  return { ...normalizeBackground(value.preset), ceil: 0.38 };
}

export function resolvePageSceneFields(data, fields) {
  if (data.props?.pageScene?.surface === '3d') return fields;
  const { preset, motion, ...visible } = fields.pageScene.objectFields;
  return { ...fields, pageScene: { ...fields.pageScene, objectFields: visible } };
}
