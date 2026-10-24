import { resolveMediaRefs } from './release-media.mjs';

export function catalogueFromRelease(release) {
  const rows = (key) => (release.collections?.[key]?.entries || [])
    .filter((entry) => release.gsamSnapshot || entry.orgId === release.orgId)
    .map((entry) => resolveMediaRefs(entry.fields.data, release.media));
  return { vendors: rows('vendors'), categories: rows('categories'), offerings: rows('offerings') };
}

export function browseOfferings(catalogue, { vendor = '', category = '', platform = '', q = '', sort = 'featured' } = {}) {
  const search = q.trim().toLocaleLowerCase();
  const rows = catalogue.offerings.filter((item) =>
    (!vendor || item.vendor?.slug === vendor) &&
    (!category || item.category?.slug === category) &&
    (!platform || item.platforms?.includes(platform)) &&
    (!search || [item.name, item.short_description, item.vendor?.name].some((part) => part?.toLocaleLowerCase().includes(search))));
  return rows.sort((a, b) => {
    if (sort === 'az') return a.name.localeCompare(b.name);
    if (sort === 'price' || sort === 'price-desc') {
      if (a.pricing?.final == null) return b.pricing?.final == null ? a.name.localeCompare(b.name) : 1;
      if (b.pricing?.final == null) return -1;
      const left = a.pricing?.final ?? Infinity;
      const right = b.pricing?.final ?? Infinity;
      return (sort === 'price' ? 1 : -1) * (left - right) || a.name.localeCompare(b.name);
    }
    return Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name);
  });
}

export function offeringBySlug(catalogue, slug) {
  return catalogue.offerings.find((item) => item.slug === slug) || null;
}
