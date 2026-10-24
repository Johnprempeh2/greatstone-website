import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { buyerForCheckout } from './stripe-checkout.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeStripePortalHandler({ env = process.env, pool = getPool, verify, fetchImpl = fetch, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) return json({ error: 'Billing portal unavailable.' }, 503);
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '');
    if (!match) return json({ error: 'Sign in to manage billing.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const origin = String(env.APP_SITE_ORIGIN || '').replace(/\/+$/, '');
    if (!origin || body?.returnUrl !== origin + '/#account') return json({ error: 'Invalid return URL.' }, 400);
    try {
      const check = verify || (async (token) => {
        const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
        const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Auth service not configured');
        const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
        return error ? null : data.user;
      });
      const user = await check(match[1]);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Sign in to manage billing.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Billing portal unavailable.' }, 503);
      const identity = { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at };
      const account = await asCustomer(db, identity, async (client) => {
        const { rows: staff } = await client.query('SELECT id FROM users WHERE auth_subject=$1 AND deleted_at IS NULL', [user.id]);
        if (staff.length) return { staff: true };
        const { rows } = await client.query(`SELECT c.id,c.name,c.stripe_customer_id,cu.email FROM customer_users cu
          JOIN customers c ON c.id=cu.customer_id WHERE cu.auth_subject=$1 AND cu.deleted_at IS NULL
          AND c.deleted_at IS NULL LIMIT 1`, [user.id]);
        return rows[0] || null;
      });
      if (account?.staff) return json({ error: 'Staff accounts have no customer billing portal.' }, 403);
      if (!account) return json({ error: 'No customer account found.' }, 404);
      if (!account.stripe_customer_id) {
        const buyer = await buyerForCheckout(db, user, env, fetchImpl, log);
        account.stripe_customer_id = buyer?.stripe_customer_id;
      }
      if (!account.stripe_customer_id) return json({ error: 'Billing portal is not ready for this account.' }, 503);
      if (!/^cus_[A-Za-z0-9]+$/.test(account.stripe_customer_id)) throw new Error('Invalid Stripe customer id');
      const form = new URLSearchParams({ customer: account.stripe_customer_id, return_url: body.returnUrl });
      const response = await fetchImpl('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST', headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (!response.ok) throw new Error('Stripe portal ' + response.status);
      const session = await response.json();
      if (!/^https:\/\//.test(session.url || '')) throw new Error('Invalid portal session');
      return json({ url: session.url });
    } catch (error) {
      log('stripe-portal: failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Billing portal unavailable. Please try again.' }, 503);
    }
  };
}

export default makeStripePortalHandler();
export const config = { path: '/api/stripe-portal' };
