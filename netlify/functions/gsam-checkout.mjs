// GSAM for Mac (P4): start a Stripe Checkout (subscription mode, test keys only) for the signed-in customer's pick.
// One GSAM subscription per customer: a customer who already has one changes modules in the Stripe customer portal.
import { userFromRequest } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { buyerForCheckout } from './stripe-checkout.mjs';
import { checkoutParams, currentSubscription, isLive, loadCatalogue, stripeRequest } from './lib/gsam.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export function makeGsamCheckoutHandler({ env = process.env, pool = getPool, verify, fetchImpl = fetch, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) return json({ error: 'Checkout unavailable.' }, 503);
    const origin = String(env.APP_SITE_ORIGIN || '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(origin)) return json({ error: 'Checkout unavailable.' }, 503);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    try {
      const user = await userFromRequest(req, verify).catch(() => null);
      if (!user?.id) return json({ error: 'Sign in to buy GSAM.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Checkout unavailable.' }, 503);
      const buyer = await buyerForCheckout(db, user, env, fetchImpl, log);
      if (!buyer?.stripe_customer_id) return json({ error: 'This account cannot buy GSAM. Sign in with a customer account.' }, 403);
      if (isLive(await currentSubscription(env, buyer.stripe_customer_id, fetchImpl)))
        return json({ error: 'You already have GSAM. Change your modules with Manage billing.' }, 409);
      let params;
      try {
        params = checkoutParams({ items: await loadCatalogue(env, fetchImpl), itemIds: body?.itemIds, interval: body?.interval,
          stripeCustomerId: buyer.stripe_customer_id, customerId: buyer.customer_id, origin });
      } catch (error) { return json({ error: error.message }, 400); }
      const session = await stripeRequest('POST', 'checkout/sessions', env.STRIPE_SECRET_KEY, params, fetchImpl);
      if (!/^cs_test_[A-Za-z0-9]+$/.test(session.id || '') || !/^https:\/\//.test(session.url || '') || session.livemode !== false)
        throw new Error('Invalid test session');
      return json({ url: session.url });
    } catch (error) {
      log('gsam-checkout: failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Could not start checkout. Please try again.' }, 503);
    }
  };
}

export default makeGsamCheckoutHandler();
export const config = { path: '/api/gsam/checkout' };
