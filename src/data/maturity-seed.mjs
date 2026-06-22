// Digital-maturity model + seeded prototype for the per-client Maturity Radar (#org).
//
// The eight Greatstone pillars are the radar axes; keys/order/numbers mirror PillarCards.jsx (P·01–P·08).
// Scale is 1–10, banded Pebble (1–4) / Plateau (5–7) / Peak (8–10) — the same posture language as the
// homepage MaturityMap. This module is the prototype data layer: it maps 1:1 onto the future
// `maturity_assessments` Supabase table (migration 0019, DORMANT). Until that table is applied the radar
// reads it, finds nothing, and falls back to DEMO_ASSESSMENT for the demo company ONLY (Ethical Quest),
// so the feature is visible now; every other company sees a tasteful empty state. Nothing here is shown
// to a real company as if it were their own scored data.

export const PILLARS = [
  { key: 'people',        n: 'P·01', name: 'People',        tag: 'Know who moves what.' },
  { key: 'communication', n: 'P·02', name: 'Communication', tag: 'Make the value land.' },
  { key: 'innovation',    n: 'P·03', name: 'Innovation',    tag: 'Innovate on purpose.' },
  { key: 'data',          n: 'P·04', name: 'Data',          tag: 'Map the lifecycle.' },
  { key: 'customer',      n: 'P·05', name: 'Customer',      tag: 'Know who you serve.' },
  { key: 'competition',   n: 'P·06', name: 'Competition',   tag: 'Set the pace.' },
  { key: 'technology',    n: 'P·07', name: 'Technology',    tag: 'Pressure-test the stack.' },
  { key: 'value',         n: 'P·08', name: 'Value',         tag: 'Align value both ways.' },
];

export const SCALE_MAX = 10;

// posture bands mirror the homepage MaturityMap (Pebble / Plateau / Peak)
export const TIERS = [
  { key: 'pebble',  label: 'Pebble',  range: [1, 4],  blurb: 'Foundations: ad hoc, manual, undocumented.' },
  { key: 'plateau', label: 'Plateau', range: [5, 7],  blurb: 'Climbing: repeatable in parts, gaps remain.' },
  { key: 'peak',    label: 'Peak',    range: [8, 10], blurb: 'Pioneering: measured, resilient, ahead of the field.' },
];

export function tierOf(score) {
  const s = Number(score) || 0;
  if (s >= 8) return 'peak';
  if (s >= 5) return 'plateau';
  return 'pebble';
}
export const tierLabel = (key) => (TIERS.find((t) => t.key === key) || {}).label || '—';

// mean of the present (>0) pillar scores, to one decimal place
export function overallOf(scores) {
  if (!scores) return 0;
  const vals = PILLARS.map((p) => Number(scores[p.key]) || 0).filter((v) => v > 0);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

// The demo company is Ethical Quest (slug ethical-quest, domain ethicalquest.com) under the single live
// org. The customer id is a generated UUID, so gate on the stable domain/name instead of a hardcoded id.
export const isDemoCompany = (company) =>
  !!company && (/(^|\.)ethicalquest\.com$/i.test(company.domain || '') || /ethical\s*quest/i.test(company.name || ''));

// A realistic baseline for Ethical Quest: out of Pebble, into Plateau, with Data and Technology still
// trailing the field (their known drains) and a clear Peak target. Illustrative sample — demo company only.
export const DEMO_ASSESSMENT = {
  assessed_on: '2026-06-15',
  tier: 'plateau',
  scores:    { people: 6, communication: 5, innovation: 5, data: 4, customer: 6, competition: 5, technology: 5, value: 6 },
  benchmark: { people: 6, communication: 6, innovation: 5, data: 6, customer: 6, competition: 6, technology: 7, value: 6 },
  target:    { people: 8, communication: 8, innovation: 8, data: 9, customer: 8, competition: 8, technology: 9, value: 8 },
  baseline:  { people: 4, communication: 3, innovation: 3, data: 2, customer: 4, competition: 4, technology: 3, value: 4 },
  notes: 'Discovery baseline. Plateau overall; Data and Technology are the priority climbs.',
  sample: true,
};
