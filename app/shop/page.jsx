import { CatalogueBrowse } from '../catalogue.jsx';
import { catalogue, catalogueReleaseNumber } from '../catalogue-data.js';
import { browseOfferings } from '../../next-proof/catalogue-data.mjs';

export const metadata = {
  title: 'Software Catalogue · Greatstone International',
  description: 'Browse developer software from the vendors Greatstone licenses and supports.',
  alternates: { canonical: 'https://greatstoneint.com/shop' },
  other: { 'gs-release': String(catalogueReleaseNumber) },
};

export default async function Shop({ searchParams }) {
  const params = await searchParams;
  const filters = Object.fromEntries(['vendor', 'category', 'platform', 'q', 'sort'].map((key) => [key, typeof params?.[key] === 'string' ? params[key] : '']));
  const rows = browseOfferings(catalogue, filters);
  const page = Math.max(1, Math.min(Math.ceil(rows.length / 24) || 1, Number.parseInt(params?.page, 10) || 1));
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  query.set('page', String(page + 1));
  return <CatalogueBrowse catalogue={{ ...catalogue, rows: rows.slice((page - 1) * 24, page * 24), matches: rows.length, nextHref: page * 24 < rows.length ? '/shop?' + query : null }} filters={filters} />;
}
