import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asStaff } from './lib/staff-store.mjs';
import { buildLicenceEmail } from '../../src/lib/licence-email.mjs';
import { activationInstructionsFor } from '../../src/lib/activation-match.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeNotifyLicenceIssuedHandler({ env = process.env, pool = getPool, verify, fetchImpl = fetch, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '');
    if (!match) return json({ error: 'Staff sign in required.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!UUID.test(body?.order_id || '')) return json({ error: 'Invalid order.' }, 400);
    try {
      const check = verify || (async (token) => {
        const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
        const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Auth service not configured');
        const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
        return error ? null : data.user;
      });
      const user = await check(match[1]);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Staff sign in required.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Email service unavailable.' }, 503);
      const result = await asStaff(db, { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at }, async (client) => {
        const { rows: staff } = await client.query('SELECT id FROM users WHERE auth_subject=$1 AND deleted_at IS NULL', [user.id]);
        if (!staff.length) return { forbidden: true };
        const { rows: orders } = await client.query('SELECT id,reference,customer_email FROM orders WHERE id=$1 AND deleted_at IS NULL', [body.order_id]);
        if (!orders.length) return { missing: true };
        const { rows: keys } = await client.query('SELECT offering_name,variant_name FROM licence_keys WHERE order_id=$1 AND deleted_at IS NULL', [body.order_id]);
        const { rows: vendors } = await client.query('SELECT name,activation_instructions FROM vendors WHERE deleted_at IS NULL AND activation_instructions IS NOT NULL');
        return { order: orders[0], items: keys.map((item) => ({ ...item, activation: activationInstructionsFor(item.offering_name, vendors) })) };
      });
      if (result.forbidden) return json({ error: 'Staff only.' }, 403);
      if (result.missing) return json({ error: 'Order not found.' }, 404);
      if (!result.order.customer_email) return json({ sent: false, skipped: 'no customer email on the order' });
      if (!env.RESEND_API_KEY) return json({ sent: false, skipped: 'RESEND_API_KEY not set' });
      const message = buildLicenceEmail({ items: result.items, orderRef: result.order.reference || '',
        accountUrl: String(env.APP_SITE_ORIGIN || 'https://greatstoneint.com').replace(/\/+$/, '') + '/#account' });
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env.RESEND_FROM, to: result.order.customer_email, ...message }),
      });
      if (!response.ok) return json({ sent: false, error: 'Email could not be sent.' }, 502);
      return json({ sent: true });
    } catch (error) {
      log('notify-licence-issued: failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Email service unavailable. Please try again.' }, 503);
    }
  };
}

export default makeNotifyLicenceIssuedHandler();
export const config = { path: '/api/notify-licence-issued' };
