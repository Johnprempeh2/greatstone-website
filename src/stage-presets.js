// Pure data shared by Stage (rendering) and store (normalising). No three.js here, so the
// store can import it without pulling the WebGL modules into its graph.

// quick-start presets: an id → ordered scene kinds. The editor expands these into an editable
// { scenes, transitions } model; the seed + the toolbar still write these ids as shorthand.
export const STAGE_OPTIONS = [
  { id: 'stone', label: 'Stone (logo)', scenes: ['stone'] },
  { id: 'summit', label: 'Summit (terrain)', scenes: ['summit'] },
  { id: 'tide', label: 'Tide — waves', scenes: ['tide'] },
  { id: 'tide-radial', label: 'Tide — radial waves', scenes: ['tideRadial'] },
  { id: 'tide-calm', label: 'Tide — calm waves', scenes: ['tideCalm'] },
  { id: 'stone-summit', label: 'Stone → Summit (scroll)', scenes: ['stone', 'summit'] },
  { id: 'stone-tide', label: 'Stone → Tide (scroll)', scenes: ['stone', 'tide'] },
  { id: 'none', label: 'None', scenes: [] },
];

// the mountable scene kinds (the editor's per-scene dropdown)
export const SCENE_KINDS = [
  { id: 'stone', label: 'Stone' },
  { id: 'summit', label: 'Summit' },
  { id: 'tide', label: 'Tide — waves' },
  { id: 'tideRadial', label: 'Tide — radial' },
  { id: 'tideCalm', label: 'Tide — calm' },
];

export const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a || 1e-4), 0), 1); return t * t * (3 - 2 * t); };
