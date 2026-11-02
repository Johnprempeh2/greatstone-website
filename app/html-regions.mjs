// GRE-3782: each region of a schema 2 page (header, nav, page, footer) sits in an engine-owned box with
// `contain: paint`, so a fixed or absolutely placed element can only cover its own region. The box is
// outside `[data-gs-scope]`, which scoped CSS can never select, so page CSS cannot undo it.
import { createElement } from 'react';

export const REGION_STYLE = Object.freeze({ contain: 'paint' });

export function Region({ scope, as = 'div', attributes = {}, children }) {
  return createElement('div', { style: REGION_STYLE }, createElement(as, { 'data-gs-scope': scope, ...attributes }, children));
}
