// The release contains published pages only. Their article paths are the public briefing source.
export function insightBriefings(release) {
  return release.pages
    .filter((page) => /^\/insights\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.path))
    .map(({ id, path, title, seo }) => ({ id, path, title, description: seo.description }));
}
