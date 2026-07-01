// Pure model for the universal contextual toolbar (the "ContextBar" strip pinned under the editor top bar).
// STORE-FREE (no DOM, no React, no @measured/puck) so the policy is node-tested: which control groups apply to
// a selected block, and how a Section value is safely merged. The React layer (cms/ContextBar.jsx) owns reading
// the Puck selection and dispatching the change; this module owns the decisions.
//
// LOAD-BEARING invariant it protects: every value the strip writes must be a known enum id, so a stray write can
// never put a non-enum value onto a block. That mirrors sectionClass()'s unknown -> '' policy (block-style.mjs):
// the strip sets a prop, the block's render re-derives the safe class, so there is no new sanitiser surface.
import { SECTION_SURFACES, SECTION_ACCENTS, SECTION_SPACES } from './block-style.mjs';

// mirrors SECTION_DEFAULT in cms/style-field.jsx (kept here, not imported, so this stays a .mjs node can parse)
export const SECTION_FALLBACK = { surface: 'none', accent: 'default', spaceTop: 'default', spaceBottom: 'default' };

const VALID = {
  surface: new Set(SECTION_SURFACES.map((s) => s.id)),
  accent: new Set(SECTION_ACCENTS.map((a) => a.id)),
  spaceTop: new Set(SECTION_SPACES.map((s) => s.id)),
  spaceBottom: new Set(SECTION_SPACES.map((s) => s.id)),
};

// blocks that carry the shared groups beyond the universal Section (used by later slices). Section is on EVERY
// block via withAnchor, so its cap is always true. Keep these lists in step with style-field.jsx wiring.
export const CTA_BLOCKS = new Set(['Chapter', 'Columns', 'Invite', 'MethodTieIn']);
export const APPEARANCE_BLOCKS = new Set(['Prose', 'Chapter', 'Quote']);

// which strip groups apply to a selected block type
export function capsFor(type) {
  return { section: true, cta: CTA_BLOCKS.has(type), appearance: APPEARANCE_BLOCKS.has(type) };
}

// merge ONE Section key, keeping the others, defaulting any missing, and DROPPING an unknown key or value (a
// stray write is a no-op rather than corrupting the block). Returns a fresh object; never mutates the input.
export function nextSection(prev, key, value) {
  const base = { ...SECTION_FALLBACK, ...(prev && typeof prev === 'object' ? prev : {}) };
  if (!Object.prototype.hasOwnProperty.call(VALID, key) || !VALID[key].has(value)) return base;
  return { ...base, [key]: value };
}

// the current value of a Section key on a block's props, defaulted (so the strip can reflect the active pill)
export function sectionValue(prev, key) {
  const base = { ...SECTION_FALLBACK, ...(prev && typeof prev === 'object' ? prev : {}) };
  return base[key];
}
