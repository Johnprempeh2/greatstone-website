// headingsOf(block) — the per-block heading-emission map for the document outline (cycle 21). Pure +
// STORE-FREE: reads block.props ONLY (never imports block JSX), so bare node --test loads it. It returns
// the ORDERED list of headings each block ACTUALLY renders in the DOM — most section blocks emit an h2
// PLUS a per-item h3, several h2s are conditional (skipped when the prop is empty, matching the JSX guard),
// and a few are special (hardcoded sr-only h2, className="h3" on an <h2> ELEMENT, per-post h3 with no h2).
// Every entry is grounded in the real src/blocks/*.jsx (verified file:line in the cycle-21 workflow) and
// cross-checked against the live DOM. `level` is the ELEMENT level (NOT the className).
import { headingText } from './a11y-check.mjs'; // reuse the grounded Hero/H1 text logic (single source of truth)
import { headingLevelNum } from './heading-level.mjs'; // blocks with an editor-set heading level report it here too

const join = (...xs) => xs.filter(Boolean).map(String).join(' ').trim();
const arr = (x) => (Array.isArray(x) ? x : []);

const HEADINGS = {
  // --- H1 (grounded: only these two render <h1>) ---
  Hero:        (p) => [{ level: 1, text: headingText({ type: 'Hero', props: p }) }],
  TimeCounter: (p) => [{ level: 1, text: join(p.headline, p.highlight) }],

  // --- always-rendered H2 (no guard in JSX) ---
  Chapter:   (p) => [{ level: headingLevelNum(p.headingLevel), text: join(p.headline, p.highlight) }], // editor-set H2/H3/H4
  Invite:    (p) => [{ level: 2, text: join(p.headline, p.highlight) }],
  Terrace:   (p) => [{ level: 2, text: join(p.headline, p.highlight) }],
  IntelBand: (p) => [{ level: 2, text: join(p.heading, p.highlight) }],
  RoiBar:    (p) => [{ level: 2, text: join(p.headline, p.highlight) }], // <h2 className="h3">

  // --- conditional H2-only (skipped when empty, matching the JSX guard) ---
  StatStrip:        (p) => (p.headline || p.highlight) ? [{ level: 2, text: join(p.headline, p.highlight) }] : [],
  Spectrum:         (p) => (p.headline || p.highlight) ? [{ level: 2, text: join(p.headline, p.highlight) }] : [],
  ComparisonMatrix: (p) => (p.heading || p.highlight) ? [{ level: 2, text: join(p.heading, p.highlight) }] : [],
  NewsletterBand:   (p) => (p.heading || p.highlight) ? [{ level: 2, text: join(p.heading, p.highlight) }] : [],
  MethodTieIn:      (p) => (p.heading || p.highlight) ? [{ level: 2, text: join(p.heading, p.highlight) }] : [],
  Team:             (p) => p.heading ? [{ level: 2, text: String(p.heading) }] : [],
  PillarCards:      (p) => p.heading ? [{ level: 2, text: String(p.heading) }] : [], // pillar names are <div>, NOT h3
  TimeSavingsCalculator: (p) => p.heading ? [{ level: 2, text: String(p.heading) }] : [],
  FeaturedArticle:  (p) => p.title ? [{ level: 2, text: String(p.title) }] : [], // <h2 className="h3">

  // --- H2 (always) + per-item H3 ---
  Pillars:  (p) => [{ level: 2, text: join(p.headline, p.highlight) }, ...arr(p.items).map((it) => ({ level: 3, text: String(it.title || '') }))],
  Timeline: (p) => [{ level: 2, text: join(p.headline, p.highlight) }, ...arr(p.items).map((it) => ({ level: 3, text: String(it.head || '') }))],

  // --- conditional H2 + per-item H3 ---
  FeatureGrid:  (p) => [...(p.heading ? [{ level: 2, text: String(p.heading) }] : []), ...arr(p.items).map((it) => ({ level: 3, text: String(it.title || '') }))],
  Faq:          (p) => [...(p.heading ? [{ level: 2, text: String(p.heading) }] : []), ...arr(p.items).map((it) => ({ level: 3, text: String(it.q || '') }))],
  Values:       (p) => [...(p.heading ? [{ level: 2, text: String(p.heading) }] : []), ...arr(p.items).map((it) => ({ level: 3, text: String(it.title || '') }))],
  ServiceCards: (p) => [...((p.heading || p.highlight) ? [{ level: 2, text: join(p.heading, p.highlight) }] : []), ...arr(p.cards).filter((c) => c.title).map((c) => ({ level: 3, text: String(c.title) }))],
  CaseStudy:    (p) => [...((p.headline || p.highlight) ? [{ level: 2, text: join(p.headline, p.highlight) }] : []), ...arr(p.items).map((c) => ({ level: 3, text: String(c.head || '') }))],
  Steps:        (p) => [...((p.headline || p.highlight) ? [{ level: 2, text: join(p.headline, p.highlight) }] : []), ...arr(p.items).map((it) => ({ level: 3, text: String(it.title || '') }))],
  Ladder:       (p) => [...((p.headline || p.highlight) ? [{ level: 2, text: join(p.headline, p.highlight) }] : []), ...arr(p.items).map((it) => ({ level: 3, text: String(it.name || '') }))],
  ServiceCatalog: (p) => [...((p.heading || p.highlight) ? [{ level: 2, text: join(p.heading, p.highlight) }] : []), ...arr(p.services).map((s) => ({ level: 3, text: String(s.name || '') }))],

  // --- two arrays into H3 (tiers then phases, matching DOM order) ---
  MaturityModel: (p) => [...(p.heading ? [{ level: 2, text: String(p.heading) }] : []), ...arr(p.tiers).map((t) => ({ level: 3, text: String(t.label || '') })), ...arr(p.phases).map((t) => ({ level: 3, text: String(t.label || '') }))],

  // --- per-post H3, NO own H2 ---
  InsightsGrid: (p) => arr(p.posts).filter((x) => x.title).map((x) => ({ level: 3, text: String(x.title) })),
  Columns:      (p) => arr(p.columns).filter((c) => c.heading).map((c) => ({ level: 3, text: String(c.heading) })), // per-column sub-headings



  // --- special cases ---
  MaturityMap:    (p) => [{ level: 2, text: 'Digital maturity tiers' }, ...arr(p.tiers).map((t) => ({ level: 3, text: String(t.title || '') }))], // hardcoded sr-only h2
  IndustryPicker: (p) => { const cur = arr(p.industries)[0] || {}; return [{ level: 2, text: String(cur.headline || '') }, { level: 3, text: String(p.universalTitle || '') }, { level: 3, text: String(cur.specificTitle || '') }]; },
  PillarExplorer: (p) => { const a = arr(p.items)[0] || {}; return [...((p.headline || p.highlight) ? [{ level: 2, text: join(p.headline, p.highlight) }] : []), { level: 3, text: String(a.title || '') }]; },
  ContactBand:    (p) => [...(p.heading ? [{ level: 2, text: String(p.heading) }] : []), ...(p.cardHeading ? [{ level: 3, text: String(p.cardHeading) }] : [])],
  BookDeepDive:   (p) => [{ level: 2, text: join(p.headline, p.highlight) }, ...(p.asideHeading ? [{ level: 3, text: String(p.asideHeading) }] : [])], // sent-state h3 NOT emitted on load
  Storefront:     (p) => p.heading ? [{ level: 2, text: String(p.heading) }] : [], // per-category/product h3/h4 are catalog-store-driven, out of scope

  // Quote, Figure, LogoWall, emphasis/icon blocks, MethodExplorer (a closed dialog) → no entry → []
};

export function headingsOf(block) {
  const fn = block && HEADINGS[block.type];
  return fn ? fn(block.props || {}) : [];
}
