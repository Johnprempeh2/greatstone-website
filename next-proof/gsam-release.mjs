import { createHash } from 'node:crypto';
import { supportedBlocks } from './release-validator.mjs';
import { themeStyle } from '../app/theme-style.mjs';

const hashPattern = /^[0-9a-f]{64}$/;
const mediaPath = /^media\/([0-9a-f]{64})\.(png|jpg|webp|avif|gif)$/;
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const problem = (rule, message) => ({ rule, message });

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
  if (!plainObject(value) || value.schema !== 1 || value.siteId !== siteId ||
      (value.orgId !== null && value.orgId !== orgId) || value.release !== number || !plainObject(value.theme) ||
      !Array.isArray(value.pages) || !value.pages.length || !plainObject(value.collections) ||
      !Array.isArray(value.redirects) || !plainObject(value.media)) return problem('release', 'Release envelope is invalid');
  const ids = new Set();
  const paths = new Set();
  for (const page of value.pages) {
    if (!plainObject(page) || typeof page.id !== 'string' || !page.id || ids.has(page.id) ||
        typeof page.slug !== 'string' || !/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/.test(page.slug) || paths.has(page.slug) ||
        typeof page.title !== 'string' || !plainObject(page.seo) || !plainObject(page.content) ||
        !Array.isArray(page.content.content) || !plainObject(page.content.root)) return problem('pages', 'Release page is invalid');
    if (page.content.content.some((block) => !plainObject(block) || !supportedBlocks.has(block.type) || !plainObject(block.props)))
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

  try {
    const pages = published.pages.map((page) => ({
      id: page.id, slug: page.slug === '/' ? 'home' : page.slug.split('/').at(-1), path: page.slug, title: page.title,
      seo: { title: page.seo.title || page.title, description: page.seo.description || '',
        ...(page.seo.ogImageAssetId && published.media[page.seo.ogImageAssetId] ? { ogImage: `/${published.media[page.seo.ogImageAssetId]}` } : {}),
        noindex: page.seo.noindex || false }, data: page.content,
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
      pages, collections, redirects: published.redirects, gsamSnapshot: true,
      media: Object.fromEntries(Object.entries(published.media).map(([id, key]) => [id, { key }])),
    } };
  } catch {
    return { refused: problem('pages', 'Release paths are invalid') };
  }
}
