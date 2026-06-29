// Bulk-selection logic for the Releases change-review queue. Pure + STORE-FREE so the ReleaseBoard JSX
// stays dumb and the approve/discard eligibility rules are unit-testable (mirrors lib/bulk-status.mjs for
// PagesPanel). Queue items carry { slug, kind } where kind is 'drift' (live edits to review) or
// 'unpublished' (never published). Both can be APPROVED (published); only 'drift' can be DISCARDED, because
// a never-published page has no live version to revert to (matching App.discardPage's guard).

export const canApprove = (item) => !!item && (item.kind === 'drift' || item.kind === 'unpublished');
export const canDiscard = (item) => !!item && item.kind === 'drift';

// Given the review queue and the selected slugs, split them into the approvable and discardable subsets.
export function reviewBulkActions(queue = [], slugs = []) {
  const bySlug = new Map((queue || []).map((it) => [it.slug, it]));
  const sel = (slugs || []).map((s) => bySlug.get(s)).filter(Boolean); // ignore slugs not in the queue
  const approveSlugs = sel.filter(canApprove).map((it) => it.slug);
  const discardSlugs = sel.filter(canDiscard).map((it) => it.slug);
  return { approvable: approveSlugs.length, discardable: discardSlugs.length, approveSlugs, discardSlugs };
}
