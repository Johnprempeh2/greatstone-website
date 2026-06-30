// Per-block heading element level (H2/H3/H4), so an editor can place a section correctly in the document
// outline (a sub-section drops to H3 instead of a wall of H2s). ENUM-ONLY: headingTag() returns a SAFE
// element name (clamped to the allowlist; unknown -> fallback) for the block render, and headingLevelNum()
// the numeric level the outline tooling (headings-of.mjs) reads, so the rendered DOM and the a11y outline can
// never drift. Never H1 (the page's single H1 is the Hero) and never below H4. STORE-FREE, node-tested.

export const HEADING_LEVELS = [
  { id: 'h2', label: 'H2 (section)' },
  { id: 'h3', label: 'H3 (sub-section)' },
  { id: 'h4', label: 'H4' },
];

const TAGS = new Set(['h2', 'h3', 'h4']);

export function headingTag(level, fallback = 'h2') {
  const v = String(level || '').toLowerCase();
  return TAGS.has(v) ? v : (TAGS.has(fallback) ? fallback : 'h2');
}

export function headingLevelNum(level, fallback = 2) {
  return Number(headingTag(level, 'h' + fallback).slice(1));
}
