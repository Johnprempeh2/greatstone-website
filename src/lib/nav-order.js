// The public navigation surface, shared by the Header, the Footer AND the ⌘K command palette so the
// three navigation affordances can never drift. Editors see every page; the public sees only published
// pages (a never-published draft stays hidden), and the home page (order[0]) is always kept.
// Drift here is exactly what leaked draft pages into the palette once it became the site's search.
export function publicNavOrder(order, pages, canEdit) {
  const base = canEdit ? (order || []) : (order || []).filter((s, i) => i === 0 || (pages[s] && (pages[s].status === 'published' || pages[s].published)));
  // legal/utility pages (Terms, Privacy, …) live ONLY in the footer's legal row, never the primary nav,
  // the footer's main links or the ⌘K palette. Home (order[0]) is never footerOnly, so this can't hide it.
  return base.filter((s) => !(pages[s] && pages[s].footerOnly));
}

// The footer's small legal row: footerOnly pages in declared order. Editors see them even as drafts (so they
// are reachable to edit); the public sees one only once its STATUS is 'published', so placeholder wording
// never shows. Gate on status, never the `published` snapshot (a seeded draft can carry a snapshot object).
export function footerLegalOrder(order, pages, canEdit) {
  return (order || []).filter((s) => pages[s] && pages[s].footerOnly && (canEdit || pages[s].status === 'published'));
}
