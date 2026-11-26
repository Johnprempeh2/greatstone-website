// What follows a placed shop order (GRE-6336): the Pipedrive deal for every order, and for a PO order its
// confirmation email (a card order's is sent by stripe-webhook). Runs after the order's transaction commits, as the
// worker role, and never throws: a CRM or mail failure is logged and the order stands.
import { asWorker } from './worker-db.mjs';
import { crmConfig } from './shared/front-door-crm.mjs';
import { syncOrderToCrm } from './shared/order-crm.mjs';
import { sendEmail } from './shared/front-door-leads.mjs';
import { buildOrderConfirmationEmail } from '../../../src/lib/order-confirmation-email.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The order as the CRM and the email need it. A PO order is one made from a quote (it has quote_id).
export async function loadOrder(client, { id, reference }) {
  const { rows: [o] } = await client.query(`SELECT o.id, o.reference, o.invoice_number, o.po_reference, o.quote_id,
      o.customer_email, o.currency, o.subtotal_minor, o.total_minor, q.contact_name, q.contact_company,
      c.name AS customer_name, cu.full_name AS user_name
    FROM orders o LEFT JOIN quotes q ON q.id = o.quote_id LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN customer_users cu ON cu.id = o.customer_user_id
    WHERE ${id ? 'o.id = $1::uuid' : 'o.reference = $1'} AND o.deleted_at IS NULL LIMIT 1`, [id || reference]);
  if (!o) return null;
  const { rows: items } = await client.query(`SELECT offering_name, variant_name, variant_id, qty, unit_price_minor,
      line_total_minor FROM order_items WHERE order_id = $1 ORDER BY offering_name, variant_name`, [o.id]);
  return {
    id: o.id, kind: o.quote_id ? 'po' : 'card', reference: o.reference, invoiceNumber: o.invoice_number,
    poReference: o.po_reference, email: o.customer_email, name: o.contact_name || o.user_name,
    company: o.contact_company || o.customer_name, currency: o.currency || 'GBP',
    subtotalMinor: Number(o.subtotal_minor), totalMinor: Number(o.total_minor),
    items: items.map((it) => ({ offering_name: it.offering_name, variant_name: it.variant_name, variant_id: it.variant_id,
      qty: it.qty, unit_minor: Number(it.unit_price_minor), line_total_minor: Number(it.line_total_minor) })),
  };
}

export function orderFollowUp({ env = process.env, fetchImpl = (...a) => fetch(...a), send = sendEmail, log = console.error } = {}) {
  // Pushes one order to Pipedrive. `where` is { id } or { reference }. Resolves to syncOrderToCrm's answer.
  const crm = async (pool, where) => {
    const config = crmConfig(env);
    if (!config) return { synced: false, reason: 'not configured' };
    try {
      const order = await asWorker(pool, (client) => loadOrder(client, where));
      if (!order) return { synced: false, reason: 'no order' };
      const stamp = (sql, params) => asWorker(pool, (client) => client.query(sql, params));
      const out = await syncOrderToCrm({ config, order, fetchImpl,
        claim: async () => ((await stamp(`UPDATE orders SET pipedrive_synced_at = now()
          WHERE id = $1 AND pipedrive_synced_at IS NULL RETURNING id`, [order.id])).rowCount ? 'claimed' : 'taken'),
        release: () => stamp('UPDATE orders SET pipedrive_synced_at = NULL WHERE id = $1', [order.id]),
        save: ({ personId, orgId, dealId }) => stamp(`UPDATE orders SET pipedrive_person_id = $2, pipedrive_org_id = $3,
          pipedrive_deal_id = $4 WHERE id = $1`, [order.id, personId, orgId, dealId]) });
      if (!out.synced) log('order-follow-up: pipedrive not synced (' + out.reason + ')');
      return out;
    } catch (error) {
      log('order-follow-up: pipedrive failed (' + (error?.code || error?.name || 'error') + ')');
      return { synced: false, reason: 'failed' };
    }
  };

  // A PO order's invoice was issued: its confirmation email, then the deal. Resolves to { email, crm }.
  const poPlaced = async (pool, orderId) => {
    if (!UUID.test(orderId || '')) return { email: 'not_sent', crm: 'not_synced' };
    let email = 'not_configured';
    try {
      const order = await asWorker(pool, (client) => loadOrder(client, { id: orderId }));
      if (order && order.email && env.RESEND_API_KEY && env.RESEND_FROM) {
        const message = buildOrderConfirmationEmail({ kind: 'po', reference: order.reference, invoiceNumber: order.invoiceNumber,
          poReference: order.poReference, customerName: order.name, items: order.items, subtotalMinor: order.subtotalMinor,
          totalMinor: order.totalMinor, currency: order.currency, siteOrigin: env.APP_SITE_ORIGIN });
        const result = await send({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, replyTo: env.RESEND_REPLY_TO,
          to: order.email, ...message });
        email = result.sent === true ? 'sent' : 'not_sent';
      }
    } catch (error) {
      email = 'not_sent';
      log('order-follow-up: PO order email failed (' + (error?.code || error?.name || 'error') + ')');
    }
    const out = await crm(pool, { id: orderId });
    return { email, crm: out.synced ? 'synced' : 'not_synced' };
  };

  return { crm, poPlaced };
}
