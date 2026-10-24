// Stable release values. Keep old page props untouched: an absent `motion` means
// the block follows its legacy rendering path, while new blocks use editor defaults.
export const EFFECTS = ['none', 'hero.stone', 'band.tide', 'bg.bedrock', 'bg.ascent', 'bg.datum', 'bg.meridian', 'bg.veil', 'bg.orbit'];
export const INTENSITIES = ['off', 'subtle', 'full'];
export const MOTION_BY_BLOCK = {
  DevTools: { effects: ['none'], default: { effect: 'none', intensity: 'off', quietAnchor: 'copy' } },
  AiBaselineSurvey: { effects: ['none'], default: { effect: 'none', intensity: 'off', quietAnchor: 'copy' } },
  Hero: { effects: ['none', 'hero.stone'], default: { effect: 'none', intensity: 'off', quietAnchor: 'copy' } },
  MotionBand: { effects: ['none', 'band.tide'], default: { effect: 'band.tide', intensity: 'subtle', quietAnchor: 'copy' } },
};

export function resolveMotion(type, props = {}) {
  const choice = props.motion;
  if (!choice) return null; // A saved release from before motion fields keeps its old path.
  const allowed = MOTION_BY_BLOCK[type]?.effects || ['none'];
  const effect = allowed.includes(choice.effect) ? choice.effect : 'none';
  const intensity = INTENSITIES.includes(choice.intensity) ? choice.intensity : 'off';
  return { effect, intensity: effect === 'none' ? 'off' : intensity, quietAnchor: 'copy' };
}

export function motionField(type) {
  const definition = MOTION_BY_BLOCK[type];
  if (!definition) return {};
  return { motion: { type: 'object', label: 'Motion', objectFields: {
    effect: { type: 'select', label: 'Effect', options: definition.effects.map((value) => ({ label: ({ none: 'None', 'hero.stone': 'Hero stone', 'band.tide': 'Tide band' })[value], value })) },
    intensity: { type: 'radio', label: 'Intensity', options: INTENSITIES.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
  } } };
}

export function resolveMotionFields(type, data, fields) {
  if (!MOTION_BY_BLOCK[type] || (data.props?.motion?.effect && data.props.motion.effect !== 'none')) return fields;
  const { intensity, ...visible } = fields.motion.objectFields;
  return { ...fields, motion: { ...fields.motion, objectFields: visible } };
}
