import { getPool } from './lib/db.mjs';
import { asPublicAnon, publicIp } from './lib/public-actions.mjs';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function makeServiceInquiryHandler({ pool = getPool, log = console.error } = {}) {
  return async (req, context) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Check your enquiry and try again.' }, 400); }
    if (!Array.isArray(body?.services) || !body.services.length || body.services.length > 50 ||
      body.services.some((s) => !s || typeof s.slug !== 'string' || !/^[a-z0-9-]{1,120}$/.test(s.slug)) ||
      [['name', 200], ['email', 200], ['company', 200], ['message', 4000]].some(([key, max]) =>
        body[key] != null && (typeof body[key] !== 'string' || body[key].length > max)))
      return json({ error: 'Check your enquiry and try again.' }, 400);
    try {
      const db = pool();
      if (!db) return json({ error: 'Enquiry unavailable.' }, 503);
      const id = await asPublicAnon(db, publicIp(req, context), async (client) =>
        (await client.query('SELECT submit_service_inquiry($1::jsonb, $2, $3, $4, $5) AS id',
          [JSON.stringify(body.services), body.name || null, body.email || null, body.company || null, body.message || null])).rows[0]?.id);
      return json({ ok: true, id });
    } catch (error) {
      log('service-inquiry: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Enquiry unavailable.' }, 503);
    }
  };
}

export default makeServiceInquiryHandler();
export const config = { path: '/api/service-inquiry' };
