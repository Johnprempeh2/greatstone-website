// GSAM for Mac (P4): Stripe's webhook for GSAM subscriptions. Checks Stripe's signature (its own endpoint and secret,
// GSAM_STRIPE_WEBHOOK_SECRET), forwards the raw event unchanged to the hub signed with GSAM_BILLING_EVENTS_SECRET
// in Stripe's format, and keeps the licence key the hub returns once, encrypted, against the buying company.
// Idempotent on the event id. Any hub or database failure answers non-2xx so Stripe sends the event again.
import { getPool } from './lib/db.mjs';
import { asWorker } from './lib/worker-db.mjs';
import { verifyStripeSignature } from './stripe-webhook.mjs';
import { GSAM_SOURCE, encryptLicence, encryptionKey, signForHub } from './lib/gsam.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

// The events the hub acts on (fleet-billing.ts HANDLED_BILLING_EVENTS). Others are acknowledged and dropped here.
export const FORWARDED = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'invoice.paid',
  'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted']);

const idOf = (value) => (typeof value === 'string' ? value : value?.id) || null;
const isoOrNull = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

export function makeGsamWebhookHandler({ env = process.env, pool = getPool, fetchImpl = fetch,
  now = () => Math.floor(Date.now() / 1000), log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const hub = String(env.GSAM_HUB_URL || '').replace(/\/+$/, '');
    let key;
    try { key = encryptionKey(env.GSAM_LICENCE_ENCRYPTION_KEY); } catch { key = null; }
    if (!env.GSAM_STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || !env.GSAM_BILLING_EVENTS_SECRET
      || !/^https?:\/\//.test(hub) || !key) return json({ error: 'GSAM webhook unavailable.' }, 503);
    const body = await req.text();
    const event = verifyStripeSignature(body, req.headers.get('stripe-signature'), env.GSAM_STRIPE_WEBHOOK_SECRET, now());
    if (!event || event.livemode !== false || !/^evt_[A-Za-z0-9_]+$/.test(event.id || '')) return json({ error: 'Invalid test webhook.' }, 400);
    const object = event.data?.object || {};
    // Shop checkouts reach the shop's own webhook; only GSAM's subscription checkouts go to the hub.
    if (!FORWARDED.has(event.type) || (event.type.startsWith('checkout.session.') && object.metadata?.source !== GSAM_SOURCE))
      return json({ received: true, forwarded: false });
    const db = pool();
    if (!db) return json({ error: 'GSAM webhook unavailable.' }, 503);
    try {
      const seen = await asWorker(db, (client) => client.query('SELECT outcome FROM gsam_billing_events WHERE stripe_event_id=$1', [event.id]));
      if (seen.rows.length) return json({ received: true, duplicate: true });

      const response = await fetchImpl(hub + '/api/fleet/billing/events', {
        method: 'POST', body,
        headers: { 'content-type': 'application/json', 'stripe-signature': signForHub(body, env.GSAM_BILLING_EVENTS_SECRET, now()) },
      });
      if (!response.ok) {
        log('gsam-webhook: hub answered ' + response.status + ' for ' + event.type);
        return json({ error: 'GSAM hub unavailable.' }, 502);
      }
      const result = await response.json().catch(() => ({}));
      const stripeCustomerId = idOf(object.customer);
      const stored = await asWorker(db, async (client) => {
        const { rows } = stripeCustomerId && /^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)
          ? await client.query('SELECT id FROM customers WHERE stripe_customer_id=$1 AND deleted_at IS NULL', [stripeCustomerId])
          : { rows: [] };
        const customerId = rows[0]?.id || null;
        if (customerId && (result.licenceKey || result.validUntil)) {
          const licence = typeof result.licenceKey === 'string' && result.licenceKey ? encryptLicence(result.licenceKey, key, customerId) : null;
          // A new key replaces the old one; an event with no key keeps it. Paid-until only moves forward, as on the hub.
          await client.query(`INSERT INTO gsam_accounts (customer_id, stripe_customer_id, fleet_instance_id, licence_key_enc,
              licence_key_expires_at, valid_until) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (customer_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,
              fleet_instance_id=COALESCE(EXCLUDED.fleet_instance_id, gsam_accounts.fleet_instance_id),
              licence_key_enc=COALESCE(EXCLUDED.licence_key_enc, gsam_accounts.licence_key_enc),
              licence_key_expires_at=CASE WHEN EXCLUDED.licence_key_enc IS NULL THEN gsam_accounts.licence_key_expires_at
                ELSE EXCLUDED.licence_key_expires_at END,
              valid_until=GREATEST(gsam_accounts.valid_until, EXCLUDED.valid_until), updated_at=now()`,
          [customerId, stripeCustomerId, typeof result.instanceId === 'string' ? result.instanceId : null, licence,
            isoOrNull(result.licenceKeyExpiresAt), isoOrNull(result.validUntil)]);
        } else if (result.licenceKey) {
          // ponytail: the hub returns a key once and keeps only its hash. With no website company for this Stripe
          // customer it cannot be shown anywhere; a hub admin issues a new key for the install (hub follow-up).
          log('gsam-webhook: licence key for a Stripe customer with no website account; issue a new key on the hub');
        }
        await client.query(`INSERT INTO gsam_billing_events (stripe_event_id, type, customer_id, outcome) VALUES ($1,$2,$3,$4)
          ON CONFLICT (stripe_event_id) DO NOTHING`, [event.id, event.type, customerId, String(result.outcome || 'forwarded').slice(0, 200)]);
        return !!result.licenceKey && !!customerId;
      });
      return json({ received: true, outcome: result.outcome || null, licenceStored: stored });
    } catch (error) {
      // If the hub already returned a key, a retry gets "duplicate" without it: the log says so for the operator.
      log('gsam-webhook: failed (' + (error?.code || error?.name || 'error') + ') on ' + event.type + ' ' + event.id);
      return json({ error: 'GSAM webhook processing failed.' }, 500);
    }
  };
}

export default makeGsamWebhookHandler();
export const config = { path: '/api/gsam/stripe-webhook' };
