import { createHash } from 'node:crypto';
import { themeTokens } from './theme.mjs';
import { publicPathText } from './public-links.mjs';

const proofSiteId = process.env.GSAM_SITE_ID || '00000000-0000-4000-8000-000000001833';
const orgId = process.env.GSAM_ORG_ID || 'org-greatstone';

function fixtureId(value) {
  const hex = createHash('sha256').update(`greatstone-next-proof:${value}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function releaseLinks(value, pagePaths) {
  if (typeof value === 'string') return publicPathText(value.replace(/^#shop(?=\/|$)/, '/shop').replace(/^#product(?=\/|$)/, '/product'), pagePaths);
  if (Array.isArray(value)) return value.map((item) => releaseLinks(item, pagePaths));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, releaseLinks(child, pagePaths)]));
  return value;
}

// Only persisted public catalogue fields belong in collection fieldsVersion 1.
// The public read also decorates products with request-time prices and join IDs.
const pick = (row, keys) => Object.fromEntries(keys.filter((key) => row?.[key] !== undefined).map((key) => [key, row[key]]));
function priceMinor(value, field) {
  if (value === null || value === undefined) return value;
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Unsafe ${field}`);
  return number;
}
function expectKeys(row, allowed, kind) {
  const unknown = Object.keys(row).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unmapped ${kind} fields: ${unknown.join(', ')}`);
}
const variant = (row) => {
  const fields = ['id', 'sku', 'name', 'currency', 'platform', 'sort_order', 'license_type', 'min_order_qty', 'billing_period', 'base_price_minor'];
  expectKeys(row, [...fields, 'pricing'], 'variant');
  const data = pick(row, fields);
  if ('base_price_minor' in data) data.base_price_minor = priceMinor(data.base_price_minor, 'base_price_minor');
  return data;
};
const spec = (row) => {
  const fields = ['label', 'value', 'sort_order'];
  expectKeys(row, fields, 'specification');
  return pick(row, fields);
};

export function catalogueFields(key, row) {
  if (key === 'vendors') {
    const fields = ['id', 'slug', 'name', 'logo_url', 'description'];
    expectKeys(row, fields, 'vendor');
    return { data: pick(row, fields) };
  }
  if (key === 'categories') {
    const fields = ['id', 'slug', 'name', 'description'];
    expectKeys(row, fields, 'category');
    return { data: pick(row, fields) };
  }
  if (key !== 'offerings') throw new RangeError(`Unknown catalogue collection: ${key}`);
  const fields = ['id', 'slug', 'name', 'short_description', 'from_price_minor', 'from_price_currency', 'featured', 'platforms', 'type', 'attributes', 'vendor', 'category', 'description', 'seo'];
  expectKeys(row, [...fields, 'offering_variants', 'offering_specs', 'variants', 'specs', 'vendor_id', 'category_id', 'pricing', 'from', 'status'], 'offering');
  const data = pick(row, fields);
  if ('from_price_minor' in data) data.from_price_minor = priceMinor(data.from_price_minor, 'from_price_minor');
  const variants = (row.offering_variants || row.variants || []).map(variant);
  const specs = (row.offering_specs || row.specs || []).map(spec);
  return { data: { ...data, offering_variants: variants, variants, offering_specs: specs, specs } };
}

export function toCatalogueCollections(catalogue, targetOrgId = orgId) {
  if (!catalogue) throw new Error('Published catalogue connection is required for collection export');
  return Object.fromEntries(['vendors', 'categories', 'offerings'].map((key) => [key, {
    fieldsVersion: 1,
    entries: catalogue[key].filter((row) => row.status === undefined || row.status === 'published').map((row, order) => ({
      id: row.id,
      revisionId: fixtureId(`${key}:${row.id}`),
      orgId: targetOrgId,
      ...(typeof row.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ? { slug: row.slug } : {}),
      order,
      fields: catalogueFields(key, row),
    })),
  }]));
}

export function toProofRelease(snapshot) {
  const slugs = Object.keys(snapshot.pages).filter((slug) => snapshot.pages[slug]?.data?.content?.length);
  if (!slugs.includes('home') || !slugs.includes('dev-tools')) throw new Error('Missing published proof page');
  const pagePaths = slugs.map((slug) => slug === 'home' ? '/' : `/${slug}`);
  const pages = slugs.map((slug, navOrder) => {
    const source = snapshot.pages[slug];
    if (!source?.data?.content?.length) throw new Error(`Missing published proof page: ${slug}`);
    return {
      id: fixtureId(`page:${slug}`),
      revisionId: fixtureId(`revision:${slug}`),
      slug,
      path: slug === 'home' ? '/' : `/${slug}`,
      title: source.title,
      navOrder,
      seo: source.seo,
      data: releaseLinks(source.data, pagePaths),
    };
  });
  const bySlug = Object.fromEntries(pages.map((page) => [page.slug, page]));
  return {
    schema: 1,
    siteId: proofSiteId,
    orgId,
    release: {
      id: fixtureId('release:1'), number: 1, previous: null,
      createdAt: '2026-10-22T00:00:00Z',
      publishedBy: { kind: 'agent', id: 'proof-seed' },
      approvalId: null,
      engine: { version: '0.1.0', commit: /^[0-9a-f]{40}$/.test(process.env.COMMIT_REF || '') ? process.env.COMMIT_REF : '0000000000000000000000000000000000000000' },
    },
    site: {
      name: snapshot.settings.siteName,
      settings: snapshot.settings,
      navigation: snapshot.navigation.filter((item) => item.visible && bySlug[item.pageSlug]).map((item) => ({
        id: item.id,
        label: item.label,
        visible: true,
        target: { kind: 'page', pageId: bySlug[item.pageSlug].id },
      })),
    },
    theme: { revisionId: fixtureId('theme:1'), tokens: themeTokens },
    pages,
    collections: snapshot.catalogue ? toCatalogueCollections(snapshot.catalogue, orgId) :
      Object.fromEntries(['vendors', 'categories', 'offerings'].map((key) => [key, { fieldsVersion: 1, entries: [] }])),
    redirects: [], media: {},
  };
}
