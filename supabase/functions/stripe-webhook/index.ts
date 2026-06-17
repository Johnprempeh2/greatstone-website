// Stripe webhook → orders (Supabase Edge Function, Deno). TEST MODE.
// On checkout.session.completed: verify the signature, look up what was bought (variant ids stamped
// on each line item's product metadata by stripe-checkout), and persist an order + order_items via
// service_role. Idempotent: orders.reference = Stripe session id with UNIQUE(org_id, reference), so a
// re-delivered event is a no-op. Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from 'https://esm.sh/stripe@17.0.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient(), apiVersion: '2024-06-20' });
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const WHSEC = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const FALLBACK_ORG = Deno.env.get('APP_ORG_ID') ?? '11111111-1111-4111-8111-111111111111';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const sig = req.headers.get('stripe-signature');
  const body = await req.text(); // raw body — must not be parsed before verification
  let event: Stripe.Event;
  try {
    if (!sig || !WHSEC) throw new Error('missing signature or webhook secret');
    event = await stripe.webhooks.constructEventAsync(body, sig, WHSEC); // async: Deno SubtleCrypto
  } catch (e) {
    return new Response(JSON.stringify({ error: 'signature: ' + String((e as Error).message) }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':              // card: already paid. async methods: payment_status='unpaid' → recordOrder skips, books on async_payment_succeeded.
      case 'checkout.session.async_payment_succeeded': // delayed method (bank debit etc.) cleared
        await recordOrder(event.data.object as Stripe.Checkout.Session); break;
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        console.warn('checkout', event.type, (event.data.object as Stripe.Checkout.Session).id); break;
      case 'charge.refunded':                          // refund issued in Stripe → reconcile back to the order
        await recordRefund(event.data.object as Stripe.Charge); break;
      default: break; // ignore other event types
    }
  } catch (e) {
    // Return 500 so Stripe retries (with backoff, up to ~3 days). This is safe — the order write is
    // idempotent on the session id — so a transient DB/network failure recovers on a later delivery
    // instead of silently losing the order. Only Stripe (holding the signing secret) can reach here.
    console.error('webhook handler error:', (e as Error).message);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'content-type': 'application/json' } });
});

async function recordOrder(session: Stripe.Checkout.Session) {
  const sessionId = session.id;
  // checkout.session.completed also fires for async methods that haven't cleared yet — don't book those
  // as confirmed (a later async_payment_succeeded would; card payments arrive here already 'paid').
  if (session.payment_status === 'unpaid') { console.log('session not paid yet, skipping:', sessionId); return; }
  const currency = (session.currency || 'gbp').toUpperCase();
  const totalMinor = session.amount_total ?? 0;
  const email = session.customer_details?.email || (session as any).customer_email || null;
  // buyer linkage stamped into session.metadata by stripe-checkout (empty for guests)
  const md: any = session.metadata || {};
  const customerId = md.customer_id || null;
  const customerUserId = md.customer_user_id || null;
  const customerEmail = md.customer_email || email || null;

  // line items carry the variant id on each ad-hoc product's metadata (set in stripe-checkout)
  const li = await stripe.checkout.sessions.listLineItems(sessionId, { expand: ['data.price.product'], limit: 100 });
  const variantIds: string[] = [];
  for (const item of li.data) {
    const p = item.price?.product;
    const vid = (p && typeof p === 'object') ? (p as Stripe.Product).metadata?.variant_id : null;
    if (vid) variantIds.push(vid);
  }
  // resolve real offering/variant names + org from the DB (don't trust Stripe product names)
  const { data: variants } = variantIds.length
    ? await supabase.from('offering_variants').select('id, name, offering:offerings(id, name, org_id)').in('id', variantIds)
    : { data: [] as any[] };
  const vmap = new Map((variants || []).map((v: any) => [v.id, v]));
  const orgId = (variants && (variants[0] as any)?.offering?.org_id) || FALLBACK_ORG;

  const items: any[] = []; let subtotal = 0;
  for (const item of li.data) {
    const p = item.price?.product;
    const vid = (p && typeof p === 'object') ? (p as Stripe.Product).metadata?.variant_id : null;
    if (!vid) continue; // VAT / non-variant line — counted in total, not an order item
    const ruleId = (p && typeof p === 'object') ? ((p as Stripe.Product).metadata?.applied_rule_id || null) : null; // discount provenance
    const v: any = vmap.get(vid);
    const qty = item.quantity || 1;
    const unit = item.price?.unit_amount ?? 0;
    const lineTotal = item.amount_subtotal ?? unit * qty;
    subtotal += lineTotal;
    items.push({
      org_id: orgId, offering_id: v?.offering?.id || null, variant_id: vid, applied_rule_id: ruleId,
      offering_name: v?.offering?.name || (typeof p === 'object' ? (p as Stripe.Product).name : 'Licence'),
      variant_name: v?.name || null, qty, unit_price_minor: unit, line_total_minor: lineTotal, currency,
    });
  }

  // idempotent: ON CONFLICT (org_id, reference) DO NOTHING → null row means it was already recorded
  const { data: inserted, error } = await supabase.from('orders')
    .upsert({ org_id: orgId, reference: sessionId, status: 'confirmed', currency, subtotal_minor: subtotal, total_minor: totalMinor, placed_at: new Date().toISOString(),
              customer_id: customerId, customer_user_id: customerUserId, customer_email: customerEmail,
              stripe_payment_intent: (typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as any)?.id) ?? null },
      { onConflict: 'org_id,reference', ignoreDuplicates: true })
    .select('id').maybeSingle();
  if (error) throw error;
  if (!inserted) { console.log('order already recorded for', sessionId); return; }
  if (items.length) {
    const { error: iErr } = await supabase.from('order_items').insert(items.map((it) => ({ ...it, order_id: inserted.id })));
    if (iErr) throw iErr;
  }
  console.log('recorded order', inserted.id, '· items', items.length, '· total', totalMinor, currency, '· email', customerEmail || '(none)');
  // Confirmation email — only on a NEW order (retries return early above, so never doubles). Never throws.
  await sendOrderEmail({ to: customerEmail, reference: sessionId, items, subtotal, total: totalMinor, currency }).catch((e) => console.error('order email failed:', (e as Error).message));
}

