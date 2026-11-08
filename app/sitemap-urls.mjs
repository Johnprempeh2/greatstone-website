import { isHidden } from '../next-proof/hidden-routes.mjs';

// Every public page of the release, plus the pages the Next app serves itself, for /sitemap.xml.
const CODE_PAGES = ['/shop', '/ai-market-intelligence'];

export function sitemapUrls(release, origin = 'https://greatstoneint.com') {
  const paths = [...new Set([...release.pages.map((page) => page.path), ...CODE_PAGES])].filter((path) => !isHidden(path));
  return paths.map((path) => ({ url: origin + (path === '/' ? '/' : path), changeFrequency: 'weekly', priority: path === '/' ? 1 : 0.7 }));
}
