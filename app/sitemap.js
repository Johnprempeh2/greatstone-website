import { activeRelease } from './release-source.js';
import { sitemapUrls } from './sitemap-urls.mjs';

// Follows the published release, like the pages (layout.jsx).
export const revalidate = 300;

export default async function sitemap() {
  const { release } = await activeRelease();
  return sitemapUrls(release);
}
