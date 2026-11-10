import { resolveMediaRefs } from '../next-proof/release-media.mjs';
import { isHidden } from '../next-proof/hidden-routes.mjs';

// The release navigation in the studio's tree shape, so the Next shell renders the studio Header as is.
export function studioNavigation(release) {
  const slugs = new Map(release.pages.map((page) => [page.id, page.slug]));
  const toItem = (item) => {
    const base = { id: item.id, label: item.label, visible: item.visible, ...(item.subtext ? { subtext: item.subtext } : {}) };
    if (item.children?.length) return { ...base, type: 'group', children: item.children.map(toItem) };
    if (item.target.kind === 'link') return { ...base, type: 'link', href: item.target.href };
    return { ...base, type: 'page', pageSlug: slugs.get(item.target.pageId) };
  };
  return release.site.navigation.map(toItem);
}

// The legal pages sit only in the footer's legal row, as in the studio.
const LEGAL_SLUGS = ['privacy', 'cookies', 'terms'];

// John, 10 Nov: GS Agentic Manager is a page in code (app/gs-agentic-manager), not a GSAM page, so the header
// tab (before About) and the footer link come from here. GSAM's stored header carries the same tab.
const CODE_TAB = { id: 'code-gs-agentic-manager', slug: 'gs-agentic-manager', path: '/gs-agentic-manager', title: 'GS Agentic Manager' };

function withCodeTab(navigation) {
  const has = (items) => items.some((item) => item.pageSlug === CODE_TAB.slug || item.href === CODE_TAB.path || has(item.children || []));
  if (has(navigation)) return navigation;
  const tab = { id: CODE_TAB.id, label: CODE_TAB.title, visible: true, type: 'page', pageSlug: CODE_TAB.slug };
  const about = navigation.findIndex((item) => item.label === 'About');
  return about < 0 ? [...navigation, tab] : [...navigation.slice(0, about), tab, ...navigation.slice(about)];
}

// Everything the site chrome needs, as plain data for the client shell.
export function siteChrome(release) {
  // A hidden page (Case Studies) only redirects, so it leaves the header, footer and search as well.
  const pages = release.pages.filter((page) => !isHidden(page.path));
  const shown = pages.some((page) => page.path === CODE_TAB.path) ? pages : [...pages, CODE_TAB];
  return {
    order: shown.map((page) => page.slug),
    pages: Object.fromEntries(shown.map((page) => [page.slug, { title: page.title, status: 'published', ...(LEGAL_SLUGS.includes(page.slug) ? { footerOnly: true } : {}) }])),
    paths: Object.fromEntries(shown.map((page) => [page.slug, page.path])),
    navigation: withCodeTab(studioNavigation(release)),
    settings: { ...release.site.settings, logo: resolveMediaRefs(release.site.settings.logo, release.media) },
  };
}
