import { SURROUNDS, PADS, SECTION_SPACES, SECTION_SURFACES, SECTION_ACCENTS } from '../lib/block-style.mjs';

// One shared "Appearance" field group, imported by every block that offers a surround/text-box look, so the
// control is identical everywhere and the sidebar stays a single collapsible group rather than a wall of
// fields. Enum-only (select/radio) backed by the closed block-style.mjs sets; the block render turns the
// chosen value into a safe class via appearanceClass(). Default maps to no class (existing look unchanged).
export const APPEARANCE_FIELD = {
  type: 'object',
  label: 'Appearance',
  objectFields: {
    surround: { type: 'select', label: 'Surround (text box)', options: SURROUNDS.map((s) => ({ label: s.label, value: s.id })) },
    pad: { type: 'radio', label: 'Padding', options: PADS.map((p) => ({ label: p.label, value: p.id })) },
  },
};

export const APPEARANCE_DEFAULT = { surround: 'none', pad: 'standard' };

// The universal "Section" group — merged into EVERY block by withAnchor (puck.config.jsx), so any section can
// be spaced, given a background surface band, or re-tinted to a palette accent, with one identical control.
// Enum-only; sectionClass() turns the choice into a safe class; every default = no class (page unchanged).
export const SECTION_FIELD = {
  type: 'object',
  label: 'Section',
  objectFields: {
    surface: { type: 'select', label: 'Background', options: SECTION_SURFACES.map((s) => ({ label: s.label, value: s.id })) },
    accent: { type: 'radio', label: 'Accent', options: SECTION_ACCENTS.map((a) => ({ label: a.label, value: a.id })) },
    spaceTop: { type: 'select', label: 'Space above', options: SECTION_SPACES.map((s) => ({ label: s.label, value: s.id })) },
    spaceBottom: { type: 'select', label: 'Space below', options: SECTION_SPACES.map((s) => ({ label: s.label, value: s.id })) },
  },
};

export const SECTION_DEFAULT = { surface: 'none', accent: 'default', spaceTop: 'default', spaceBottom: 'default' };
