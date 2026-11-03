import { resolveMediaRefs } from '../next-proof/release-media.mjs';

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

// Everything the site chrome needs, as plain data for the client shell.
export function siteChrome(release) {
  return {
    order: release.pages.map((page) => page.slug),
    pages: Object.fromEntries(release.pages.map((page) => [page.slug, { title: page.title, status: 'published', ...(LEGAL_SLUGS.includes(page.slug) ? { footerOnly: true } : {}) }])),
    paths: Object.fromEntries(release.pages.map((page) => [page.slug, page.path])),
    navigation: studioNavigation(release),
    settings: { ...release.site.settings, logo: resolveMediaRefs(release.site.settings.logo, release.media) },
  };
}
