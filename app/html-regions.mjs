// GRE-3782: each region of a schema 2 page (header, nav, page, footer) sits in an engine-owned box with
// layout containment, so a fixed or absolutely placed element is held by its own region and cannot
// cover the whole screen. The box is outside `[data-gs-scope]`, which scoped CSS can never select, so
// page CSS cannot undo it.
//
// GRE-3778: the page and footer boxes also clip (`overflow: clip`), so nothing they hold paints outside
// them. `contain: paint` did the same but moved colours by one level where the frozen landing blends
// layers, so the landing was no longer pixel-identical. The header and nav boxes do not clip: their
// menus open over the page, so they sit above it instead, and still cannot place anything fixed.
import { createElement } from 'react';

export const REGION_STYLE = Object.freeze({ contain: 'layout', overflow: 'clip' });
export const MENU_REGION_STYLE = Object.freeze({ contain: 'layout', position: 'relative', zIndex: 2 });
const MENU_REGIONS = new Set(['header', 'nav']);

export function Region({ scope, as = 'div', attributes = {}, children }) {
  const style = MENU_REGIONS.has(scope) ? MENU_REGION_STYLE : REGION_STYLE;
  return createElement('div', { style }, createElement(as, { 'data-gs-scope': scope, ...attributes }, children));
}
