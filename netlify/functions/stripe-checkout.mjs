import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asCatalogueAnon } from './lib/catalogue-store.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { basketItems, priceBasket } from './lib/store-pricing.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function stripe(path, key, params, fetchImpl, idempotencyKey) {
  const response = await fetchImpl('https://api.stripe.com/v1/' + path, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, body: params,
  });
  if (!response.ok) throw new Error('Stripe API ' + response.status);
  return response.json();
}

export async function buyerForCheckout(pool, user, env, fetchImpl, log) {
  if (!user?.id || !UUID.test(user.id)) return null;
  const identity = authIdentity(user);
  try {
    const buyer = await asCustomer(pool, identity, async (client) => {
      const { rows: staff } = await client.query('SELECT id FROM users WHERE auth_subject=$1 AND deleted_at IS NULL', [identity.id]);
      if (staff.length) return null;
      const { rows } = await client.query(`SELECT cu.id AS user_id,cu.email,c.id AS customer_id,c.name,c.stripe_customer_id
        FROM customer_users cu JOIN customers c ON c.id=cu.customer_id
        WHERE cu.auth_subject=$1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL LIMIT 1`, [identity.id]);
      return rows[0] || null;
    });
    if (!buyer) return null;
    if (!buyer.stripe_customer_id) {
      const customer = await stripe('customers', env.STRIPE_SECRET_KEY, new URLSearchParams({
        email: buyer.email || identity.email || '', name: buyer.name || '', 'metadata[customer_id]': buyer.customer_id,
      }), fetchImpl, 'gs-cust-' + buyer.customer_id);
      if (!/^cus_[A-Za-z0-9]+$/.test(customer.id || '')) throw new Error('Invalid Stripe customer');
      buyer.stripe_customer_id = await asCustomer(pool, identity, async (client) => {
        const { rows } = await client.query(`UPDATE customers SET stripe_customer_id=$1
          WHERE id=app_customer_id() AND stripe_customer_id IS NULL RETURNING stripe_customer_id`, [customer.id]);
        if (rows.length) return rows[0].stripe_customer_id;
        const existing = await client.query('SELECT stripe_customer_id FROM customers WHERE id=app_customer_id()');
        return existing.rows[0]?.stripe_customer_id || null;
      });
    }
    return buyer;
  } catch (error) {
    log('stripe-checkout: buyer link failed (' + (error?.code || error?.name || 'error') + ')');
    return null; // The visitor can still use guest checkout.
  }
}

export function makeStripeCheckoutHandler({ env = process.env, pool = getPool, verify,
  fetchImpl = fetch, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) return json({ error: 'Test checkout unavailable.' }, 503);
    let body, basket;
    try { body = await req.json(); basket = basketItems(body?.items, 100); }
    catch { return json({ error: 'Invalid basket.' }, 400); }
    const origin = String(env.APP_SITE_ORIGIN || '').replace(/\/+$/, '');
    try { if (new URL(origin).protocol !== 'https:') return json({ error: 'Checkout unavailable.' }, 503); }
    catch { return json({ error: 'Checkout unavailable.' }, 503); }
    const email = body.customerEmail;
    if (email != null && (typeof email !== 'string' || email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))
      return json({ error: 'Invalid email.' }, 400);
    try {
      const db = pool();
      if (!db) return json({ error: 'Checkout unavailable.' }, 503);
      const priced = await asCatalogueAnon(db, (client) => priceBasket(client, basket));
      const dropped = [], lines = [];
      let subtotal = 0;
      for (const row of priced) {
        if (row.unavailable || !row.unit || row.unit < 0) {
          dropped.push({ variantId: row.id, name: row.offering_name ? `${row.offering_name} — ${row.name}` : null,
            reason: row.unavailable ? 'unavailable' : 'price_on_application' });
          continue;
        }
        subtotal += row.unit * row.qty;
        lines.push(row);
      }
      if (!lines.length) return json({ error: 'No purchasable items (all POA or unavailable — use Request a quote).', dropped }, 400);
      if (!Number.isSafeInteger(subtotal)) throw new Error('Invalid subtotal');
      const vatRate = Number(env.VAT_RATE ?? '0.20');
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) throw new Error('Invalid VAT rate');
      const vat = Math.round(subtotal * vatRate);
      const user = await userFromRequest(req, verify).catch(() => null);
      const buyer = await buyerForCheckout(db, user, env, fetchImpl, log);
      const params = new URLSearchParams({ mode: 'payment',
        success_url: origin + '/#order-confirmed?session={CHECKOUT_SESSION_ID}', cancel_url: origin + '/#shop',
        'metadata[source]': 'greatstone-store', 'metadata[customer_id]': buyer?.customer_id || '',
        'metadata[customer_user_id]': buyer?.user_id || '', 'metadata[customer_email]': buyer?.email || email || '' });
      if (buyer?.stripe_customer_id) {
        params.set('customer', buyer.stripe_customer_id);
        params.set('payment_intent_data[setup_future_usage]', 'off_session');
      } else if (email) params.set('customer_email', email);
      const appendLine = (index, row) => {
        const prefix = `line_items[${index}]`;
        params.set(`${prefix}[quantity]`, String(row.qty));
        params.set(`${prefix}[price_data][currency]`, 'gbp');
        params.set(`${prefix}[price_data][unit_amount]`, String(row.unit));
        params.set(`${prefix}[price_data][product_data][name]`, row.name);
        if (row.id) {
          params.set(`${prefix}[price_data][product_data][metadata][variant_id]`, row.id);
          params.set(`${prefix}[price_data][product_data][metadata][vendor]`, row.vendor_name || '');
          params.set(`${prefix}[price_data][product_data][metadata][applied_rule_id]`, row.ruleId || '');
        }
      };
      lines.forEach((row, index) => appendLine(index, row));
      if (vat > 0) appendLine(lines.length, { qty: 1, unit: vat, name: `UK VAT (${Math.round(vatRate * 100)}%)` });
      const session = await stripe('checkout/sessions', env.STRIPE_SECRET_KEY, params, fetchImpl);
      if (!/^cs_test_[A-Za-z0-9]+$/.test(session.id || '') || !/^https:\/\//.test(session.url || '') || session.livemode !== false)
        throw new Error('Invalid test session');
      return json({ url: session.url, id: session.id, dropped });
    } catch (error) {
      log('stripe-checkout: failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Could not start checkout. Please try again or request a quote.' }, 503);
    }
  };
}

export default makeStripeCheckoutHandler();
export const config = { path: '/api/stripe-checkout' };
