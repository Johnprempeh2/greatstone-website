import baked from '../next-proof/data/release.json';
import { resolveMediaRefs } from '../next-proof/release-media.mjs';

export function pageFor(slug, release = baked) {
  const page = release.pages.find((item) => item.slug === slug);
  return page && { ...resolveMediaRefs(page, release.media), orgId: release.orgId };
}
export function pageForPath(path, release) {
  const page = release.pages.find((item) => item.path === path);
  return page && { ...resolveMediaRefs(page, release.media), orgId: release.orgId };
}
export function navigation(release) {
  const paths = new Map(release.pages.map((page) => [page.id, page.path]));
  return release.site.navigation.filter((item) => item.visible).map((item) => ({
    ...item,
    href: item.target.kind === 'page' ? paths.get(item.target.pageId) : item.target.href,
  })).filter((item) => item.href);
}
