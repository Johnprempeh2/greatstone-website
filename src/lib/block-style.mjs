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
