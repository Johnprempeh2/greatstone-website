import { STAGE_OPTIONS, SCENE_KINDS, normalizeBackground } from '../src/stage-presets.js';

export const PAGE_SCENE_PRESETS = STAGE_OPTIONS.filter((option) => option.scenes.length === 1).map((option) => option.id);
export const PAGE_SCENE_MODES = ['animate', 'still'];
export const PAGE_SCENE_STRENGTHS = { quiet: 0.24, standard: 0.38, bold: 0.5 };
const kinds = new Set(SCENE_KINDS.map((kind) => kind.id));
const keys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const fraction = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100;

export function validSceneTrack(track, blockIds = null) {
  if (!track || typeof track !== 'object' || Array.isArray(track) || !keys(track, ['v', 'scenes', 'transitions']) || track.v !== 1 ||
    !Array.isArray(track.scenes) || track.scenes.length < 1 || track.scenes.length > 3 || !Array.isArray(track.transitions) || track.transitions.length !== track.scenes.length - 1) return false;
  if (new Set(track.scenes.map((scene) => scene.id)).size !== track.scenes.length || new Set(track.transitions.map((tr) => tr.id)).size !== track.transitions.length) return false;
  if (!track.scenes.every((scene) => scene && typeof scene === 'object' && !Array.isArray(scene) && keys(scene, ['id', 'kind', 'strength']) && id(scene.id) && kinds.has(scene.kind) && Object.hasOwn(PAGE_SCENE_STRENGTHS, scene.strength))) return false;
  if (!track.transitions.every((tr) => {
    if (!tr || typeof tr !== 'object' || Array.isArray(tr) || !keys(tr, ['id', 'at', 'fade', 'anchor']) || !id(tr.id) || !fraction(tr.at, 0.05, 0.95) || !fraction(tr.fade, 0.04, 0.4)) return false;
    const anchor = tr.anchor;
    if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return false;
    if (anchor.type === 'scroll') return keys(anchor, ['type']);
    return anchor.type === 'block' && keys(anchor, ['type', 'blockId', 'edge', 'fallbackAt']) && id(anchor.blockId) &&
      ['top', 'center', 'bottom'].includes(anchor.edge) && fraction(anchor.fallbackAt, 0.05, 0.95) &&
      (!blockIds || (Array.isArray(blockIds) ? blockIds.includes(anchor.blockId) : blockIds.has(anchor.blockId)));
  })) return false;
  if (!track.transitions.every((tr, index) => index === 0 || tr.at > track.transitions[index - 1].at)) return false;
  if (track.transitions.length === 2 && track.transitions[0].anchor.type !== track.transitions[1].anchor.type) return false;
  if (Array.isArray(blockIds)) {
    const edgeOrder = { top: 0, center: 1, bottom: 2 };
    if (!track.transitions.every((tr, index) => {
      if (index === 0 || tr.anchor.type !== 'block') return true;
      const prior = track.transitions[index - 1].anchor;
      if (prior.type !== 'block') return true;
      const position = blockIds.indexOf(tr.anchor.blockId) * 3 + edgeOrder[tr.anchor.edge];
      const priorPosition = blockIds.indexOf(prior.blockId) * 3 + edgeOrder[prior.edge];
      return position > priorPosition;
    })) return false;
  }
  return true;
}

export function validPageScene(value, blockIds = null) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    keys(value, ['surface', 'preset', 'motion', 'track']) &&
    ['plain', '3d'].includes(value.surface) && PAGE_SCENE_MODES.includes(value.motion) &&
    (value.track !== undefined ? value.preset === undefined && validSceneTrack(value.track, blockIds) : PAGE_SCENE_PRESETS.includes(value.preset));
}

export function editablePageScene(value, makeId = () => crypto.randomUUID()) {
  if (value?.track) return value;
  const preset = PAGE_SCENE_PRESETS.includes(value?.preset) ? value.preset : 'stone';
  const background = normalizeBackground(preset, makeId);
  return { surface: value?.surface === '3d' ? '3d' : 'plain', motion: PAGE_SCENE_MODES.includes(value?.motion) ? value.motion : 'animate',
    track: { v: 1, scenes: background.scenes.map((scene) => ({ ...scene, strength: 'standard' })), transitions: [] } };
}

export function pageSceneBackground(value) {
  if (!validPageScene(value) || value.surface === 'plain') return null;
  if (value.track) return { ...value.track, strengthCeil: PAGE_SCENE_STRENGTHS };
  return { ...normalizeBackground(value.preset), ceil: PAGE_SCENE_STRENGTHS.standard };
}
