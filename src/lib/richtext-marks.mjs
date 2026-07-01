// The CLOSED brand-class enum for inline rich text. ONE source of truth shared by the RichTextField toolbar
// (which inserts these classes) and the inline sanitiser (which allowlists them). Colour stays brand-safe by
// construction: an editor picks a named swatch, never a raw colour, so nothing off-brand or low-contrast can
// be authored, and the sanitiser strips any class outside this set (and the style attribute entirely).
// STORE-FREE: no React, no store.js, no DOM. Loads under bare node so the policy is unit-tested.

// foreground (text) colour runs. Sit on the dark page background only (documented; the toolbar offers them
// only as text colour, never as a page background).
export const RT_COLORS = [
  { id: '', label: 'Default', className: '' },
  { id: 'accent', label: 'Accent (lime)', className: 'gs-rt-c-accent' },
  { id: 'teal', label: 'Teal', className: 'gs-rt-c-teal' },
  { id: 'muted', label: 'Muted', className: 'gs-rt-c-muted' },
];

// highlight (background-behind-text) runs. Each ships a baked dark ink so the run passes AA regardless of the
// page background (the "text box" look John asked for). `shape` gives the background box a form: a square-ish box
// or a rounded pill, so an editor can change the SHAPE of the background behind specific text (John's ask). The
// baked dark ink is identical across shapes, so every shape stays AA by construction; `colour` keys the swatch.
export const RT_HIGHLIGHTS = [
  { id: '', label: 'None', className: '', shape: null, colour: '' },
  { id: 'accent', label: 'Accent box', className: 'gs-rt-bg-accent', shape: 'box', colour: 'accent' },
  { id: 'teal', label: 'Teal box', className: 'gs-rt-bg-teal', shape: 'box', colour: 'teal' },
  { id: 'accent-pill', label: 'Accent pill', className: 'gs-rt-bg-accent-pill', shape: 'pill', colour: 'accent' },
  { id: 'teal-pill', label: 'Teal pill', className: 'gs-rt-bg-teal-pill', shape: 'pill', colour: 'teal' },
];

// the full closed allowlist of span classes the inline sanitiser permits.
export const RT_SPAN_CLASSES = new Set(
  [...RT_COLORS, ...RT_HIGHLIGHTS].map((x) => x.className).filter(Boolean),
);

// Reference hex of the brand tokens these classes bind to (the CSS uses the --gs-* vars; these mirror them so
// the contrast guarantees below are unit-testable). Page background tokens for the foreground-on-dark check.
export const RT_INK = '#0e1611';            // dark ink baked into highlight boxes
export const RT_PAGE_BG = '#1f1f1f';        // the darkest realistic surface a foreground run sits on
export const RT_HEX = { accent: '#c8ff00', teal: '#4ecdc4', muted: '#c4c8c1' };

// highlight pairings (background + the ink that sits on it) the .gs-rt-bg-* CSS must honour. Every shape of a
// given colour bakes the SAME dark ink, so box and pill share the pairing (and both stay AA).
export const RT_BG_PAIRS = {
  'gs-rt-bg-accent': { bg: RT_HEX.accent, ink: RT_INK },
  'gs-rt-bg-teal': { bg: RT_HEX.teal, ink: RT_INK },
  'gs-rt-bg-accent-pill': { bg: RT_HEX.accent, ink: RT_INK },
  'gs-rt-bg-teal-pill': { bg: RT_HEX.teal, ink: RT_INK },
};

// --- WCAG contrast maths (relative luminance + ratio), pure ---
function channel(c) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
export function relLuminance(hex) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(hexA, hexB) {
  const la = relLuminance(hexA), lb = relLuminance(hexB);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
