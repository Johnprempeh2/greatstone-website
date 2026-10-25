// Stable release values. Keep old page props untouched: an absent `motion` means
// the block follows its legacy rendering path, while new blocks use editor defaults.
export const INTENSITIES = ['off', 'subtle', 'full'];
export const BACKGROUND_EFFECTS = ['bg.waves', 'bg.stone', 'bg.grid', 'bg.haze', 'bg.bedrock', 'bg.ascent', 'bg.datum', 'bg.meridian', 'bg.veil', 'bg.orbit'];
export const EFFECTS = ['none', 'hero.stone', 'band.tide', ...BACKGROUND_EFFECTS];
export const SPEEDS = ['still', 'slow', 'normal'];
export const COLOURS = ['emerald', 'teal'];
const DEFAULT_BACKGROUND = { effect: 'none', intensity: 'off', quietAnchor: 'copy' };
export const BACKGROUND_BLOCKS = ['Prose', 'Panels', 'ServiceCatalog', 'Invite', 'Steps', 'FeatureGrid', 'Faq', 'PillarCards', 'MaturityModel', 'Chapter', 'Team', 'LogoWall', 'IntelBand', 'MaturityMap', 'Ladder', 'MethodTieIn', 'IndustryPicker', 'BookDeepDive', 'AiCostCalculator'];
export const MOTION_BY_BLOCK = {
  DevTools: { effects: ['none', ...BACKGROUND_EFFECTS], default: { effect: 'none', intensity: 'off', quietAnchor: 'copy' } },
  AiBaselineSurvey: { effects: ['none', ...BACKGROUND_EFFECTS], default: { effect: 'none', intensity: 'off', quietAnchor: 'copy' } },
  Hero: { effects: ['none', 'hero.stone', ...BACKGROUND_EFFECTS], default: { effect: 'none', intensity: 'off', quietAnchor: 'copy' } },
  MotionBand: { effects: ['none', 'band.tide'], default: { effect: 'band.tide', intensity: 'subtle', quietAnchor: 'copy' } },
  ...Object.fromEntries(BACKGROUND_BLOCKS.map((type) => [type, { effects: ['none', ...BACKGROUND_EFFECTS], default: DEFAULT_BACKGROUND }])),
};

// Only effects with a renderer appear in the host picker. Stills are site paths.
export const MOTION_EFFECTS = [
  { id: 'hero.stone', label: 'Hero stone', still: '/motion/stone-still.png' },
  { id: 'band.tide', label: 'Tide band', still: '/motion/tide-still.png' },
  { id: 'bg.waves', label: 'Waves', still: '/motion/tide-still.png', description: 'Quiet waves at the edge of a block.' },
  { id: 'bg.stone', label: 'Stone', still: '/motion/stone-still.png', description: 'A still stone beyond the copy.' },
  { id: 'bg.grid', label: 'Grid backdrop', still: '/motion/datum-dark.webp', description: 'A fine engineered grid.' },
  { id: 'bg.haze', label: 'Emerald haze', still: '/motion/veil-dark.webp', description: 'A soft emerald atmosphere.' },
  { id: 'bg.bedrock', label: 'Bedrock', still: '/motion/bedrock-dark.webp', study: '015' },
  { id: 'bg.ascent', label: 'Ascent', still: '/motion/ascent-dark.webp', study: '016' },
  { id: 'bg.datum', label: 'Datum', still: '/motion/datum-dark.webp', study: '017' },
  { id: 'bg.meridian', label: 'Meridian', still: '/motion/meridian-dark.webp', study: '018' },
  { id: 'bg.veil', label: 'Veil', still: '/motion/veil-dark.webp', study: '019' },
  { id: 'bg.orbit', label: 'Orbit', still: '/motion/orbit-dark.webp', study: '020' },
].map((effect) => ({ ...effect, preview: `/effect-preview/${effect.id}`, description: effect.description || `${effect.label} ambient study.`, settings: { intensity: INTENSITIES, speed: SPEEDS, colour: COLOURS, defaults: { intensity: 'subtle', speed: 'slow', colour: 'emerald' } }, textSafety: { quietZone: 'copy', minimumBodyContrast: '7:1', limeBehindCopy: false, reducedMotion: 'still' } }));

export function resolveMotion(type, props = {}) {
  const choice = props.motion;
  if (!choice) return null; // A saved release from before motion fields keeps its old path.
  const allowed = MOTION_BY_BLOCK[type]?.effects || ['none'];
  const effect = allowed.includes(choice.effect) ? choice.effect : 'none';
  const intensity = INTENSITIES.includes(choice.intensity) ? choice.intensity : 'off';
  return { effect, intensity: effect === 'none' ? 'off' : intensity, quietAnchor: 'copy', speed: SPEEDS.includes(choice.speed) ? choice.speed : 'slow', colour: COLOURS.includes(choice.colour) ? choice.colour : 'emerald' };
}

export function motionField(type) {
  const definition = MOTION_BY_BLOCK[type];
  if (!definition) return {};
  return { motion: { type: 'object', label: 'Motion', objectFields: {
    effect: { type: 'select', label: 'Effect', options: definition.effects.map((value) => ({ label: value === 'none' ? 'None' : MOTION_EFFECTS.find((item) => item.id === value)?.label, value })) },
    intensity: { type: 'radio', label: 'Intensity', options: INTENSITIES.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
    speed: { type: 'radio', label: 'Speed', options: SPEEDS.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
    colour: { type: 'radio', label: 'Colour', options: COLOURS.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
  } } };
}

export function resolveMotionFields(type, data, fields) {
  if (!MOTION_BY_BLOCK[type] || (data.props?.motion?.effect && data.props.motion.effect !== 'none')) return fields;
  const { intensity, speed, colour, ...visible } = fields.motion.objectFields;
  return { ...fields, motion: { ...fields.motion, objectFields: visible } };
}
