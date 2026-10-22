import { CatalogueBrowse } from '../catalogue.jsx';
import { catalogueFromRelease } from '../catalogue-data.js';
import { activeRelease } from '../release-source.js';
import { browseOfferings } from '../../next-proof/catalogue-data.mjs';

const baseMetadata = {
  title: 'Software Catalogue · Greatstone International',
  description: 'Browse developer software from the vendors Greatstone licenses and supports.',
  alternates: { canonical: 'https://greatstoneint.com/shop' },
};
export async function generateMetadata() { const { release } = await activeRelease(); return { ...baseMetadata, other: { 'gs-release': String(release.release.number) } }; }

export default async function Shop({ searchParams }) {
  const { release } = await activeRelease();
  const catalogue = catalogueFromRelease(release);
  const params = await searchParams;
  const filters = Object.fromEntries(['vendor', 'category', 'platform', 'q', 'sort'].map((key) => [key, typeof params?.[key] === 'string' ? params[key] : '']));
  const rows = browseOfferings(catalogue, filters);
  const page = Math.max(1, Math.min(Math.ceil(rows.length / 24) || 1, Number.parseInt(params?.page, 10) || 1));
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  query.set('page', String(page + 1));
  return <CatalogueBrowse release={release} catalogue={{ ...catalogue, rows: rows.slice((page - 1) * 24, page * 24), matches: rows.length, nextHref: page * 24 < rows.length ? '/shop?' + query : null }} filters={filters} />;
}
