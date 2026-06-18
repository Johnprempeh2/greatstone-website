// The public navigation surface, shared by the Header, the Footer AND the ⌘K command palette so the
// three navigation affordances can never drift. Editors see every page; the public sees only published
// pages (a never-published draft stays hidden), and the home page (order[0]) is always kept.
// Drift here is exactly what leaked draft pages into the palette once it became the site's search.
export function publicNavOrder(order, pages, canEdit) {
  if (canEdit) return order;
  return (order || []).filter((s, i) => i === 0 || (pages[s] && (pages[s].status === 'published' || pages[s].published)));
}
