const origin = 'https://greatstoneint.com';

export function pageMetadata(page, releaseNumber) {
  const url = origin + page.path;
  const image = page.seo.ogImage || undefined;
  return {
    metadataBase: new URL(origin),
    title: page.seo.title,
    description: page.seo.description,
    alternates: { canonical: url },
    openGraph: { title: page.seo.title, description: page.seo.description, url, images: image ? [image] : [] },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: page.seo.title, description: page.seo.description, images: image ? [image] : [] },
    other: { 'gs-release': String(releaseNumber) },
  };
}
