import { isHidden } from '../next-proof/hidden-routes.mjs';
import { catalogueFromRelease } from '../next-proof/catalogue-data.mjs';

// Every public page of the release, plus the pages the Next app serves itself, for /sitemap.xml.
const CODE_PAGES = ['/shop', '/ai-market-intelligence', '/gs-agentic-manager'];

export function sitemapUrls(release, origin = 'https://greatstoneint.com') {
  const paths = [...new Set([...release.pages.map((page) => page.path), ...CODE_PAGES])].filter((path) => !isHidden(path));
  return paths.map((path) => ({ url: origin + (path === '/' ? '/' : path), changeFrequency: 'weekly', priority: path === '/' ? 1 : 0.7 }));
}

// The shop's brand and product pages, from the same release catalogue the pages render. Sitemap only:
// the voice guide reads sitemapUrls as the list of pages and has its own catalogue section.
export function shopUrls(release, origin = 'https://greatstoneint.com') {
  const listed = (key) => Array.isArray(release.collections?.[key]?.entries);
  if (!listed('vendors') && !listed('offerings')) return [];
  const { vendors, offerings } = catalogueFromRelease(release);
  return [...vendors.map((v) => '/shop/' + encodeURIComponent(v.slug)), ...offerings.map((o) => '/product/' + encodeURIComponent(o.slug))]
    .map((path) => ({ url: origin + path, changeFrequency: 'weekly', priority: 0.5 }));
}
