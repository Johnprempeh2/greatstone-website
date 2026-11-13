import { notFound } from 'next/navigation';
import CatalogueProductClient from '../../CatalogueProductClient.jsx';
import { SiteFrame } from '../../ProofPage.jsx';
import { pricedCatalogue } from '../../catalogue-pricing.js';
import { activeRelease } from '../../release-source.js';
import { offeringBySlug } from '../../../next-proof/catalogue-data.mjs';
import { productOffer } from '../../../src/lib/pricing.mjs';

// Next can pass a path segment with encoded punctuation to an App Router page.
function catalogueSlug(value) {
  try { return decodeURIComponent(value); }
  catch { notFound(); }
}

export async function generateMetadata({ params }) {
  const { release } = await activeRelease();
  const catalogue = await pricedCatalogue(release);
  const slug = catalogueSlug((await params).slug);
  const item = offeringBySlug(catalogue, slug);
  if (!item) notFound();
  const title = item.seo?.metaTitle || `${item.name} · Greatstone International`;
  const description = item.seo?.metaDescription || item.short_description || item.description;
  const url = `https://greatstoneint.com/product/${encodeURIComponent(slug)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { card: 'summary', title, description }, other: { 'gsam-release': String(release.release.number) } };
}

export default async function Product({ params }) {
  const { release } = await activeRelease();
  const catalogue = await pricedCatalogue(release);
  const slug = catalogueSlug((await params).slug);
  const item = offeringBySlug(catalogue, slug);
  if (!item) notFound();
  const related = catalogue.offerings.filter((candidate) => candidate.slug !== slug && (candidate.vendor?.id === item.vendor?.id || candidate.category?.id === item.category?.id)).slice(0, 4);
  const structured = { '@context': 'https://schema.org', '@type': 'Product', name: item.name, description: item.short_description || item.description,
    brand: { '@type': 'Brand', name: item.vendor?.name || 'Greatstone International' },
    offers: productOffer(item, 'https://greatstoneint.com/product/' + encodeURIComponent(slug)) };
  const image = item.attributes?.mainImage || item.attributes?.icon || item.vendor?.logo_url;
  if (image) structured.image = /^https?:/.test(image) ? image : 'https://greatstoneint.com/' + String(image).replace(/^\/?(assets\/)?/, '');
  return <SiteFrame release={release}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} /><CatalogueProductClient item={item} related={related} /></SiteFrame>;
}

// Rendered on first visit, then kept like the static pages (Next cutover gap 6): no build-time list needed.
export async function generateStaticParams() {
  return [];
}
