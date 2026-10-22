import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asCustomer, customerStore } from './lib/customer-store.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const OPS = new Set(['ensure', 'profile', 'members', 'invite-requests', 'request-invite', 'order-keys', 'orders', 'org-orders', 'quotes', 'org-quotes', 'invoice', 'update-profile', 'update-company']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// pg returns BIGINT as text; the existing store calculations expect safe JavaScript numbers.
function moneyNumbers(value) {
  if (Array.isArray(value)) return value.map(moneyNumbers);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key.endsWith('_minor') && typeof item === 'string' && Number.isSafeInteger(Number(item))) return [key, Number(item)];
    return [key, moneyNumbers(item)];
  }));
  return value;
}

export function makeCustomerStoreHandler({ pool = getPool, query = customerStore, verify, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const { op, args = {} } = body || {};
    if (!OPS.has(op) || !args || typeof args !== 'object' || Array.isArray(args)) return json({ error: 'Invalid operation.' }, 400);
    if (op === 'invoice' && !UUID.test(args.orderId || '')) return json({ error: 'Invalid order.' }, 400);
    if (['ensure', 'update-profile', 'update-company'].includes(op)) {
      const fields = op === 'ensure' ? ['companyName', 'fullName'] : op === 'update-profile' ? ['fullName', 'phone'] : ['name', 'domain', 'notes'];
      if (fields.some((key) => args[key] != null && (typeof args[key] !== 'string' || args[key].length > 500)))
        return json({ error: 'Invalid profile details.' }, 400);
      if (op === 'update-company' && !String(args.name || '').trim()) return json({ error: 'Company name required.' }, 400);
    }
    if (op === 'request-invite' && (
      typeof args.email !== 'string' || args.email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email) ||
      !['member', 'admin'].includes(args.role) ||
      ['fullName', 'note'].some((key) => args[key] != null && (typeof args[key] !== 'string' || args[key].length > 500))
    )) return json({ error: 'Invalid invitation details.' }, 400);
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '');
    if (!match) return json({ error: 'Sign in required.' }, 401);
    try {
      const check = verify || (async (token) => {
        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Auth service not configured');
        const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
        if (error) return null;
        return data.user;
      });
      const user = await check(match[1]);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Account service unavailable.' }, 503);
      const identity = { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at };
      const data = await asCustomer(db, identity, (client) => query(client, op, { ...args, subject: identity.id }));
      return json({ data: moneyNumbers(data) });
    } catch (error) {
      if (error?.code === '23505') return json({ error: 'A request for this email is already pending.', code: '23505' }, 409);
      log('customer-store: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Account service unavailable. Please try again.' }, 503);
    }
  };
}

export default makeCustomerStoreHandler();
export const config = { path: '/api/customer-store' };