// Reconcile a Stripe refund (issued in the dashboard) back to the order. Maps charge → order via the
// stored payment intent. Idempotent: refunded_minor is set to the absolute amount_refunded, so a
// re-delivered event is a no-op. Full refund → status 'refunded'; partial leaves status, records amount.
async function recordRefund(charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent as any)?.id;
  if (!pi) { console.log('refund: charge has no payment_intent'); return; }
  const refunded = charge.amount_refunded ?? 0;
  const { data: order } = await supabase.from('orders').select('id, total_minor').eq('stripe_payment_intent', pi).is('deleted_at', null).maybeSingle();
  if (!order) { console.log('refund: no matching order for payment_intent', pi); return; }
  const patch: any = { refunded_minor: refunded };
  if (refunded >= order.total_minor && refunded > 0) patch.status = 'refunded';
  const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
  if (error) throw error;
  console.log('refund recorded · order', order.id, '· refunded', refunded, refunded >= order.total_minor ? '(full)' : '(partial)');
}

// Transactional-ish order confirmation via Resend (HTTP). No-ops cleanly if RESEND_API_KEY is unset,
// so the webhook + order capture never depend on email being configured. Set RESEND_API_KEY + RESEND_FROM
// (a verified sender, e.g. "Greatstone <orders@greatstonesoftware.co.uk>") to switch it on.
async function sendOrderEmail(o: { to: string | null; reference: string; items: any[]; subtotal: number; total: number; currency: string }) {
  const KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM') || 'Greatstone <onboarding@resend.dev>';
  if (!KEY) { console.log('order email skipped — RESEND_API_KEY not set'); return; }
  if (!o.to) { console.log('order email skipped — no customer email'); return; }
  const money = (m: number) => '£' + (m / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = o.items.map((it) => `<tr><td style="padding:6px 0;color:#cfd3cb">${it.offering_name}${it.variant_name ? ' · ' + it.variant_name : ''} ×${it.qty}</td><td style="padding:6px 0;text-align:right;color:#fff">${money(it.line_total_minor)}</td></tr>`).join('');
  const vat = o.total - o.subtotal;
  const html = `<div style="background:#1f1f1f;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:#c8ff00">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">Thanks for your order</h1>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 18px">Order reference <b style="color:#fff">${o.reference}</b>. Your licence keys will be issued by our team and will appear in your account, normally within one business day.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
      <tr><td style="padding:10px 0 0;border-top:1px solid #333;color:#b0b0b0">Subtotal (ex VAT)</td><td style="padding:10px 0 0;border-top:1px solid #333;text-align:right;color:#b0b0b0">${money(o.subtotal)}</td></tr>
      <tr><td style="color:#b0b0b0">VAT</td><td style="text-align:right;color:#b0b0b0">${money(vat)}</td></tr>
      <tr><td style="padding-top:6px;font-weight:800">Total</td><td style="padding-top:6px;text-align:right;font-weight:800;color:#c8ff00">${money(o.total)}</td></tr>
    </table>
    <p style="color:#707070;font-size:12px;margin-top:22px">Greatstone International · The Foundation of Digital Excellence</p>
  </div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: o.to, subject: 'Your Greatstone order ' + o.reference.replace(/^cs_(test|live)_/, '').slice(0, 12), html }),
  });
  if (!res.ok) throw new Error('resend ' + res.status + ' ' + (await res.text()).slice(0, 140));
  console.log('order email sent to', o.to);
}
