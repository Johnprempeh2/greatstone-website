// Per-block "appearance" -> a safe className. ENUM-ONLY: an editor picks a named surround + padding, never a
// raw colour or CSS, so a block box can never inject arbitrary styles or break contrast, and an unknown value
// maps to '' (no class, no injection). Defaults map to '' so existing pages render byte-identically.
// STORE-FREE (no DOM, no React) so the enum->class policy is node-tested.

export const SURROUNDS = [
  { id: 'none', label: 'None' },
  { id: 'card', label: 'Card' },
  { id: 'soft', label: 'Accent tint' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'outline', label: 'Outline' },
];
export const PADS = [
  { id: 'snug', label: 'Snug' },
  { id: 'standard', label: 'Standard' },
  { id: 'roomy', label: 'Roomy' },
];

const SURROUND_IDS = new Set(SURROUNDS.map((s) => s.id));
const PAD_IDS = new Set(PADS.map((p) => p.id));

// Build the wrapper className for a block's Appearance group. 'none'/unknown surround -> no surround class;
// 'standard'/unknown pad -> no pad class (the block's own default padding stands).
export function appearanceClass(style = {}) {
  const out = [];
  const s = style && style.surround;
  if (s && s !== 'none' && SURROUND_IDS.has(s)) out.push('gs-surround', 'gs-surround-' + s);
  const p = style && style.pad;
  if (p && p !== 'standard' && PAD_IDS.has(p)) out.push('gs-pad-' + p);
  return out.join(' ');
}

// ── Universal "Section" group (applies to EVERY block via the .gs-blk wrapper in puck.config.jsx) ──
// Controlled, brand-constrained flexibility per section: vertical spacing rhythm, a background "surface" band,
// and a palette-only accent re-tint. ENUM-ONLY like above; every default maps to '' so existing pages render
// byte-identically. Surfaces are dark by construction (the default light text stays AA); there is deliberately
// no light/inverted surface and no free colour, so contrast and brand can never be broken from the editor.
// extra breathing room ABOVE/BELOW a section (margin on the .gs-blk wrapper). 'default' = no added gap (the
// block's own padding provides the rhythm, unchanged); the rest add a clamp()ed margin.
export const SECTION_SPACES = [
  { id: 'default', label: 'Default' },
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
];
export const SECTION_SURFACES = [
  { id: 'none', label: 'None' },
  { id: 'panel', label: 'Panel' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'deep', label: 'Deep' },
];
export const SECTION_ACCENTS = [
  { id: 'default', label: 'Lime (default)' },
  { id: 'teal', label: 'Teal' },
];

const SPACE_IDS = new Set(SECTION_SPACES.map((s) => s.id));
const SURFACE_IDS = new Set(SECTION_SURFACES.map((s) => s.id));
const ACCENT_IDS = new Set(SECTION_ACCENTS.map((a) => a.id));

// reference hexes (mirroring the --gs-* tokens the CSS binds to) so the surface/accent contrast is unit-tested
export const SECTION_TEXT_HEX = '#f5f5f5';                 // --gs-text, the body text on every surface
export const SECTION_SURFACE_HEX = { panel: '#1c1c1c', emerald: '#0e3122', deep: '#0a0a0a' };
export const SECTION_ACCENT_TEAL_HEX = '#4ecdc4';

export function sectionClass(section = {}) {
  const out = [];
  const st = section && section.spaceTop;
  if (st && st !== 'default' && SPACE_IDS.has(st)) out.push('gs-sec-spt-' + st);
  const sb = section && section.spaceBottom;
  if (sb && sb !== 'default' && SPACE_IDS.has(sb)) out.push('gs-sec-spb-' + sb);
  const sf = section && section.surface;
  if (sf && sf !== 'none' && SURFACE_IDS.has(sf)) out.push('gs-sec-surface', 'gs-sec-surface-' + sf);
  const ac = section && section.accent;
  if (ac && ac !== 'default' && ACCENT_IDS.has(ac)) out.push('gs-sec-accent-' + ac);
  return out.join(' ');
}
