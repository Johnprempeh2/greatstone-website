// CTA button style modifiers -> safe classes, shared by every CTA-bearing block. ENUM-ONLY: size + a
// full-width-on-mobile toggle, the two universally-safe button customisations. Variant (solid vs ghost)
// stays each block's own concern (it is baked into the existing .b-cta / .b-cta.ghost classes), so this adds
// the NEW controls without a migration. Every default maps to '' so a button keeps its current look exactly.
// STORE-FREE (no DOM/React) so the enum->class policy is node-tested. Large only GROWS the target (>=44px).

export const CTA_SIZES = [
  { id: 'default', label: 'Default' },
  { id: 'lg', label: 'Large' },
];
export const CTA_FILLS = [
  { id: 'no', label: 'No' },
  { id: 'yes', label: 'Yes' },
];

const SIZE_IDS = new Set(CTA_SIZES.map((s) => s.id));

export function ctaStyleClass(style = {}) {
  const out = [];
  const s = style && style.size;
  if (s && s !== 'default' && SIZE_IDS.has(s)) out.push('gs-cta-' + s);   // gs-cta-lg
  if (style && style.fillMobile === 'yes') out.push('gs-cta-fill');
  return out.join(' ');
}
