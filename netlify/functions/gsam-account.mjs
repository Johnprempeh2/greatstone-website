// GSAM for Mac (P4): the "My GSAM" page's data for the signed-in customer. Status, modules and period end come live
// from Stripe; the licence key is decrypted only when asked for (?reveal=1), and only for the customer's own row (RLS).
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { catalogueFor, currentSubscription, decryptLicence, encryptionKey, loadCatalogue, periodEnd } from './lib/gsam.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export function makeGsamAccountHandler({ env = process.env, pool = getPool, verify, fetchImpl = fetch, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'GET') return json({ error: 'Use GET.' }, 405);
    if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) return json({ error: 'GSAM accounts are not open yet.' }, 503);
    try {
      const user = await userFromRequest(req, verify).catch(() => null);
      if (!user?.id) return json({ error: 'Sign in to see your GSAM.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'GSAM accounts are unavailable.' }, 503);
      const account = await asCustomer(db, authIdentity(user), async (client) => {
        const { rows } = await client.query(`SELECT c.id, c.stripe_customer_id, g.licence_key_enc, g.licence_key_expires_at, g.valid_until
          FROM customer_users cu JOIN customers c ON c.id=cu.customer_id LEFT JOIN gsam_accounts g ON g.customer_id=c.id
          WHERE cu.auth_subject=$1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL LIMIT 1`, [user.id]);
        return rows[0] || null;
      });
      if (!account) return json({ error: 'No customer account found.' }, 404);
      const items = await loadCatalogue(env, fetchImpl);
      const sub = account.stripe_customer_id ? await currentSubscription(env, account.stripe_customer_id, fetchImpl) : null;
      const byPrice = new Map(items.flatMap((item) => Object.values(item.prices || {}).map((price) => [price.id, item.name])));
      let licenceKey;
      if (new URL(req.url).searchParams.get('reveal') === '1' && account.licence_key_enc)
        licenceKey = decryptLicence(account.licence_key_enc, encryptionKey(env.GSAM_LICENCE_ENCRYPTION_KEY), account.id);
      return json({
        catalogue: catalogueFor(items, account.stripe_customer_id),
        downloadUrl: env.GSAM_DMG_URL || null,
        // GSAM for Windows (W5): one link per platform; My GSAM picks one from the browser.
        downloads: { mac: env.GSAM_DMG_URL || null, windows: env.GSAM_WINDOWS_INSTALLER_URL || null },
        subscription: sub ? {
          status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end === true,
          interval: sub.items?.data?.[0]?.price?.recurring?.interval || null,
          modules: (sub.items?.data || []).map((item) => byPrice.get(item.price?.id) || item.price?.nickname || 'Unlisted item'),
          paidUntil: account.valid_until ? new Date(account.valid_until).toISOString() : periodEnd(sub),
        } : null,
        licence: account.licence_key_enc ? { ready: true, expiresAt: account.licence_key_expires_at || null, ...(licenceKey ? { key: licenceKey } : {}) } : null,
      });
    } catch (error) {
      log('gsam-account: failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Could not load your GSAM account. Please try again.' }, 503);
    }
  };
}

export default makeGsamAccountHandler();
export const config = { path: '/api/gsam/account' };
