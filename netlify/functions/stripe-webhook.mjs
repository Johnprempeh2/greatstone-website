import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPool } from './lib/db.mjs';
import { buildOrderConfirmationEmail } from '../../src/lib/order-confirmation-email.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = (value) => UUID.test(value || '') ? value : null;
const ORG = '11111111-1111-4111-8111-111111111111';

// Stripe signs timestamp + a full stop + the unparsed request body. Accept rotated v1 signatures,
// compare in constant time, and reject payloads outside Stripe's five minute replay window.
export function verifyStripeSignature(body, header, secret, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret || typeof body !== 'string') return null;
  const parts = header.split(',').map((part) => part.trim().split('='));
  const stamp = parts.find(([key]) => key === 't')?.[1];
  const at = Number(stamp);
  if (!Number.isSafeInteger(at) || Math.abs(now - at) > 300) return null;
  const digest = createHmac('sha256', secret).update(`${at}.${body}`).digest();
  const valid = parts.some(([key, value]) => {
    if (key !== 'v1' || !/^[0-9a-f]{64}$/i.test(value || '')) return false;
    return timingSafeEqual(digest, Buffer.from(value, 'hex'));
  });
  if (!valid) return null;
  try { return JSON.parse(body); } catch { return null; }
}

async function asWorker(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ role: 'service_role', sub: null, email: null, email_verified: false })]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* connection lost */ }
    throw error;
  } finally { client.release(); }
}

async function stripeGet(path, key, fetchImpl) {
  const response = await fetchImpl('https://api.stripe.com/v1/' + path, {
    headers: { authorization: 'Bearer ' + key },
  });
  if (!response.ok) throw new Error('Stripe API ' + response.status);
  return response.json();
}

