// Pure model for the universal contextual toolbar (the "ContextBar" strip pinned under the editor top bar).
// STORE-FREE (no DOM, no React, no @measured/puck) so the policy is node-tested: which control groups apply to
// a selected block, and how a Section value is safely merged. The React layer (cms/ContextBar.jsx) owns reading
// the Puck selection and dispatching the change; this module owns the decisions.
//
// LOAD-BEARING invariant it protects: every value the strip writes must be a known enum id, so a stray write can
// never put a non-enum value onto a block. That mirrors sectionClass()'s unknown -> '' policy (block-style.mjs):
// the strip sets a prop, the block's render re-derives the safe class, so there is no new sanitiser surface.
import { SECTION_SURFACES, SECTION_ACCENTS, SECTION_SPACES, SURROUNDS, PADS, TEXT_SCALES } from './block-style.mjs';
import { CTA_SIZES, CTA_FILLS } from './cta-style.mjs';

// mirror the *_DEFAULT constants in cms/style-field.jsx (kept here, not imported, so this stays a .mjs node parses)
export const SECTION_FALLBACK = { surface: 'none', accent: 'default', spaceTop: 'default', spaceBottom: 'default' };
export const APPEARANCE_FALLBACK = { surround: 'none', pad: 'standard', textScale: 'default' };
export const CTA_FALLBACK = { size: 'default', fillMobile: 'no' };

const VALID = {
  surface: new Set(SECTION_SURFACES.map((s) => s.id)),
  accent: new Set(SECTION_ACCENTS.map((a) => a.id)),
  spaceTop: new Set(SECTION_SPACES.map((s) => s.id)),
  spaceBottom: new Set(SECTION_SPACES.map((s) => s.id)),
};
const APP_VALID = { surround: new Set(SURROUNDS.map((s) => s.id)), pad: new Set(PADS.map((p) => p.id)), textScale: new Set(TEXT_SCALES.map((t) => t.id)) };
const CTA_VALID = { size: new Set(CTA_SIZES.map((s) => s.id)), fillMobile: new Set(CTA_FILLS.map((f) => f.id)) };

// blocks that carry the shared groups beyond the universal Section (used by later slices). Section is on EVERY
// block via withAnchor, so its cap is always true. Keep these lists in step with style-field.jsx wiring.
export const CTA_BLOCKS = new Set(['Chapter', 'Columns', 'Invite', 'MethodTieIn']);
export const APPEARANCE_BLOCKS = new Set(['Prose', 'Chapter', 'Quote']);
// blocks that render a RichTextField Body, so the strip can offer a "Text styles" deep-link to it
export const RICHTEXT_BLOCKS = new Set(['Faq', 'Prose', 'Chapter', 'Columns']);
// blocks that carry a horizontal-align prop with the SAME closed values (left/center). We read/write that
// existing per-block `align` prop directly (no refactor); Columns uses a separate `valign` and is excluded.
export const ALIGN_BLOCKS = new Set(['Hero', 'Prose', 'Chapter', 'Quote', 'Steps']);
export const ALIGNS = [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }];
const ALIGN_IDS = new Set(ALIGNS.map((a) => a.id));

// which strip groups apply to a selected block type
export function capsFor(type) {
  return { section: true, cta: CTA_BLOCKS.has(type), appearance: APPEARANCE_BLOCKS.has(type), text: RICHTEXT_BLOCKS.has(type), align: ALIGN_BLOCKS.has(type) };
}

// `align` is a bare string prop (not an object), so these validate the single value; an unknown value is left as
// the block's current one rather than corrupting it.
export function nextAlign(prev, value) { return ALIGN_IDS.has(value) ? value : (ALIGN_IDS.has(prev) ? prev : 'left'); }
export function alignValue(prev) { return ALIGN_IDS.has(prev) ? prev : 'left'; }
// does this block have inline text formatting (in its sidebar Body field) to deep-link to?
export function hasTextStyles(type) { return RICHTEXT_BLOCKS.has(type); }

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

// the same safe-merge + read pattern for the Appearance group (surround + pad, on Prose/Chapter/Quote)
export function nextAppearance(prev, key, value) {
  const base = { ...APPEARANCE_FALLBACK, ...(prev && typeof prev === 'object' ? prev : {}) };
  if (!Object.prototype.hasOwnProperty.call(APP_VALID, key) || !APP_VALID[key].has(value)) return base;
  return { ...base, [key]: value };
}
export function appearanceValue(prev, key) {
  const base = { ...APPEARANCE_FALLBACK, ...(prev && typeof prev === 'object' ? prev : {}) };
  return base[key];
}

// and for the CTA "Button style" group (size + fillMobile, on Chapter/Columns/Invite/MethodTieIn)
export function nextCta(prev, key, value) {
  const base = { ...CTA_FALLBACK, ...(prev && typeof prev === 'object' ? prev : {}) };
  if (!Object.prototype.hasOwnProperty.call(CTA_VALID, key) || !CTA_VALID[key].has(value)) return base;
  return { ...base, [key]: value };
}
export function ctaValue(prev, key) {
  const base = { ...CTA_FALLBACK, ...(prev && typeof prev === 'object' ? prev : {}) };
  return base[key];
}
