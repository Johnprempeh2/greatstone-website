import { servicesFromContent } from '../src/store/service-lookup.mjs';

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

/** A ServiceCatalog block's props with the published services in place of the ones it was saved with. */
export const withReleaseServices = (type, props, published) => (type === 'ServiceCatalog' && published ? { ...props, ...published } : props);
