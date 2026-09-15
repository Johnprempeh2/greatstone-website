// One small icon set for the Deep Dive Portal.
//
// Inline SVG rather than a font or a package: the strict CSP on published pages blocks external
// assets, and an icon that silently fails to load is worse than no icon. Every glyph is stroke-only
// on currentColor so it inherits whatever the surrounding text is doing, including the theme.
//
// Icons here LABEL rather than decorate. Each one sits beside its own word, and carries
// aria-hidden, because an icon that has to be guessed at is a puzzle, not a help.
import React from 'react';

const S = ({ children, size = 16, className = '' }) => (
  <svg className={`dd-i ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{children}</svg>
);

export const Icon = {
  // item kinds
  process:  (p) => <S {...p}><path d="M4 7h11M4 12h16M4 17h8" /><circle cx="19" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></S>,
  question: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M9.2 9a2.8 2.8 0 1 1 3.4 2.8v1.4" /><path d="M12 17h.01" /></S>,
  evidence: (p) => <S {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></S>,
  session:  (p) => <S {...p}><path d="M17 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9.5" cy="7" r="3.5" /><path d="M19 8v6M22 11h-6" /></S>,
  source:   (p) => <S {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></S>,
  kpi:      (p) => <S {...p}><path d="M3 20h18" /><path d="M6 20v-6M11 20V8M16 20v-9M21 20V5" /></S>,
  // states and actions
  validated:(p) => <S {...p}><path d="M20 6 9 17l-5-5" /></S>,
  proposed: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2.5" /></S>,
  blocked:  (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5M12 16h.01" /></S>,
  history:  (p) => <S {...p}><path d="M3 3v6h6" /><path d="M3.5 13a9 9 0 1 0 2.3-6.5L3 9" /><path d="M12 8v4.5l3 1.8" /></S>,
  link:     (p) => <S {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3A5 5 0 0 0 13.5 3.5L12 5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3A5 5 0 0 0 10.5 20.5L12 19" /></S>,
  compare:  (p) => <S {...p}><path d="M12 3v18" /><path d="M6 8 3 13h6zM18 8l-3 5h6z" /><path d="M3 13a3 3 0 0 0 6 0M15 13a3 3 0 0 0 6 0" /><path d="M7 5h10" /></S>,
  add:      (p) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  time:     (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>,
  target:   (p) => <S {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></S>,
  up:       (p) => <S {...p}><path d="M3 17 10 10l4 4 7-7" /><path d="M14 6h7v7" /></S>,
  down:     (p) => <S {...p}><path d="M3 7 10 14l4-4 7 7" /><path d="M14 18h7v-7" /></S>,
  // the flow board
  arrow:    (p) => <S {...p}><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></S>,
  // ⚠ ADDED FOR THE TAB BAR. Organisation and Competitors had no glyph of their own, and an icon
  // borrowed from a neighbouring meaning is worse than none: it is read, and it is read wrong.
  people:   (p) => <S {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.4 19c.7-3 2.8-4.5 5.6-4.5s4.9 1.5 5.6 4.5" /><path d="M16.4 6.4a3.2 3.2 0 0 1 0 6.2M19 19c-.3-1.6-1-2.9-2-3.8" /></S>,
  market:   (p) => <S {...p}><path d="M3 20h18" /><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15.5 7H20v4.5" /></S>,
  edit:     (p) => <S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></S>,
  warn:     (p) => <S {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></S>,
};

/** An icon and its word, together. The icon never carries the meaning on its own. */
export const Labelled = ({ icon, children, size = 15 }) => {
  const I = Icon[icon];
  return <span className="dd-lbl">{I ? <I size={size} /> : null}<span>{children}</span></span>;
};
