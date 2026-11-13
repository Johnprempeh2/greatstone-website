const origin = 'https://greatstoneint.com';

// A page title from GSAM without the company name (live had "Two Doors", "About") gets it added, so a search
// result or browser tab always says whose page it is.
export const withSiteName = (title) => (!title ? 'Greatstone International' : /greatstone/i.test(title) ? title : `${title} · Greatstone International`);

export function pageMetadata(page, releaseNumber) {
  const url = origin + page.path;
  const title = withSiteName(page.seo.title);
  const image = page.seo.ogImage || origin + '/og-default.png';
  return {
    metadataBase: new URL(origin),
    title,
    description: page.seo.description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'Greatstone International', locale: 'en_GB', title, description: page.seo.description, url, images: [image] },
    twitter: { card: 'summary_large_image', title, description: page.seo.description, images: [image] },
    other: { 'gsam-release': String(releaseNumber) },
  };
}
