import { notFound } from 'next/navigation';
import { CatalogueBrowse } from '../../catalogue.jsx';
import { catalogueFromRelease } from '../../catalogue-data.js';
import { activeRelease } from '../../release-source.js';
import { browseOfferings } from '../../../next-proof/catalogue-data.mjs';

export async function generateMetadata({ params }) {
  const { release } = await activeRelease();
  const catalogue = catalogueFromRelease(release);
  const { vendor: slug } = await params;
  const vendor = catalogue.vendors.find((item) => item.slug === slug);
  if (!vendor) notFound();
  return { title: `${vendor.name} software · Greatstone International`, description: vendor.description || `Browse ${vendor.name} software.`, alternates: { canonical: `https://greatstoneint.com/shop/${encodeURIComponent(slug)}` }, other: { 'gsam-release': String(release.release.number) } };
}

export default async function VendorShop({ params }) {
  const { release } = await activeRelease();
  const catalogue = catalogueFromRelease(release);
  const { vendor } = await params;
  if (!catalogue.vendors.some((item) => item.slug === vendor)) notFound();
  const filters = { vendor };
  const rows = browseOfferings(catalogue, filters);
  return <CatalogueBrowse release={release} catalogue={{ ...catalogue, rows, matches: rows.length, nextHref: null }} filters={filters} />;
}
