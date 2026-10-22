const origin = 'https://greatstoneint.com';

export function pageMetadata(page, releaseNumber) {
  const url = origin + page.path;
  const image = page.seo.ogImage || origin + '/og-default.png';
  return {
    metadataBase: new URL(origin),
    title: page.seo.title,
    description: page.seo.description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'Greatstone International', locale: 'en_GB', title: page.seo.title, description: page.seo.description, url, images: [image] },
    twitter: { card: 'summary_large_image', title: page.seo.title, description: page.seo.description, images: [image] },
    other: { 'gs-release': String(releaseNumber) },
  };
}
