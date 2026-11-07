// GRE-1861: news pictures for the public intelligence dashboard, pulled the way GSAM's Intelligence page
// does (gs-clip server/src/services/intelligence-media.ts): open each story's page and take its own preview
// image (og:image, else twitter:image). This runs when the snapshot is built, and the bytes are saved under
// public/assets/intel/news, so a visitor's browser never loads a publisher's host.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// og:image sits in <head>; the first 512 KB of a page is plenty.
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Greatstone website intelligence preview)';

const decodeEntities = (value) => value
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#x2f;|&#0*47;/gi, '/');

/** The page's preview image: og:image (or its :secure_url / :url forms), else twitter:image, resolved against the page URL. */
export function extractOgImage(html, pageUrl) {
  const found = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map();
    for (const match of tag.matchAll(/([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
    }
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase();
    const content = attrs.get('content')?.trim();
    if (key && content && !found.has(key)) found.set(key, decodeEntities(content));
  }
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    const value = found.get(key);
    if (!value) continue;
    try {
      const url = new URL(value, pageUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
    } catch {
      // Try the next tag.
    }
  }
  return null;
}

// Public hosts only: no IP literals, localhost or internal names, so a bad URL in the data cannot reach this machine's network.
const publicHost = (url) => (url.protocol === 'https:' || url.protocol === 'http:')
  && !isIP(url.hostname.replace(/^\[|\]$/g, '')) && url.hostname.includes('.') && !/(^|\.)(localhost|local|internal)$/i.test(url.hostname);

async function readCapped(response, max, truncate) {
  if (!truncate && Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      if (!truncate) return null;
      chunks.push(value.subarray(0, value.byteLength - (size - max)));
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** GET with redirects checked hop by hop. Null on any failure, a non-2xx answer or a type that is neither HTML nor an image. */
async function fetchFollowing(fetchImpl, start, accept) {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    let url = new URL(start);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!publicHost(url)) return null;
      const response = await fetchImpl(url, { headers: { accept, 'user-agent': USER_AGENT }, redirect: 'manual', signal });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => undefined);
        url = new URL(location, url);
        continue;
      }
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const isImage = contentType in IMAGE_TYPES;
      const isHtml = contentType === 'text/html' || contentType === 'application/xhtml+xml';
      if (response.status < 200 || response.status >= 300 || (!isImage && !isHtml)) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const body = await readCapped(response, isImage ? MAX_IMAGE_BYTES : MAX_HTML_BYTES, !isImage);
      return body ? { url, contentType, body } : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** A story page's preview image as `{ contentType, body }`, or null when it has none we can use. */
export async function fetchPreviewImage(pageUrl, fetchImpl = fetch) {
  const page = await fetchFollowing(fetchImpl, pageUrl, 'text/html,image/*;q=0.9');
  if (!page) return null;
  if (page.contentType in IMAGE_TYPES) return { contentType: page.contentType, body: page.body };
  const imageUrl = extractOgImage(page.body.toString('utf8'), page.url.toString());
  if (!imageUrl) return null;
  const image = await fetchFollowing(fetchImpl, imageUrl, 'image/*');
  return image && image.contentType in IMAGE_TYPES ? { contentType: image.contentType, body: image.body } : null;
}

// Story images arrive at up to 2 MB; resize to the widest the dashboard shows and save as WebP. sharp comes
// with Next.js; without it the original file is kept.
async function shrinkImage(media) {
  try {
    const { default: sharp } = await import('sharp');
    const body = await sharp(media.body).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    return { contentType: 'image/webp', body };
  } catch {
    return media;
  }
}

/**
 * Adds `image: { src, alt }` to each news item whose story has a preview image, saving the file in `dir`
 * (served at `base`) under a name from the story URL. The alt text is the headline. Items without one are
 * left as they are; the dashboard shows the vendor mark instead.
 */
export async function withNewsImages(snapshot, { dir, base = '/assets/intel/news', fetchImpl = fetch, shrink = shrinkImage } = {}) {
  mkdirSync(dir, { recursive: true });
  const news = await Promise.all((snapshot.news ?? []).map(async (item) => {
    const { image: _old, ...rest } = item;
    const found = await fetchPreviewImage(item.url, fetchImpl);
    if (!found) return rest;
    const media = await shrink(found);
    const name = `${createHash('sha256').update(item.url).digest('hex').slice(0, 16)}.${IMAGE_TYPES[media.contentType]}`;
    writeFileSync(join(dir, name), media.body);
    return { ...rest, image: { src: `${base}/${name}`, alt: item.headline } };
  }));
  return { ...snapshot, news };
}
