import { getPool } from './lib/db.mjs';
import { asCatalogueAnon, catalogueRead } from './lib/catalogue-store.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const SLUG = /^[a-z0-9][a-z0-9+._-]{0,159}$/;
const OPS = new Set(['vendors', 'categories', 'list', 'detail', 'related']);

export function makeCatalogueHandler({ pool = getPool, read = catalogueRead, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'GET') return json({ error: 'Use GET.' }, 405);
    const url = new URL(req.url);
    const op = url.searchParams.get('op') || 'list';
    if (!OPS.has(op)) return json({ error: 'Unknown catalogue operation.' }, 400);
    const params = Object.fromEntries(url.searchParams);
    for (const key of ['vendor', 'category', 'slug']) {
      if (params[key] && !SLUG.test(params[key])) return json({ error: 'Invalid catalogue filter.' }, 400);
    }
    if (['detail', 'related'].includes(op) && !params.slug) return json({ error: 'Product slug required.' }, 400);
    if (params.platform?.length > 80 || params.q?.length > 160 || params.type?.length > 30)
      return json({ error: 'Catalogue filter too long.' }, 400);
    const page = Number(params.page || 1), pageSize = Number(params.pageSize || 24);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      return json({ error: 'Invalid page.' }, 400);
    params.page = page; params.pageSize = pageSize;
    params.limit = 4;
    try {
      const db = pool();
      if (!db) return json({ error: 'Catalogue unavailable.' }, 503);
      return json(await asCatalogueAnon(db, (client) => read(client, op, params)));
    } catch (error) {
      log('catalogue: read failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Catalogue unavailable.' }, 503);
    }
  };
}

export default makeCatalogueHandler();
export const config = { path: '/api/catalogue' };
