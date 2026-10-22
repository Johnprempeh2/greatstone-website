import { createHash } from 'node:crypto';
import { themeTokens } from './theme.mjs';

const proofSiteId = '00000000-0000-4000-8000-000000001833';
const orgId = 'org-greatstone';

function fixtureId(value) {
  const hex = createHash('sha256').update(`greatstone-next-proof:${value}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function releaseLinks(value) {
  if (typeof value === 'string') return value.replace(/^#shop(?=\/|$)/, '/shop').replace(/^#product(?=\/|$)/, '/product');
  if (Array.isArray(value)) return value.map(releaseLinks);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, releaseLinks(child)]));
  return value;
}

export function toProofRelease(snapshot) {
  const slugs = Object.keys(snapshot.pages).filter((slug) => snapshot.pages[slug]?.data?.content?.length);
  if (!slugs.includes('home') || !slugs.includes('dev-tools')) throw new Error('Missing published proof page');
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
      data: releaseLinks(source.data),
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
      engine: { version: '0.1.0', commit: '0000000000000000000000000000000000000000' },
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
    collections: Object.fromEntries(['vendors', 'categories', 'offerings'].map((key) => [key, {
      fieldsVersion: 1,
      entries: (snapshot.catalogue?.[key] || []).filter((row) => row.status === undefined || row.status === 'published').map((row, order) => ({
        id: row.id,
        revisionId: fixtureId(`${key}:${row.id}`),
        orgId,
        slug: row.slug,
        order,
        fields: { data: row },
      })),
    }])), redirects: [], media: {},
  };
}
