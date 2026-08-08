// Shared inline SVGs (1.7px stroke, round caps — the house icon style). No emoji, ever.
export const Arrow = (p) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Search = (p) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// PANEL MOTIFS
// Ben's homepage brief asks each Principle panel to carry a "simple supporting
// icon or visual motif". The build shipped a lime rule, which is a mark but not
// a per-panel one. These are that motif: a small, restrained line set in the
// house style (1.75 stroke, round caps, currentColor, no fill, no emoji), sized
// to sit quietly above a panel heading rather than decorate it.
//
// Deliberately abstract. They stand for a posture (understanding, evidence,
// purpose, endurance), never for a product, a client or a claim.
// ---------------------------------------------------------------------------
const S = { stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

const PATHS = {
  // understanding before action: a compass, orientation before movement
  compass: <><circle cx="12" cy="12" r="9" {...S} /><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" {...S} /></>,
  // evidence: a rising read, not a promise
  evidence: <><path d="M3 20h18" {...S} /><path d="M6 16l4.5-5 3.5 3.5L20 7" {...S} /><path d="M20 11V7h-4" {...S} /></>,
  // purpose: a defined objective
  target: <><circle cx="12" cy="12" r="9" {...S} /><circle cx="12" cy="12" r="5" {...S} /><circle cx="12" cy="12" r="1.4" {...S} /></>,
  // capability that endures: layers that hold
  layers: <><path d="M12 3l9 4.5-9 4.5-9-4.5z" {...S} /><path d="M3 12.5l9 4.5 9-4.5" {...S} /><path d="M3 17l9 4.5 9-4.5" {...S} /></>,
  // transformation
  transform: <><path d="M4 9a8 8 0 0 1 13.7-5.2L21 7" {...S} /><path d="M21 3v4h-4" {...S} /><path d="M20 15a8 8 0 0 1-13.7 5.2L3 17" {...S} /><path d="M3 21v-4h4" {...S} /></>,
  // organisational capability: structure
  structure: <><path d="M4 21V6l7-3 7 3v15" {...S} /><path d="M2 21h20" {...S} /><path d="M9 21v-5h4v5" {...S} /><path d="M8 9h.01M12 9h.01M8 13h.01M12 13h.01" {...S} /></>,
  // technology applied where it matters
  technology: <><rect x="6" y="6" width="12" height="12" rx="2" {...S} /><rect x="10" y="10" width="4" height="4" {...S} /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" {...S} /></>,
  // thinking, judgement
  judgement: <><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.2 2.2h4.8c.1-.9.5-1.6 1.2-2.2A6 6 0 0 0 12 3z" {...S} /><path d="M10 19h4M11 22h2" {...S} /></>,
  // a briefing, an interpretation
  briefing: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...S} /><path d="M14 3v5h5" {...S} /><path d="M9 13h6M9 17h4" {...S} /></>,
  // people
  people: <><circle cx="9" cy="8" r="3.4" {...S} /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" {...S} /><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6" {...S} /><path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6" {...S} /></>,
  // confidence, protection
  assurance: <><path d="M12 21s7.5-3.8 7.5-9.4V5.4L12 2.6 4.5 5.4v6.2C4.5 17.2 12 21 12 21z" {...S} /><path d="M9 12l2.2 2.2L15.5 10" {...S} /></>,
  // a voice on the end of a line
  phone: <><path d="M21 16.9v2.6a1.9 1.9 0 0 1-2.1 1.9 18.8 18.8 0 0 1-8.2-2.9 18.5 18.5 0 0 1-5.7-5.7A18.8 18.8 0 0 1 2.1 4.6 1.9 1.9 0 0 1 4 2.5h2.6a1.9 1.9 0 0 1 1.9 1.6c.1.9.3 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L7.6 10a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.4 1.8.6 2.7.7a1.9 1.9 0 0 1 1.6 1.9z" {...S} /></>,
  // written correspondence
  mail: <><rect x="2.5" y="5" width="19" height="14" rx="2" {...S} /><path d="M3 7l9 6 9-6" {...S} /></>,
  // over time
  horizon: <><circle cx="12" cy="12" r="9" {...S} /><path d="M12 7v5l3.2 2" {...S} /></>,
};

export const ICON_NAMES = Object.keys(PATHS);

// `name` is editor-chosen. An unknown or empty name renders nothing rather than a
// fallback glyph, so a mistyped value never puts a meaningless mark on the page.
export const PanelIcon = ({ name, size = 26, ...p }) => {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...p}>{d}</svg>
  );
};
