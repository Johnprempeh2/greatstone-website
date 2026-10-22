import { notFound } from 'next/navigation';
import { CatalogueBrowse } from '../../catalogue.jsx';
import { catalogue, catalogueReleaseNumber } from '../../catalogue-data.js';
import { browseOfferings } from '../../../next-proof/catalogue-data.mjs';

export function generateStaticParams() { return catalogue.vendors.map((vendor) => ({ vendor: vendor.slug })); }

export async function generateMetadata({ params }) {
  const { vendor: slug } = await params;
  const vendor = catalogue.vendors.find((item) => item.slug === slug);
  if (!vendor) notFound();
  return { title: `${vendor.name} software · Greatstone International`, description: vendor.description || `Browse ${vendor.name} software.`, alternates: { canonical: `https://greatstoneint.com/shop/${encodeURIComponent(slug)}` }, other: { 'gs-release': String(catalogueReleaseNumber) } };
}

export default async function VendorShop({ params, searchParams }) {
  const { vendor } = await params;
  if (!catalogue.vendors.some((item) => item.slug === vendor)) notFound();
  const filters = { vendor };
  const rows = browseOfferings(catalogue, filters);
  const page = Math.max(1, Math.min(Math.ceil(rows.length / 24) || 1, Number.parseInt((await searchParams)?.page, 10) || 1));
  return <CatalogueBrowse catalogue={{ ...catalogue, rows: rows.slice((page - 1) * 24, page * 24), matches: rows.length, nextHref: page * 24 < rows.length ? `/shop/${encodeURIComponent(vendor)}?page=${page + 1}` : null }} filters={filters} />;
}
