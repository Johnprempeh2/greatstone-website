// Pure data shared by Stage (rendering) and store (normalising). No three.js here, so the
// store can import it without pulling the WebGL modules into its graph.

// quick-start presets: an id → ordered scene kinds. The editor expands these into an editable
// { scenes, transitions } model; the seed + the toolbar still write these ids as shorthand.
export const STAGE_OPTIONS = [
  { id: 'stone', label: 'Stone (logo)', scenes: ['stone'] },
  { id: 'summit', label: 'Summit (terrain)', scenes: ['summit'] },
  { id: 'cairn', label: 'Cairn (spiral)', scenes: ['cairn'] },
  { id: 'tide', label: 'Tide, waves', scenes: ['tide'] },
  { id: 'tide-radial', label: 'Tide, radial waves', scenes: ['tideRadial'] },
  { id: 'tide-calm', label: 'Tide, calm waves', scenes: ['tideCalm'] },
  { id: 'stone-summit', label: 'Stone → Summit (scroll)', scenes: ['stone', 'summit'] },
  { id: 'stone-tide', label: 'Stone → Tide (scroll)', scenes: ['stone', 'tide'] },
  { id: 'none', label: 'None', scenes: [] },
];

// the mountable scene kinds (the editor's per-scene dropdown). `color` is the swatch/band fill and
// `ink` the legible label colour on that fill (light fills get dark ink, matching the brand's
// lime-CTA rule) — one registry drives the dropdown, the swatches and the scene-track bands.
export const SCENE_KINDS = [
  { id: 'stone', label: 'Stone', color: '#1b5039', ink: '#ffffff' },
  { id: 'summit', label: 'Summit', color: '#2a6e8f', ink: '#ffffff' },
  { id: 'cairn', label: 'Cairn', color: '#3c966e', ink: '#ffffff' },
  { id: 'tide', label: 'Tide, waves', color: '#c8ff00', ink: '#0e1611' },
  { id: 'tideRadial', label: 'Tide, radial', color: '#9bd64a', ink: '#0e1611' },
  { id: 'tideCalm', label: 'Tide, calm', color: '#4ecdc4', ink: '#0e1611' },
];

// Expand a preset into the scene-track shape shared by the renderer and editors.
// Saved granular tracks pass through unchanged.
export function normalizeBackground(bg, makeId = (type) => `${type}-${Math.random().toString(36).slice(2, 8)}`) {
  if (bg && typeof bg === 'object' && Array.isArray(bg.scenes)) return bg;
  const opt = STAGE_OPTIONS.find((option) => option.id === bg) || STAGE_OPTIONS[0];
  const scenes = opt.scenes.map((kind) => ({ id: makeId('sc'), kind }));
  const transitions = scenes.slice(1).map(() => ({ id: makeId('tr'), at: 0.55, fade: 0.30, anchor: { type: 'scroll' } }));
  return { v: 1, scenes, transitions };
}

export const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a || 1e-4), 0), 1); return t * t * (3 - 2 * t); };

// Which element is actually scrolling? The Stage may live in a Puck iframe, so use its owner
// document's window. Some Puck layouts scroll a fixed inner canvas (PuckCanvas-root). `blockTop`
// returns an element's position in the scroll content's own coordinate space (scroll-invariant).
export function scrollContext(doc = typeof document !== 'undefined' ? document : null) {
  const view = doc?.defaultView;
  if (!doc || !view) return { top: 0, max: 0, view: 0, blockTop: () => 0, document: doc };
  const canvas = doc.querySelector('[class*="PuckCanvas-root"]');
  if (canvas && canvas.scrollHeight > canvas.clientHeight + 4) {
    const cr = canvas.getBoundingClientRect();
    return {
      top: canvas.scrollTop,
      max: canvas.scrollHeight - canvas.clientHeight,
      view: canvas.clientHeight,
      document: doc,
      blockTop: (el) => (el.getBoundingClientRect().top - cr.top) + canvas.scrollTop,
    };
  }
  // documentElement.scrollHeight is the true scrollable height (body's can be shorter with fixed/
  // collapsed-margin descendants), so the final transition doesn't complete early near the bottom
  const docH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
  return {
    top: view.scrollY,
    max: docH - view.innerHeight,
    view: view.innerHeight,
    document: doc,
    blockTop: (el) => el.getBoundingClientRect().top + view.scrollY,
  };
}

// Resolve a transition's effective scroll fraction (0..1). Block-pinned transitions measure the live
// `gs-blk-<id>` element in whichever element is scrolling; scroll-anchored ones use their stored `at`.
// Single source of truth shared by Stage (live cross-fade) and BackgroundPanel (track + readouts) so
// the editor preview can never drift from the published handoff point.
export function resolveTransitionAt(tr, sc) {
  if (tr.anchor && tr.anchor.type === 'block') {
    const el = sc.document?.getElementById('gs-blk-' + tr.anchor.blockId);
    if (el && sc.max > 0) {
      const h = el.getBoundingClientRect().height;
      const edgeOff = tr.anchor.edge === 'center' ? h / 2 : tr.anchor.edge === 'bottom' ? h : 0;
      return Math.min(Math.max((sc.blockTop(el) + edgeOff - sc.view / 2) / sc.max, 0), 1);
    }
    if (tr.anchor.fallbackAt != null) return tr.anchor.fallbackAt; // block deleted → fall back
  }
  return tr.at;
}
