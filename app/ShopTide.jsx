'use client';
import { TideField } from '../src/blocks/TideField.jsx';

// The landing's calm tide landscape as one fixed layer behind the whole shop page, dimmed so it stays
// subtle (John, 6 Nov). Without WebGL the CSS arcs show; with reduced motion the tide draws one still frame.
export function ShopTide() {
  return <div className="st-tide" aria-hidden="true"><TideField view="calm" /></div>;
}
