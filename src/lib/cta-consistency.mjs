// Conversion map (cycle 22) — a CONVERSION lens no prior cycle covers. Pure, read-only, STORE-FREE
// (imports only the JSX-free link-resolver + link-audit, so bare node --test loads it; no store.js, no
// Date.now). It answers what cycle-1 Link health structurally cannot: across the whole site, which DIFFERENT
// call-to-action LABELS point at the SAME destination (a brand/UX smell + casing dupes), which CTAs have a
// real href but a BLANK label (so the button is silently HIDDEN — the inverse of c1's dead CTA), each page's
// conversion map, and dead-end pages (a published page with no outbound CTA). c1 reads a label only to
// attach it to an issue; it never compares labels — so this is net-new, not a re-walk.
import { resolveLink } from './link-resolver.mjs';
import { linkPageSlug, resolveRedirect } from './link-audit.mjs';

// The three labelled-button pairs across the block set (matches link-audit's LABEL_PAIRS, incl. the
// ctaHref2 pair c1 doesn't label-walk). Kept here so a new labelled CTA prop is added in one place.
export const CTA_PAIRS = [
  ['ctaLabel', 'ctaHref'],
  ['ctaLabel2', 'ctaHref2'],
  ['cardCtaLabel', 'cardCtaHref'],
];

// Resolve a raw href to a canonical destination bucket key. Page links collapse through redirects so a
// renamed page + its live target share ONE bucket (else a rename would split a label set + hide an
// inconsistency). Empty / '#' → '' (not a destination). Reuses link-audit + link-resolver, no reinvention.
function canonicalDest(state, raw) {
  const slug = linkPageSlug(raw);
  if (slug !== null) {                                 // it IS a page link
    if (!slug) return '';                              //   empty page pick → not a destination
    const live = resolveRedirect(state, slug) || slug; //   collapse alias → live slug
    return '#go/' + live;
  }
  const href = (resolveLink(raw) || {}).href;          // '#book' / mailto / '#breakdown' / https / anchor
  return (!href || href === '#') ? '' : href;
}

export function buildCtaReport(state, opts) {
  const dynamic = new Set((opts && opts.dynamic) || []);
  const order = (state && state.order) || [];
  const pages = (state && state.pages) || {};
  const destinations = {}; // dest → { labels:{label:count}, pages:Set, pageLabels:[{slug,label}] }
  const emptyLabel = [];
  const perPage = {};
  const deadEnds = [];
  const bucket = (dest) => (destinations[dest] || (destinations[dest] = { labels: {}, pages: new Set(), pageLabels: [] }));

  for (const slug of order) {
    if (dynamic.has(slug)) continue;                   // insights renders the live hub, not its blocks
    const page = pages[slug];
    if (!page || !page.data) continue;
    const content = page.data.content || [];
    perPage[slug] = [];
    for (const block of content) {
      const props = (block && block.props) || {};
      const blockType = (block && block.type) || 'Block';
      const blockId = props.id || '';
      for (const [labelKey, hrefKey] of CTA_PAIRS) {
        if (!(hrefKey in props)) continue;
        const dest = canonicalDest(state, props[hrefKey]);
        if (!dest) continue;                           // no real destination → not a CTA at all
        const label = typeof props[labelKey] === 'string' ? props[labelKey].trim() : '';
        if (label) {
          perPage[slug].push({ blockType, blockId, labelKey, label, dest });
          const b = bucket(dest);
          b.labels[label] = (b.labels[label] || 0) + 1;
          b.pages.add(slug);
          b.pageLabels.push({ slug, label });
        } else {
          emptyLabel.push({ slug, blockType, blockId, labelKey, hrefKey, dest }); // HIDDEN CTA
        }
      }
    }
    if (page.status === 'published' && perPage[slug].length === 0) deadEnds.push(slug);
  }

  const destOut = {};
  const inconsistent = [];
  const casingDupes = [];
  for (const dest of Object.keys(destinations)) {
    const d = destinations[dest];
    const labelNames = Object.keys(d.labels);
    const distinct = labelNames.length;
    const casingDupe = new Set(labelNames.map((l) => l.toLowerCase())).size < distinct;
    destOut[dest] = { labels: d.labels, pages: [...d.pages], distinct, casingDupe };
    if (distinct > 1) {
      inconsistent.push({ dest, distinct, casingDupe, labels: labelNames.map((l) => ({ label: l, count: d.labels[l] })), pages: d.pageLabels });
    }
    if (casingDupe) {
      const byLower = {};
      for (const l of labelNames) (byLower[l.toLowerCase()] || (byLower[l.toLowerCase()] = [])).push(l);
      const groups = Object.keys(byLower).filter((lo) => byLower[lo].length > 1).map((lo) => ({
        lower: lo,
        variants: byLower[lo].map((l) => ({ label: l, count: d.labels[l], pages: d.pageLabels.filter((pl) => pl.label === l).map((pl) => pl.slug) })),
      }));
      casingDupes.push({ dest, groups });
    }
  }
  inconsistent.sort((a, b) => (b.distinct - a.distinct) || (a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : 0));

  return {
    destinations: destOut, inconsistent, casingDupes, emptyLabel, perPage, deadEnds,
    summary: {
      destinations: Object.keys(destOut).length,
      inconsistentCount: inconsistent.length,
      casingDupeCount: casingDupes.length,
      emptyLabelCount: emptyLabel.length,
      deadEndCount: deadEnds.length,
    },
  };
}
