import { readFile } from 'node:fs/promises';
import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, catalogueRead } from '../netlify/functions/lib/catalogue-store.mjs';

// The build reads the same public projection as /api/catalogue, under transaction-local anon RLS.
// A CLI build gets only the read-only database role, which cannot take the anon role, so a CLI build (staging, and
// the production switch to Next) reads that projection over HTTP instead: NEXT_CATALOGUE_API names a site's
// /api/catalogue, which runs the same reads as anon (Next cutover, 7 Nov 2026).
export async function publishedCatalogue({ fetchImpl = fetch } = {}) {
  if (process.env.NEXT_CATALOGUE_API) return collectPublishedCatalogue(catalogueApiReader(process.env.NEXT_CATALOGUE_API, fetchImpl));
  if (process.env.NEXT_CATALOGUE_FIXTURE) {
    if (process.env.NEXT_CATALOGUE_REQUIRED === '1') throw new Error('Catalogue fixture cannot be used for a required release build');
    const fixture = JSON.parse(await readFile(process.env.NEXT_CATALOGUE_FIXTURE, 'utf8'));
    return { vendors: fixture.vendors, categories: fixture.categories, offerings: fixture.offerings };
  }
  const pool = getPool();
  if (!pool) {
    if (process.env.NEXT_CATALOGUE_REQUIRED === '1') throw new Error('Published catalogue connection is required for the release build');
    return null;
  }
  const read = (op, params) => asCatalogueAnon(pool, (client) => catalogueRead(client, op, params));
  return collectPublishedCatalogue(read);
}

export async function collectPublishedCatalogue(read) {
  const [vendors, categories] = await Promise.all([read('vendors'), read('categories')]);
  const cards = [];
  for (let page = 1, total = Infinity; cards.length < total; page++) {
    const result = await read('list', { page, pageSize: 100, sort: 'az' });
    total = result.total;
    cards.push(...result.items);
    if (!result.items.length && cards.length < total) throw new Error('Published catalogue pagination stopped early');
  }
  const offerings = [];
  for (let i = 0; i < cards.length; i += 8) {
    const batch = await Promise.all(cards.slice(i, i + 8).map((card) => read('detail', { slug: card.slug })));
    if (batch.some((item) => !item)) throw new Error('Published catalogue changed during export');
    offerings.push(...batch.map((detail, index) => (detail === LIST_CARD_ONLY ? cards[i + index] : { ...detail, pricing: cards[i + index].pricing })));
  }
  return { vendors, categories, offerings };
}

const LIST_CARD_ONLY = Object.freeze({ listCardOnly: true });

/** `read(op, params)` over a site's public /api/catalogue: the same operations and answers as catalogueRead. */
export function catalogueApiReader(base, fetchImpl = fetch) {
  const api = new URL(base);
  if (api.protocol !== 'https:' || !api.pathname.endsWith('/api/catalogue')) throw new Error('NEXT_CATALOGUE_API must be an https /api/catalogue URL');
  return async (op, params = {}) => {
    const url = new URL(api);
    url.searchParams.set('op', op);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    if (op === 'detail' && res.status === 404) return null;
    // ponytail: the live /api/catalogue before this release refuses capitals in a slug (devexpress-winForms) with a
    // 400; the build then keeps that product's list card. Drop this once production serves the widened SLUG check.
    if (op === 'detail' && res.status === 400 && /[A-Z]/.test(String(params.slug))) return LIST_CARD_ONLY;
    if (!res.ok) throw new Error(`Published catalogue ${op} answered ${res.status}`);
    return res.json();
  };
}
