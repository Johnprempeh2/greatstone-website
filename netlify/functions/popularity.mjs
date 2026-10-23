import { getPool } from './lib/db.mjs';
import { asPublicAnon, publicIp } from './lib/public-actions.mjs';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const SLUG = /^[a-z0-9-]{1,120}$/;

export function makePopularityHandler({ pool = getPool, log = console.error } = {}) {
  return async (req, context) => {
    if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Use GET or POST.' }, 405);
    let body;
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { return json({ error: 'Invalid popularity event.' }, 400); }
      if (!SLUG.test(body?.slug) || !['view', 'inquiry'].includes(body?.kind))
        return json({ error: 'Invalid popularity event.' }, 400);
    }
    try {
      const db = pool();
      if (!db) return json({ error: 'Popularity unavailable.' }, 503);
      if (req.method === 'GET') {
        const rows = await asPublicAnon(db, publicIp(req, context), async (client) =>
          (await client.query('SELECT slug, views, inquiries FROM service_popularity')).rows);
        return json(rows);
      }
      await asPublicAnon(db, publicIp(req, context), (client) =>
        client.query('SELECT bump_service_popularity($1, $2)', [body.slug, body.kind]));
      return json({ ok: true });
    } catch (error) {
      log('popularity: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Popularity unavailable.' }, 503);
    }
  };
}

export default makePopularityHandler();
export const config = { path: '/api/popularity' };
