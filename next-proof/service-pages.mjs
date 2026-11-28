import { servicesFromContent, serviceSlug } from '../src/store/service-lookup.mjs';
import { services as CATALOG_SERVICES } from '../src/data/service-catalog.mjs';
import { transformationServices } from '../src/data/transformation-services.mjs';

// GRE-1824: each service has its own page at /service/<slug>. The services come from the published
// ServiceCatalog block, so an edit in the editor changes the listing and the service pages together.
// `path` is the page that lists them, for the breadcrumb and the back link.
export function serviceCatalogueFromRelease(release, frozenBlocks = {}) {
  const published = releaseServices(release);
  const listing = (found) => (published ? { ...found, ...published } : found);
  for (const page of release?.pages || []) {
    if (release.releaseSchema === 2) {
      // Schema 2 pages keep the block's published props frozen at export, keyed by data-block.
      const id = /<gs-island\b[^>]*\bname="service-catalog"[^>]*\bdata-block="([^"]+)"/.exec(typeof page.html === 'string' ? page.html : '')?.[1];
      if (id && Object.hasOwn(frozenBlocks, id)) return listing({ ...servicesFromContent([{ type: 'ServiceCatalog', props: frozenBlocks[id] }]), path: page.path });
    } else {
      const content = page.data?.content || [];
      if (content.some((block) => block?.type === 'ServiceCatalog')) return listing({ ...servicesFromContent(content), path: page.path });
    }
  }
  return listing({ ...servicesFromContent([]), path: null });
}

const ordered = (collection) => [...(collection?.entries || [])]
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.key ?? a.id).localeCompare(String(b.key ?? b.id)))
  .map((entry) => entry.fields).filter((fields) => fields && typeof fields === 'object');

/**
 * The services GSAM publishes (its Services and Service categories collections), in GSAM's order, or null when the
 * release has none: then the ServiceCatalog block's own props, and in the end src/data/service-catalog.mjs, are used,
 * so nothing changes before the first Publish that carries them.
 */
export function releaseServices(release) {
  const services = ordered(release?.collections?.services);
  if (!services.length) return null;
  const categories = ordered(release.collections['service-categories']);
  return { services, ...(categories.length ? { categories } : {}) };
}

/** A ServiceCatalog block's props with the published services in place of the ones it was saved with.
 * TransformationServices (GRE-6446) lists the same services under its categories, so it takes them too. */
export const withReleaseServices = (type, props, published) => (!published ? props
  : type === 'ServiceCatalog' ? { ...props, ...published }
    : type === 'TransformationServices' ? { ...props, services: published.services } : props);

/** GRE-6446: one Transformation Services category's services (by its id), from the published services or the
 * code catalogue, trimmed to what the service-basket island shows. Never a price. */
export function categoryServices(published, categoryId) {
  const title = transformationServices.find((item) => item.id === categoryId)?.title;
  if (!title) return [];
  const all = published?.services?.length ? published.services : CATALOG_SERVICES;
  return all.filter((item) => item && item.category === title && item.name)
    .map((item) => ({ slug: serviceSlug(item), name: item.name, category: item.category, ...(item.oneLiner ? { oneLiner: item.oneLiner } : {}),
      ...(item.format ? { format: item.format } : {}) }));
}
