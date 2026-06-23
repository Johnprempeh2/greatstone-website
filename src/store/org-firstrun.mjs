// Pure first-run predicate for the #org dashboard: decides which empty-state a client should see based on
// whether they have any engagements and/or any orders yet. A brand-new org (no engagements, no orders) gets the
// warmest welcome; a client who has purchased but has no DX engagements yet gets a context-aware variant that
// points at their account. No React deps so it runs under `node --test`.

export function firstRunState(opts = {}) {
  const eng = Array.isArray(opts.engagements) ? opts.engagements.filter(Boolean).length : 0;
  const ord = Array.isArray(opts.orders) ? opts.orders.filter(Boolean).length : 0;
  return {
    timelineEmpty: eng === 0,                 // show the aspirational timeline empty-state at all
    isBrandNew: eng === 0 && ord === 0,        // no engagements and nothing bought yet
    hasOrdersNoEngagements: eng === 0 && ord > 0, // bought, but the DX engagement has not started
  };
}
