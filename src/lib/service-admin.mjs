// Service-catalogue admin model: pure helpers for the "Services" management panel. The catalogue lives in
// a ServiceCatalog block's props (services[] + categories[]) on whichever page carries it (the Services
// page); servicesFromPage reads the SAME source for the public listing, the per-service detail pages and
// the inquiry, so editing here drives all three. STORE-FREE (no store.js / JSX import), so node --test loads it.

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Locate the ServiceCatalog block across the site → where it is + its current arrays. null if none exists yet.
export function findCatalog(state) {
  const order = (state && state.order) || Object.keys((state && state.pages) || {});
  const pages = (state && state.pages) || {};
  for (const slug of order) {
    const page = pages[slug];
    const content = (page && page.data && page.data.content) || [];
    const index = content.findIndex((b) => b && b.type === 'ServiceCatalog');
    if (index >= 0) {
      const props = content[index].props || {};
      return {
        slug, index,
        title: page.title || slug,
        services: Array.isArray(props.services) ? props.services : [],
        categories: Array.isArray(props.categories) ? props.categories : [],
        email: props.inquiryEmail || '',
      };
    }
  }
  return null;
}

// counts for the panel header + per-category tally
export function catalogStats(catalog) {
  const services = (catalog && catalog.services) || [];
  const categories = (catalog && catalog.categories) || [];
  const byCategory = {};
  services.forEach((s) => { const c = s.category || 'Uncategorised'; byCategory[c] = (byCategory[c] || 0) + 1; });
  return {
    services: services.length,
    categories: categories.length,
    featured: services.filter((s) => s.featured).length,
    isNew: services.filter((s) => s.isNew).length,
    byCategory,
  };
}

// the effective routing slug for a service (explicit, else derived from the name) — mirrors serviceSlug.
export const serviceSlug = (s) => (s && (s.slug || slugify(s.name))) || '';

// slugs that collide once derived — so the panel can warn before two services share a URL.
export function duplicateSlugs(services) {
  const seen = {}, dupes = new Set();
  (services || []).forEach((s) => { const sl = serviceSlug(s); if (!sl) return; if (seen[sl]) dupes.add(sl); seen[sl] = true; });
  return [...dupes];
}

// pure array ops the panel composes (return a NEW array; never mutate)
export const patchAt = (arr, i, patch) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
export const removeAt = (arr, i) => arr.filter((_, j) => j !== i);
export const insertAt = (arr, i, item) => { const out = arr.slice(); out.splice(i < 0 ? arr.length : i, 0, item); return out; };
export const moveAt = (arr, i, dir) => {
  const j = i + dir;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return arr;
  const out = arr.slice(); const t = out[i]; out[i] = out[j]; out[j] = t; return out;
};

// a fresh service / category with sensible defaults (matches the block's defaultItemProps).
export const blankService = (category) => ({ name: 'New service', slug: '', category: category || '', oneLiner: 'What it does.', format: 'Build', featured: false, isNew: true, outcome: '', idealClient: '', bullets: [] });
export const blankCategory = () => ({ name: 'New category', blurb: '' });
