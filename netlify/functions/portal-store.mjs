import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { portalStore } from './lib/portal-store.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPS = new Set(['overview', 'accept', 'job', 'receipt-document']);

export function makePortalStoreHandler({ pool = getPool, query = portalStore, verify, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const { op, args = {} } = body || {};
    if (!OPS.has(op) || !args || typeof args !== 'object' || Array.isArray(args)) return json({ error: 'Invalid operation.' }, 400);
    if (['job', 'receipt-document'].includes(op) && !UUID.test(args.acceptanceId || '') ||
        op === 'accept' && (!UUID.test(args.documentId || '') || typeof args.name !== 'string' || !args.name.trim() ||
          args.name.length > 200 || typeof args.title !== 'string' || !args.title.trim() || args.title.length > 200 ||
          args.confirmed !== true)) return json({ error: 'Invalid portal request.' }, 400);
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '');
    if (!match) return json({ error: 'Sign in required.' }, 401);
    try {
      const check = verify || (async (token) => {
        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Auth service not configured');
        const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
        return error ? null : data.user;
      });
      const user = await check(match[1]);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Portal unavailable.' }, 503);
      const data = await asCustomer(db, { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at },
        (client) => query(client, op, args));
      return json({ data });
    } catch (error) {
      if (['42501', 'P0002'].includes(error?.code)) return json({ error: 'Document not found or access denied.' }, 403);
      if (['23505', '23514', '22P02'].includes(error?.code)) return json({ error: 'This action could not be completed. Check the details and try again.' }, 400);
      log('portal-store: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Portal unavailable. Please try again.' }, 503);
    }
  };
}

export default makePortalStoreHandler();
export const config = { path: '/api/portal-store' };
