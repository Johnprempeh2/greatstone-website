import { resolveRedirect, linkPageSlug } from './link-audit.mjs';
import { hasLink } from './link-resolver.mjs';

// Greatstone "Navigation health" — a pure, read-only audit of the HEADER NAVIGATION's own completeness,
// the gap Link health leaves open. Link health (link-audit.mjs) walks link TARGETS and asks "does each
// link resolve, and is each page reached?"; it deliberately treats any existing page as a valid nav
// target (classifyPageSlug:46-50 is publish-status-blind) and never inspects the freeform href on custom
// (type:'link') items. This module asks the complementary question: "is the menu pointing only at pages
// visitors can actually see, and does every live page have a home in the menu?". It finds:
//   navToDraft     (error)   — a visible menu item points at a page that isn't published, so the public
//                              header silently drops it (Header.jsx:41) — the editor's menu edit never
//                              reaches visitors. NOT caught by Link health (any existing page reads 'ok').
//   deadCustomLink (error)   — a visible custom (type:'link') item whose href goes nowhere (empty/#) or
//                              whose #go/<slug> target no longer exists. Link health never inspects href.
//   emptyGroup     (warning) — a dropdown with no children, or whose children are all hidden — a dead menu.
//   missingFromNav (warning) — a published page that appears in NO menu item (advisory; a page may be
//                              intentionally reachable only by in-content link). The inverse of orphan.
// Broken/recoverable nav pageSlugs (deleted/renamed targets) stay owned by Link health — not re-reported
// here. Pure: reads pages/order/navigation/redirects only; no mutation, no network; node --test-able.

// header chrome / delisted pages that intentionally live outside the editable nav (store.js:45-46) —
// never flagged "missing from nav". 'products' isn't in state.order, so it's belt-and-braces.
const OUT_OF_NAV = ['contact', 'products'];
const NAV_GROUP = '(navigation)';

const isVisible = (item) => item.visible !== false;
// a page is publicly live when the header would keep its nav item (mirrors Header.jsx:41) — published, or
// re-drafted but still serving a previously-published snapshot. A never-published draft has published==null.
const isPublic = (page) => !!(page && (page.status === 'published' || page.published != null));

export function auditNavCoverage(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || [];
  const navigation = (state && state.navigation) || [];

  const issues = [];
  const inNav = new Set(); // slugs referenced by any nav page item (visible or hidden)

  const walk = (items) => {
    (items || []).forEach((item) => {
      if (!item) return;
      if (item.type === 'page') {
        const slug = String(item.pageSlug || '');
        if (slug) inNav.add(slug);
        if (slug && isVisible(item)) {
          const page = pages[slug];
          // deleted/renamed targets (no page object) are Link health's job — only flag exists-but-not-public.
          if (page && !isPublic(page)) {
            issues.push({
              key: slug, kind: 'navToDraft', severity: 'error',
              label: 'Menu links to an unpublished page',
              detail: '“' + (page.title || slug) + '” isn’t published, so the public menu drops this item and visitors never see it. Publish the page, or remove it from the menu.',
              fixSection: 'navigation',
            });
          }
        }
      } else if (item.type === 'link' && isVisible(item)) {
        const href = item.href;
        const goSlug = linkPageSlug(href); // parses a #go/<slug> target; null for paths/urls/anchors/empty
        if (goSlug !== null) {
          const live = goSlug && resolveRedirect(state, goSlug);
          if (live) inNav.add(live); // a page linked via a custom #go item still has a home in the menu
          else if (goSlug) {
            issues.push({
              key: NAV_GROUP, kind: 'deadCustomLink', severity: 'error',
              label: 'Custom menu link points at a missing page',
              detail: '“' + (item.label || href) + '” links to a page that no longer exists.',
              fixSection: 'navigation',
            });
          }
        } else if (!hasLink(href)) {
          issues.push({
            key: NAV_GROUP, kind: 'deadCustomLink', severity: 'error',
            label: 'Custom menu link has no destination',
            detail: (item.label ? '“' + item.label + '”' : 'A custom link') + ' in the menu has no URL set, so it goes nowhere.',
            fixSection: 'navigation',
          });
        }
      } else if (item.type === 'group') {
        const kids = Array.isArray(item.children) ? item.children : [];
        if (!kids.length || !kids.some((c) => c && isVisible(c))) {
          issues.push({
            key: NAV_GROUP, kind: 'emptyGroup', severity: 'warn',
            label: 'Dropdown has nothing to show',
            detail: '“' + (item.label || 'A dropdown') + '” has no visible items, so it opens to an empty menu.',
            fixSection: 'navigation',
          });
        }
      }
      if (Array.isArray(item.children)) walk(item.children);
    });
  };
  walk(navigation);

  // advisory: a published page in no menu item at all (only meaningful once a nav tree exists — an empty
  // nav makes the header fall back to page order, so nothing is "missing").
  if (navigation.length) {
    order.forEach((slug) => {
      const page = pages[slug];
      if (page && isPublic(page) && !OUT_OF_NAV.includes(slug) && !inNav.has(slug)) {
        issues.push({
          key: slug, kind: 'missingFromNav', severity: 'warn',
          label: 'Published page is not in the menu',
          detail: '“' + (page.title || slug) + '” is live but isn’t in any menu, so visitors can only reach it through in-content links.',
          fixSection: 'navigation',
        });
      }
    });
  }

  // group by the page the issue concerns, or the synthetic navigation group for menu-shape issues.
  const titleFor = (key) => (key === NAV_GROUP ? 'Navigation menu' : ((pages[key] && pages[key].title) || key));
  const byKey = new Map();
  issues.forEach((i) => { if (!byKey.has(i.key)) byKey.set(i.key, []); byKey.get(i.key).push(i); });
  const groups = [...byKey.entries()].map(([key, list]) => {
    list.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
    return { pageSlug: key, title: titleFor(key), count: list.length, issues: list };
  });
  groups.sort((a, b) => b.count - a.count);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warn').length;
  return { total: issues.length, errors, warnings, groups };
}
