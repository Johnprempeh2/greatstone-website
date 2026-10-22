import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from './website-release.v1.schema.json' with { type: 'json' };

export const supportedReleaseSchemas = [1];
export const supportedBlocks = new Set([
  'TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof', 'TwoDoorsTools', 'DevTools',
  'Hero', 'Prose', 'Panels', 'ServiceCatalog', 'Invite', 'Steps', 'FeatureGrid',
  'Faq', 'PillarCards', 'MaturityModel', 'Chapter', 'Team', 'LogoWall',
  'IntelBand', 'MaturityMap', 'Ladder', 'MethodTieIn', 'IndustryPicker',
  'BookDeepDive', 'AiBaselineSurvey', 'AiCostCalculator',
]);

const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);
const validShape = ajv.compile(schema);
const fail = (rule, message) => ({ rule, message });
const mediaRef = /media:([A-Za-z0-9_-]{1,64})/g;
const mediaExtensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

function walk(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => walk(item, visit));
}

function checkBlocks(blocks, ids) {
  for (const block of blocks) {
    if (!supportedBlocks.has(block.type)) return fail('R6', `Unsupported block ${block.type}`);
    if (typeof block.props?.id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(block.props.id)) return fail('R6', 'Nested block id is invalid');
    if (ids.has(block.props.id)) return fail('R6', `Duplicate block id ${block.props.id}`);
    ids.add(block.props.id);
    if ('zones' in block || 'zones' in block.props) return fail('R6', 'Legacy zones are unsupported');
    const nested = [];
    const find = (value) => {
      if (Array.isArray(value)) value.forEach(find);
      else if (value && typeof value === 'object') {
        if (typeof value.type === 'string' && value.props && typeof value.props === 'object') nested.push(value);
        else Object.values(value).forEach(find);
      }
    };
    Object.values(block.props).forEach(find);
    const bad = checkBlocks(nested, ids);
    if (bad) return bad;
  }
  return null;
}

export function validateRelease(release, { siteId, orgId } = {}) {
  if (!release || typeof release !== 'object' || Array.isArray(release)) return fail('R1', 'Release root must be an object');
  if (Buffer.byteLength(JSON.stringify(release)) > 10 * 1024 * 1024) return fail('R13', 'Release exceeds 10 MB');
  if (!supportedReleaseSchemas.includes(release.schema)) return fail('R2', `Unsupported schema ${release.schema}`);
  if (!validShape(release)) return fail('R1', `${validShape.errors[0].instancePath || '/'} ${validShape.errors[0].message}`);
  if (release.siteId !== siteId) return fail('R3', 'Site id does not match this engine');
  if (release.orgId !== orgId || Object.values(release.collections).some((collection) => collection.entries.some((entry) => entry.orgId !== orgId))) return fail('R4', 'Organisation id does not match this engine');

  const unique = (items, key) => new Set(items.map((item) => item[key])).size === items.length;
  const paths = new Set(release.pages.map((page) => page.path));
  if (!['id', 'slug', 'path'].every((key) => unique(release.pages, key)) || release.pages.filter((page) => page.path === '/').length !== 1 || release.pages.some((page) => page.seo.canonicalPath && !paths.has(page.seo.canonicalPath))) return fail('R5', 'Page ids, slugs, paths or canonical paths are invalid');
  for (const page of release.pages) {
    const bad = checkBlocks(page.data.content, new Set());
    if (bad) return bad;
  }

  let missingMedia;
  walk(release, (value) => {
    for (const [, id] of value.matchAll(mediaRef)) if (!(id in release.media)) missingMedia = id;
  });
  if (missingMedia) return fail('R7', `Missing media ${missingMedia}`);
  if (Object.values(release.media).some((item) => item.key !== `media/${item.sha256}.${mediaExtensions[item.contentType]}`)) return fail('R7', 'Media key does not match digest or type');

  const pageIds = new Set(release.pages.map((page) => page.id));
  const checkNavigation = (items) => items.every((item) => (item.target.kind !== 'page' || pageIds.has(item.target.pageId)) && checkNavigation(item.children || []));
  if (!checkNavigation(release.site.navigation)) return fail('R8', 'Navigation refers to a missing page');

  const redirects = new Map(release.redirects.map((item) => [item.from, item]));
  if (redirects.size !== release.redirects.length || release.redirects.some((item) => paths.has(item.from))) return fail('R9', 'Redirect source is duplicate or a page');
  for (const item of release.redirects) {
    let target = item.to;
    for (let depth = 0; depth < 3 && target.startsWith('/'); depth++) {
      if (paths.has(target)) break;
      const next = redirects.get(target);
      if (!next || depth === 2 || next.from === item.from) return fail('R9', 'Redirect target is missing, loops or has a long chain');
      target = next.to;
    }
  }

  for (const [key, collection] of Object.entries(release.collections)) {
    if (!unique(collection.entries, 'id') || collection.fieldsVersion !== 1 || !['vendors', 'categories', 'offerings'].includes(key) || collection.entries.some((entry) => {
      const data = entry.fields.data;
      return !data || typeof data !== 'object' || Array.isArray(data) || data.id !== entry.id || typeof data.name !== 'string' || !data.name || typeof data.slug !== 'string' || !data.slug || (entry.slug && data.slug !== entry.slug);
    })) return fail('R10', `Unsupported or invalid collection ${key}`);
  }
  return null;
}
