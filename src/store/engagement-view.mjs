// Pure view-helper for the staff in-client engagement list: the distinct kinds present (drives the type
// filter), the count of unshared drafts (drives the nudge), and the kind-filtered list. No React deps so it
// runs under plain `node --test`. "draft" = not yet visible to the client: not shared AND not archived.

export function engagementView(items, kindFilter = 'all') {
  const list = Array.isArray(items) ? items : [];
  const kinds = [...new Set(list.map(e => e && e.kind).filter(Boolean))];
  const draftCount = list.filter(e => e && e.status !== 'shared' && e.status !== 'archived').length;
  const filtered = kindFilter === 'all' ? list : list.filter(e => e && e.kind === kindFilter);
  return { kinds, draftCount, filtered };
}
