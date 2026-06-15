import './tide.js'; // side-effect: the UMD sets window.mountGreatstoneTide

// ESM wrapper so the studio can import the brand "tide of time" wave like the other stage
// modules. Returns the tide's { destroy } handle (it self-animates; no scroll input needed).
export function mountTide(container, opts = {}) {
  if (typeof window === 'undefined' || typeof window.mountGreatstoneTide !== 'function') return null;
  return window.mountGreatstoneTide(container, opts);
}
