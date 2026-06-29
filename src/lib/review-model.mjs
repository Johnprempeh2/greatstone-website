// Change-review queue (Releases): a pure, read-only classification of every page's publish state so a lead
// can see what's been edited — including pages never made public — and approve (publish) or reject (revert)
// each. STORE-FREE except for diffVersions (itself pure + JSX-free), so bare node --test loads it.
//   kind 'drift'       — published, but the draft differs from what's live (unpublished EDITS). carries a diff.
//   kind 'unpublished' — never published (or no live projection): the whole page is pending a first go-live.
//   kind 'live'        — published and identical to live: nothing to review.
import { diffVersions } from './version-diff.mjs';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// the last real publish event — matched by the dedicated 'Published' label, not status (restore/discard
// snapshots copy the page's status, so a newer non-publish snapshot must not masquerade as "last published").
function lastPublished(page) {
  const v = (page.versions || []).find((x) => x.label === 'Published');
  return v ? { ts: v.ts, by: v.by } : null;
}

export function buildReviewQueue(state) {
  const order = (state && state.order) || [];
  const pages = (state && state.pages) || {};
  const items = [];
  for (const slug of order) {
    const p = pages[slug];
    if (!p) continue;
    const isPublished = p.published != null;
    const drift = isPublished && !eq(p.data, p.published);
    const kind = !isPublished ? 'unpublished' : drift ? 'drift' : 'live';
    const diff = drift ? diffVersions(p.published, p.data) : null; // what changed since the last publish
    const blocks = (p.data && p.data.content && p.data.content.length) || 0;
    items.push({ slug, title: p.title, status: p.status, kind, drift, everPublished: isPublished, blocks, diff, lastPub: lastPublished(p) });
  }
  // attention order: drift (live edits to review) first, then never-published, then the rest.
  const rank = (i) => (i.kind === 'drift' ? 2 : i.kind === 'unpublished' ? 1 : 0);
  const review = items.filter((i) => i.kind !== 'live').sort((a, b) => rank(b) - rank(a));
  return {
    items, review,
    counts: {
      drift: items.filter((i) => i.kind === 'drift').length,
      unpublished: items.filter((i) => i.kind === 'unpublished').length,
      live: items.filter((i) => i.kind === 'live').length,
      pending: review.length,
    },
  };
}
