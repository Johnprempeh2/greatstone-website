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
    if (event.type === 'checkout.session.completed') await recordOrder(event.data.object as Stripe.Checkout.Session);
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
    const v: any = vmap.get(vid);
    const qty = item.quantity || 1;
    const unit = item.price?.unit_amount ?? 0;
    const lineTotal = item.amount_subtotal ?? unit * qty;
    subtotal += lineTotal;
    items.push({
      org_id: orgId, offering_id: v?.offering?.id || null, variant_id: vid,
      offering_name: v?.offering?.name || (typeof p === 'object' ? (p as Stripe.Product).name : 'Licence'),
      variant_name: v?.name || null, qty, unit_price_minor: unit, line_total_minor: lineTotal, currency,
    });
  }

  // idempotent: ON CONFLICT (org_id, reference) DO NOTHING → null row means it was already recorded
  const { data: inserted, error } = await supabase.from('orders')
    .upsert({ org_id: orgId, reference: sessionId, status: 'confirmed', currency, subtotal_minor: subtotal, total_minor: totalMinor, placed_at: new Date().toISOString() },
      { onConflict: 'org_id,reference', ignoreDuplicates: true })
    .select('id').maybeSingle();
  if (error) throw error;
  if (!inserted) { console.log('order already recorded for', sessionId); return; }
  if (items.length) {
    const { error: iErr } = await supabase.from('order_items').insert(items.map((it) => ({ ...it, order_id: inserted.id })));
    if (iErr) throw iErr;
  }
  console.log('recorded order', inserted.id, '· items', items.length, '· total', totalMinor, currency, '· email', email || '(none)');
}
