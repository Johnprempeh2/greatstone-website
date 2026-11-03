import { createHash } from 'node:crypto';
import { supportedBlocks } from './release-validator.mjs';
import { themeStyle } from '../app/theme-style.mjs';

const hashPattern = /^[0-9a-f]{64}$/;
const mediaPath = /^media\/([0-9a-f]{64})\.(png|jpg|webp|avif|gif)$/;
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const problem = (rule, message) => ({ rule, message });
// GRE-3776: schema 2 pages carry { html, css } instead of Puck data, with shared chrome and one site
// stylesheet. Both schemas render until every page has moved (S4).
export const WEBSITE_RELEASE_SCHEMAS = [1, 2];
export { CHROME_KEYS } from './chrome-keys.mjs';
import { CHROME_KEYS } from './chrome-keys.mjs';
const htmlDocument = (value) => plainObject(value) && typeof value.html === 'string' && typeof value.css === 'string';
// GRE-3789: a page's FAQ structured data is page SEO: plain-text questions and answers the engine writes
// as FAQPage JSON-LD (it was the Faq block's script before the export).
const faqItem = (item) => plainObject(item) && typeof item.q === 'string' && typeof item.a === 'string' &&
  item.q.trim() && item.a.trim() && item.q.length <= 500 && item.a.length <= 4000;
const validSeoFaq = (faq) => faq === undefined || (Array.isArray(faq) && faq.length <= 50 && faq.every(faqItem));

export function validateCurrent(current) {
  if (!plainObject(current) || current.schema !== 1 || !Number.isSafeInteger(current.release) || current.release < 1 ||
      current.key !== `releases/${current.release}.json` || !hashPattern.test(current.sha256 || '') ||
      typeof current.switchedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(current.switchedAt) ||
      !Number.isFinite(Date.parse(current.switchedAt)) || !Number.isSafeInteger(current.fence) || current.fence < 1) {
    return problem('current', 'Current release pointer is invalid');
  }
  return null;
}

export function validateGsamRelease(value, { siteId, orgId, number }) {
  if (!plainObject(value) || !WEBSITE_RELEASE_SCHEMAS.includes(value.schema) || value.siteId !== siteId ||
      (value.orgId !== null && value.orgId !== orgId) || value.release !== number || !plainObject(value.theme) ||
      !Array.isArray(value.pages) || !value.pages.length || !plainObject(value.collections) ||
      !Array.isArray(value.redirects) || !plainObject(value.media)) return problem('release', 'Release envelope is invalid');
  const html = value.schema === 2;
  if (html && (typeof value.stylesheet !== 'string' || !plainObject(value.chrome) ||
      Object.entries(value.chrome).some(([key, item]) => !CHROME_KEYS.includes(key) || !htmlDocument(item)))) return problem('chrome', 'Release chrome or stylesheet is invalid');
  const ids = new Set();
  const paths = new Set();
  for (const page of value.pages) {
    if (!plainObject(page) || typeof page.id !== 'string' || !page.id || ids.has(page.id) ||
        typeof page.slug !== 'string' || !/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/.test(page.slug) || paths.has(page.slug) ||
        typeof page.title !== 'string' || !plainObject(page.seo) || !validSeoFaq(page.seo.faq) || (html ? !htmlDocument(page) : !plainObject(page.content) ||
        !Array.isArray(page.content.content) || !plainObject(page.content.root))) return problem('pages', 'Release page is invalid');
    if (!html && page.content.content.some((block) => !plainObject(block) || !supportedBlocks.has(block.type) || !plainObject(block.props)))
      return problem('pages', 'Release contains an unsupported block');
    ids.add(page.id);
    paths.add(page.slug);
  }
  for (const entries of Object.values(value.collections)) if (!Array.isArray(entries)) return problem('collections', 'Release collection is invalid');
  for (const key of Object.values(value.media)) if (typeof key !== 'string' || !mediaPath.test(key)) return problem('media', 'Release media key is invalid');
  try { themeStyle(plainObject(value.theme.tokens) ? value.theme.tokens : value.theme); }
  catch { return problem('theme', 'Release theme is invalid'); }
  return null;
}

export function readGsamRelease(raw, current, identity, baked) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 10 * 1024 * 1024) return { refused: problem('release', 'Release file is missing or too large') };
  if (createHash('sha256').update(raw).digest('hex') !== current.sha256) return { refused: problem('sha256', 'Release digest does not match current') };
  let published;
  try { published = JSON.parse(raw); }
  catch { return { refused: problem('release', 'Release is not valid JSON') }; }
  const refused = validateGsamRelease(published, { ...identity, number: current.release });
  if (refused) return { refused };
  const html = published.schema === 2;

  try {
    const pages = published.pages.map((page) => ({
      id: page.id, slug: page.slug === '/' ? 'home' : page.slug.split('/').at(-1), path: page.slug, title: page.title,
      seo: { title: page.seo.title || page.title, description: page.seo.description || '',
        ...(page.seo.ogImageAssetId && published.media[page.seo.ogImageAssetId] ? { ogImage: `/${published.media[page.seo.ogImageAssetId]}` } : {}),
        noindex: page.seo.noindex || false,
        ...(page.seo.faq?.length ? { faq: page.seo.faq.map(({ q, a }) => ({ q, a })) } : {}) },
      ...(html ? { format: 'html', html: page.html, css: page.css } : { data: page.content }),
    }));
    if (!pages.some((page) => page.path === '/')) return { refused: problem('pages', 'Release has no home page') };
    const navigation = published.pages.filter((page) => page.menu === 'header')
      .sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0))
      .map((page) => ({ id: page.id, label: page.title, visible: true, target: { kind: 'page', pageId: page.id } }));
    const collections = Object.fromEntries(Object.entries(published.collections).map(([key, entries]) => [key, {
      fieldsVersion: 1,
      entries: entries.map((entry) => ({ ...entry })),
    }]));
    const tokens = plainObject(published.theme.tokens) ? published.theme.tokens : published.theme;
    return { release: {
      ...baked, siteId: published.siteId, orgId: published.orgId ?? baked.orgId,
      release: { ...baked.release, number: published.release },
      site: { ...baked.site, navigation },
      theme: { ...baked.theme, tokens: { ...baked.theme.tokens, ...tokens } },
      releaseSchema: published.schema,
      chrome: html ? Object.fromEntries(CHROME_KEYS.map((key) => [key, { html: published.chrome[key]?.html || '', css: published.chrome[key]?.css || '' }])) : null,
      stylesheet: html ? published.stylesheet : null,
      pages, collections, redirects: published.redirects, gsamSnapshot: true,
      media: Object.fromEntries(Object.entries(published.media).map(([id, key]) => [id, { key }])),
    } };
  } catch {
    return { refused: problem('pages', 'Release paths are invalid') };
  }
}
