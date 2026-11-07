import { servicesFromContent } from '../src/store/service-lookup.mjs';

// GRE-1824: each service has its own page at /service/<slug>. The services come from the published
// ServiceCatalog block, so an edit in the editor changes the listing and the service pages together.
// `path` is the page that lists them, for the breadcrumb and the back link.
export function serviceCatalogueFromRelease(release, frozenBlocks = {}) {
  for (const page of release?.pages || []) {
    if (release.releaseSchema === 2) {
      // Schema 2 pages keep the block's published props frozen at export, keyed by data-block.
      const id = /<gs-island\b[^>]*\bname="service-catalog"[^>]*\bdata-block="([^"]+)"/.exec(typeof page.html === 'string' ? page.html : '')?.[1];
      if (id && Object.hasOwn(frozenBlocks, id)) return { ...servicesFromContent([{ type: 'ServiceCatalog', props: frozenBlocks[id] }]), path: page.path };
    } else {
      const content = page.data?.content || [];
      if (content.some((block) => block?.type === 'ServiceCatalog')) return { ...servicesFromContent(content), path: page.path };
    }
  }
  return { ...servicesFromContent([]), path: null };
}
