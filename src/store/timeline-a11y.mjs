// Pure a11y helpers for the #org engagement timeline. (1) attendeeOverflow: split the attendee list into the
// shown avatars and the hidden remainder so 6+ attendees surface a "+N" chip instead of silently truncating.
// (2) filterAnnouncement: the polite live-region message when the customer's kind/phase/tag/search filter changes
// the visible count, so screen-reader users hear the filter take effect. No React deps → runs under `node --test`.

export function attendeeOverflow(attendees, cap = 5) {
  const list = (Array.isArray(attendees) ? attendees : []).filter(a => a != null && String(a).trim() !== '');
  return { shown: list.slice(0, cap), hiddenCount: Math.max(0, list.length - cap), hiddenNames: list.slice(cap) };
}

export function filterAnnouncement(opts = {}) {
  if (!opts.filtering) return ''; // nothing to announce when no filter is active
  const v = Math.max(0, Number(opts.visible) || 0);
  const t = Math.max(0, Number(opts.total) || 0);
  if (v === 0) return 'No engagements match your filters.';
  if (v >= t) return `Showing all ${t} engagement${t === 1 ? '' : 's'}.`;
  return `Showing ${v} of ${t} engagements.`;
}
