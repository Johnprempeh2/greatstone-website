// Stripe Checkout Session creator (Supabase Edge Function, Deno). TEST MODE.
// SECURE: never trusts client-sent prices — looks up real variant prices by id (service_role),
// applies active discount rules server-side (mirror of src/lib/pricing.mjs), adds UK VAT, then
// creates the session. Deploy: supabase functions deploy stripe-checkout --no-verify-jwt
import Stripe from 'https://esm.sh/stripe@17.0.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient(), apiVersion: '2024-06-20' });
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const VAT = Number(Deno.env.get('VAT_RATE') ?? '0.20');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

function toRule(r: any) {
  const t = { vendorIds: [] as string[], categoryIds: [] as string[], offeringIds: [] as string[] };
  for (const x of r.pricing_rule_targets || []) { if (x.vendor_id) t.vendorIds.push(x.vendor_id); if (x.category_id) t.categoryIds.push(x.category_id); if (x.offering_id) t.offeringIds.push(x.offering_id); }
  return { scopeType: r.scope_type, targets: t, appliesToOfferingType: r.applies_to_offering_type, adjustmentType: r.adjustment_type, adjustmentValue: Number(r.adjustment_value || 0), adjustmentValuePct: Number(r.adjustment_value_pct || 0), currency: r.currency, audience: r.audience, startsAt: r.starts_at, endsAt: r.ends_at, priority: r.priority ?? 100, floorFraction: Number(r.floor_fraction || 0) };
}
// USD minor → GBP minor at the live rate, rounded to the whole pound. MUST match src/lib/pricing.mjs.
function usdToGbpMinor(usdMinor: number | null, displayRate: number) {
  if (usdMinor == null) return null;
  const r = Number(displayRate);
  if (!(r > 0)) return null;
  return Math.round((usdMinor / 100) / r) * 100;
}

// single-winner, floor-clamped, never-negative (public audience only at checkout)
function finalPrice(base: number, currency: string, off: any, rules: any[], now: Date) {
  let win: any = null;
  for (const r of rules) {
    if (r.audience === 'tier') continue;
    if (r.startsAt && now < new Date(r.startsAt)) continue;
    if (r.endsAt && now > new Date(r.endsAt)) continue;
    if (r.appliesToOfferingType && r.appliesToOfferingType !== off.type) continue;
    let match = false;
    if (r.scopeType === 'all' || r.scopeType === 'tier') match = true;
    else if (r.scopeType === 'vendor') match = !!off.vendor_id && r.targets.vendorIds.includes(off.vendor_id);
    else if (r.scopeType === 'category') match = !!off.category_id && r.targets.categoryIds.includes(off.category_id);
    else if (r.scopeType === 'offering') match = r.targets.offeringIds.includes(off.id);
    if (!match) continue;
    let cut = 0;
    if (r.adjustmentType === 'percentage') { if (r.adjustmentValuePct > 0) cut = Math.round(base * r.adjustmentValuePct / 100); }
    else if (r.adjustmentType === 'fixed') { if (r.currency === currency && r.adjustmentValue > 0) cut = r.adjustmentValue; }
    if (cut <= 0) continue;
    if (!win || r.priority < win.priority || (r.priority === win.priority && cut > win.cut)) win = { priority: r.priority, cut, floor: r.floorFraction };
  }
  if (!win) return base;
  return Math.max(base - win.cut, Math.round(base * win.floor), 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { items, successUrl, cancelUrl, customerEmail } = await req.json();
    if (!Array.isArray(items) || !items.length) return json({ error: 'No items' }, 400);
    const ids = [...new Set(items.map((i: any) => i.variantId).filter(Boolean))];
    if (!ids.length) return json({ error: 'No variant ids' }, 400);

    const { data: variants, error: vErr } = await supabase.from('offering_variants')
      .select('id, name, base_price_minor, currency, offering:offerings!inner(id, name, type, status, vendor_id, category_id, vendor:vendors(name))')
      .in('id', ids).is('deleted_at', null);
    if (vErr) return json({ error: vErr.message }, 400);
    const { data: ruleRows } = await supabase.from('pricing_rules').select('*, pricing_rule_targets(vendor_id,category_id,offering_id,tier_id)').eq('active', true).eq('status', 'published').is('deleted_at', null);
    const rules = (ruleRows || []).map(toRule);
    const now = new Date();
    // Prices are STORED in USD; recompute GBP from the live rate server-side so the customer is charged
    // exactly the rounded GBP they saw — never a client-sent value.
    const { data: fx } = await supabase.from('org_settings').select('usd_to_gbp_display_rate').limit(1).maybeSingle();
    const rate = Number(fx?.usd_to_gbp_display_rate);
    if (!(rate > 0)) return json({ error: 'FX rate unavailable' }, 400);

    const line_items: any[] = []; let subtotal = 0;
    for (const it of items) {
      const v = (variants || []).find((x: any) => x.id === it.variantId);
      if (!v || v.base_price_minor == null || !v.offering || v.offering.status !== 'published') continue; // POA / unknown / unpublished → not card-purchasable
      const gbpBase = usdToGbpMinor(v.base_price_minor, rate); // stored USD → whole-pound GBP, same rounding the storefront showed
      if (gbpBase == null) continue;
      const qty = Math.max(1, Math.min(100, Number(it.quantity) || 1));
      const unit = finalPrice(gbpBase, 'GBP', v.offering, rules, now); // discounts apply AFTER conversion, on the GBP figure
      subtotal += unit * qty;
      line_items.push({ quantity: qty, price_data: { currency: 'gbp', unit_amount: unit, product_data: { name: `${v.offering.name} — ${v.name}`, metadata: { variant_id: v.id, vendor: v.offering.vendor?.name ?? '' } } } });
    }
    if (!line_items.length) return json({ error: 'No purchasable items (all POA or unavailable — use Request a quote).' }, 400);
    const vat = Math.round(subtotal * VAT);
    if (vat > 0) line_items.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: vat, product_data: { name: `UK VAT (${Math.round(VAT * 100)}%)` } } });

    const origin = req.headers.get('origin') || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', line_items,
      success_url: successUrl || `${origin}/#order-confirmed?session={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/#shop`,
      customer_email: customerEmail || undefined,
      metadata: { source: 'greatstone-store' },
    });
    return json({ url: session.url, id: session.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