async function recordOrder(pool, session, key, fetchImpl) {
  if (session.payment_status !== 'paid') return false;
  if (!/^cs_test_[A-Za-z0-9]+$/.test(session.id || '')) throw new Error('Invalid test session');
  const lines = await stripeGet(`checkout/sessions/${session.id}/line_items?limit=100&expand%5B%5D=data.price.product`, key, fetchImpl);
  if (lines.has_more) throw new Error('Checkout has more than 100 lines');
  const ids = [...new Set((lines.data || []).map((line) => line.price?.product?.metadata?.variant_id).filter((id) => UUID.test(id || '')))];
  const currency = String(session.currency || 'gbp').toUpperCase();
  const total = Number(session.amount_total || 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid session total');
  const metadata = session.metadata || {};
  return asWorker(pool, async (client) => {
    const { rows: variants } = ids.length ? await client.query(`SELECT v.id, v.name, o.id AS offering_id, o.name AS offering_name, o.org_id
      FROM offering_variants v JOIN offerings o ON o.id=v.offering_id WHERE v.id = ANY($1::uuid[])`, [ids]) : { rows: [] };
    const byId = new Map(variants.map((row) => [row.id, row]));
    const org = variants[0]?.org_id || ORG;
    if (variants.some((row) => row.org_id !== org)) throw new Error('Mixed organisations in checkout');
    const items = []; let subtotal = 0;
    for (const line of lines.data || []) {
      const product = line.price?.product;
      const variantId = product?.metadata?.variant_id;
      if (!variantId) continue; // VAT is a separate line, never an order item.
      const variant = byId.get(variantId);
      if (!variant) throw new Error('Purchased variant is unavailable');
      const qty = Number(line.quantity || 1);
      const unit = Number(line.price?.unit_amount || 0);
      const amount = Number(line.amount_subtotal ?? unit * qty);
      if (![qty, unit, amount].every(Number.isSafeInteger) || qty < 1 || unit < 0 || amount < 0)
        throw new Error('Invalid checkout line');
      subtotal += amount;
      items.push({ variant, qty, unit, amount, ruleId: optionalId(product.metadata?.applied_rule_id) });
    }
    const { rows } = await client.query(`INSERT INTO orders
      (org_id,reference,status,currency,subtotal_minor,total_minor,placed_at,customer_id,customer_user_id,customer_email,stripe_payment_intent)
      VALUES ($1,$2,'confirmed',$3,$4,$5,now(),$6,$7,$8,$9)
      ON CONFLICT (org_id,reference) DO NOTHING RETURNING id`,
    [org, session.id, currency, subtotal, total, optionalId(metadata.customer_id), optionalId(metadata.customer_user_id),
      metadata.customer_email || session.customer_details?.email || session.customer_email || null,
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null]);
    // The quote was stored before the visitor left for Stripe. Link it only once payment is
    // confirmed. On cancelled or failed payments the same enquiry remains available to the team.
    // $1 is cast because jsonb_build_object takes "any", so Postgres cannot infer its type (42P08).
    const { rows: inquiryTable } = await client.query("SELECT to_regclass('public.service_inquiries') AS name");
    if (inquiryTable[0]?.name) await client.query(`UPDATE service_inquiries
      SET message = concat_ws(E'\n', nullif(message, ''), 'Paid order reference: ' || $1::text)
      WHERE services @> jsonb_build_array(jsonb_build_object('checkoutSessionId', $1::text))
        AND position('Paid order reference: ' || $1::text in coalesce(message, '')) = 0`, [session.id]);
    if (!rows.length) return null;
    for (const item of items) {
      await client.query(`INSERT INTO order_items
        (org_id,order_id,offering_id,variant_id,applied_rule_id,offering_name,variant_name,qty,unit_price_minor,line_total_minor,currency)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [org, rows[0].id, item.variant.offering_id, item.variant.id, item.ruleId, item.variant.offering_name,
        item.variant.name, item.qty, item.unit, item.amount, currency]);
    }
    return { reference: session.id, email: metadata.customer_email || session.customer_details?.email || session.customer_email || null,
      currency, subtotal, total, items: items.map((item) => ({ offering_name: item.variant.offering_name,
        variant_name: item.variant.name, qty: item.qty, line_total_minor: item.amount })) };
  });
}

async function recordRefund(pool, charge) {
  const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!intent) return;
  const refunded = Number(charge.amount_refunded || 0);
  if (!Number.isSafeInteger(refunded) || refunded < 0) throw new Error('Invalid refund');
  await asWorker(pool, (client) => client.query(`UPDATE orders SET refunded_minor=$2,
    status=CASE WHEN $2 >= total_minor AND $2 > 0 THEN 'refunded' ELSE status END
    WHERE stripe_payment_intent=$1 AND deleted_at IS NULL`, [intent, refunded]));
}

async function sendOrderEmail(order, env, fetchImpl) {
  if (!order?.email || !env.RESEND_API_KEY) return;
  const message = buildOrderConfirmationEmail({ reference: order.reference, items: order.items,
    subtotalMinor: order.subtotal, totalMinor: order.total, currency: order.currency, siteOrigin: env.APP_SITE_ORIGIN });
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM, to: order.email, ...message }),
  });
  if (!response.ok) throw new Error('Resend ' + response.status);
}

export function makeStripeWebhookHandler({ env = process.env, pool = getPool, fetchImpl = fetch,
  now = () => Math.floor(Date.now() / 1000), log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))
      return json({ error: 'Test webhook unavailable.' }, 503);
    const body = await req.text();
    const event = verifyStripeSignature(body, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, now());
    if (!event || event.livemode !== false) return json({ error: 'Invalid test webhook.' }, 400);
    try {
      const db = pool();
      if (!db) return json({ error: 'Order service unavailable.' }, 503);
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        const order = await recordOrder(db, event.data.object, env.STRIPE_SECRET_KEY, fetchImpl);
        try { await sendOrderEmail(order, env, fetchImpl); } catch (error) { log('stripe-webhook: order email failed (' + error.name + ')'); }
      } else if (event.type === 'charge.refunded') await recordRefund(db, event.data.object);
      return json({ received: true });
    } catch (error) {
      log('stripe-webhook: processing failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Order processing unavailable.' }, 500); // Stripe retries; the order insert is idempotent.
    }
  };
}

export default makeStripeWebhookHandler();
export const config = { path: '/api/stripe-webhook' };
