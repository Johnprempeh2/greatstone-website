import release from '../next-proof/data/release.json';

export const site = release.site;
export const theme = release.theme;
export const releaseNumber = release.release.number;
export function pageFor(slug) {
  const page = release.pages.find((item) => item.slug === slug);
  return page && { ...page, orgId: release.orgId };
}
export function navigation() {
  const paths = new Map(release.pages.map((page) => [page.id, page.path]));
  return site.navigation.filter((item) => item.visible).map((item) => ({
    ...item,
    href: item.target.kind === 'page' ? paths.get(item.target.pageId) : item.target.href,
  })).filter((item) => item.href);
}
