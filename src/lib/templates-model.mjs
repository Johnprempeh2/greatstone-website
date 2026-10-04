// Page Starters: a STATIC, curated set of named page RECIPES — structure + sequencing + minimal
// placeholder copy — seeded into a brand-new DRAFT in one action. Non-redundant vs Saved sections
// (inserts ONE block) and duplicatePage (clones a LIVE page, needs an exemplar + carries its real copy):
// a starter exists with ZERO exemplar. Pure + STORE-FREE: every block is a {type, props} referencing a
// REAL registered puck.config type; blk() in store.js backfills each component's defaultProps, so a
// starter pre-fills only the 1-2 props that make placeholder copy read sensibly. The id factory is
// INJECTED (App passes store.rid; tests pass a deterministic counter) — same discipline as buildInsertBlock.
import { remapIds } from './sections-model.mjs';
import { PRIMARY_CTA_LABEL, PRIMARY_CTA_HREF } from './brand.mjs';

export const STARTERS = Object.freeze([
  Object.freeze({
    id: 'blank', label: 'Blank page',
    blurb: 'One Hero — start from nothing and compose.',
    blocks: Object.freeze([
      { type: 'Hero', props: { kicker: 'New page', body: 'Start composing. Drag blocks in from the editor, set the background, then publish.', ctaHref: '#book' } },
    ]),
  }),
  Object.freeze({
    id: 'landing', label: 'Landing page',
    blurb: 'Hero → proof → features → steps → testimonial → closing CTA.',
    blocks: Object.freeze([
      { type: 'Hero', props: { kicker: 'Landing', ctaLabel: PRIMARY_CTA_LABEL, ctaHref: PRIMARY_CTA_HREF } },
      { type: 'StatStrip', props: {} },
      { type: 'FeatureGrid', props: {} },
      { type: 'Steps', props: {} },
      { type: 'Quote', props: {} },
      { type: 'Invite', props: {} },
    ]),
  }),
  Object.freeze({
    id: 'article', label: 'Article',
    blurb: 'Hero → body → figure → FAQ → closing CTA.',
    blocks: Object.freeze([
      { type: 'Hero', props: { kicker: 'Insight' } },
      { type: 'Chapter', props: {} },
      { type: 'Figure', props: {} },
      { type: 'Faq', props: {} },
      { type: 'Invite', props: {} },
    ]),
  }),
  Object.freeze({
    id: 'service', label: 'Service page',
    blurb: 'Hero → narrative → services → proof → FAQ → contact.',
    blocks: Object.freeze([
      { type: 'Hero', props: { kicker: 'Service' } },
      { type: 'Chapter', props: {} },
      { type: 'ServiceCards', props: {} },
      { type: 'StatStrip', props: {} },
      { type: 'Faq', props: {} },
      { type: 'ContactBand', props: {} },
    ]),
  }),
  Object.freeze({
    id: 'proof', label: 'Proof / case studies',
    blurb: 'Hero → stats → case studies → logos → testimonial → booking.',
    blocks: Object.freeze([
      { type: 'Hero', props: { kicker: 'Proof' } },
      { type: 'StatStrip', props: {} },
      { type: 'CaseStudy', props: {} },
      { type: 'LogoWall', props: {} },
      { type: 'Quote', props: {} },
      { type: 'BookDeepDive', props: {} },
    ]),
  }),
]);

export function listStarters() { return STARTERS; }

export function getStarter(id) { return STARTERS.find((s) => s.id === id) || null; }

// fresh-id {type,props}[] for a new page's content. remapIds per block (same discipline as buildInsertBlock)
// deep-clones each block + re-mints its props.id (and any nested item id) via the injected mintId; the store
// then runs each through blk() to backfill component defaultProps. Never mutates the frozen STARTERS source.
export function buildStarterContent(starter, mintId) {
  if (!starter || !Array.isArray(starter.blocks)) return [];
  return starter.blocks.map((b) => remapIds({ type: b.type, props: b.props || {} }, mintId));
}
