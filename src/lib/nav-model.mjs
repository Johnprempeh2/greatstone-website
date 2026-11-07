// The header's navigation model, shared by the studio Header (src/Header.jsx) and the schema 2 chrome
// export (next-proof/html-chrome.mjs, GRE-3862), so the exported header holds the same menus.

// The persistent primary CTA ("Begin the Conversation") lands the visitor on the booking page.
export const BOOK_PAGE = 'contact';

// Resolve one CMS navigation item into a render model node, or null to drop it. A page item is dropped
// for the public when its page is unpublished or missing; an editor sees all. label blank on a page item
// falls back to the page's own title. Groups resolve their children the same way and drop if empty.
function resolveNavItem(item, pages, canEdit) {
  if (!item || item.visible === false) return null;
  if (item.type === 'group') {
    const members = (item.children || []).map((c) => resolveNavItem(c, pages, canEdit)).filter(Boolean);
    if (!members.length) return null;
    return { kind: 'group', label: item.label || 'More', members };
  }
  if (item.type === 'link') {
    if (!item.href) return null;
    return { kind: 'url', href: item.href, label: item.label || item.href, subtext: item.subtext, newTab: !!item.newTab };
  }
  // default: a page link
  const slug = item.pageSlug;
  const p = slug && pages[slug];
  if (!p) return null;
  if (!canEdit && !(p.status === 'published' || p.published)) return null;
  return { kind: 'page', slug, label: item.label || p.title || slug, subtext: item.subtext };
}

// Build the header nav render model from the CMS navigation tree. Falls back to a flat list of pages
// (in page order) if the tree is empty, so the bar is never blank. When searching (q) we flatten the
// groups and filter by label so every match surfaces. `shop` (the storefront entry) joins the DX Dev
// Tools page as a group, so the storefront sits under it.
export function buildNavModel(navigation, order, pages, canEdit, q, shop = null) {
  let nav = navigation;
  // footerOnly pages (Terms, Privacy, …) belong in the footer's legal row, never the header — so the
  // order-fallback (used when no nav tree is configured) skips them just as the configured tree omits them.
  if (!Array.isArray(nav) || !nav.length) nav = (order || []).filter((slug) => !(pages[slug] && pages[slug].footerOnly)).map((slug) => ({ type: 'page', pageSlug: slug }));
  let items = nav.map((i) => resolveNavItem(i, pages, canEdit)).filter(Boolean);
  if (q) {
    const flat = [];
    items.forEach((it) => { if (it.kind === 'group') flat.push(...it.members); else flat.push(it); });
    items = flat.filter((it) => (it.label || '').toLowerCase().includes(q));
  }
  return shop ? items.map((item) => (item.kind === 'page' && item.slug === 'dev-tools' ? { kind: 'group', label: item.label, members: [item, shop] } : item)) : items;
}

// The inline bar's items in priority order (the configured nav); the end of the list is the first to move
// into "More" when the row is narrow. The booking page's nav entry also sits in "More": the lime CTA beside
// the bar already goes there, and two copies of the same action side by side compete (GRE-659 review).
// The phone menu keeps the full tree.
export function headerLeaves(navModel) {
  const isBookLeaf = (it) => it.kind === 'page' && it.slug === BOOK_PAGE;
  const baseLeaves = navModel.filter((it) => !isBookLeaf(it));
  const pins = navModel.filter(isBookLeaf);
  const hasNamedMore = baseLeaves.some((it) => it.kind === 'group' && it.label === 'More');
  const leaves = hasNamedMore ? baseLeaves.map((it) => (it.kind === 'group' && it.label === 'More' ? { ...it, members: [...it.members, ...pins] } : it)) : baseLeaves;
  return { leaves, pinnedMore: hasNamedMore ? [] : pins };
}
