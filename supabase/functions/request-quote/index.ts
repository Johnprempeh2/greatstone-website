// Quote request (Supabase Edge Function, Deno). Public — guests or signed-in buyers submit a basket +
// contact details + optional PO reference; we capture a quote with INDICATIVE prices computed
// server-side (same USD->GBP + discount logic as checkout). No payment — staff finalise + invoice.
// Deploy: supabase functions deploy request-quote --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ORG = Deno.env.get('APP_ORG_ID') ?? '11111111-1111-4111-8111-111111111111';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

function toRule(r: any) {
  const t = { vendorIds: [] as string[], categoryIds: [] as string[], offeringIds: [] as string[] };
  for (const x of r.pricing_rule_targets || []) { if (x.vendor_id) t.vendorIds.push(x.vendor_id); if (x.category_id) t.categoryIds.push(x.category_id); if (x.offering_id) t.offeringIds.push(x.offering_id); }
  return { id: r.id, scopeType: r.scope_type, targets: t, appliesToOfferingType: r.applies_to_offering_type, adjustmentType: r.adjustment_type, adjustmentValue: Number(r.adjustment_value || 0), adjustmentValuePct: Number(r.adjustment_value_pct || 0), currency: r.currency, audience: r.audience, startsAt: r.starts_at, endsAt: r.ends_at, priority: r.priority ?? 100, floorFraction: Number(r.floor_fraction || 0) };
}
const usdToGbpMinor = (usd: number | null, r: number) => (usd == null || !(r > 0)) ? null : Math.round((usd / 100) / r) * 100;
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
    if (!win || r.priority < win.priority || (r.priority === win.priority && cut > win.cut)) win = { priority: r.priority, cut, floor: r.floorFraction, id: r.id };
  }
  if (!win) return { amount: base, ruleId: null };
  return { amount: Math.max(base - win.cut, Math.round(base * win.floor), 0), ruleId: win.id };
}

async function resolveBuyer(req: Request) {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === ANON_KEY) return null;
    const userClient = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return null;
    const { data: staff } = await supabase.from('users').select('id').eq('auth_subject', user.id).maybeSingle();
    if (staff) return null;
    const { data: cu } = await supabase.from('customer_users').select('id, customer_id, email').eq('auth_subject', user.id).maybeSingle();
    if (!cu) return null;
    return { customerId: cu.customer_id as string, customerUserId: cu.id as string, email: cu.email as string };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { items, contact, poReference, message } = await req.json();
    if (!Array.isArray(items) || !items.length) return json({ error: 'No items' }, 400);
    const email = (contact?.email || '').trim();
    if (!/.+@.+\..+/.test(email)) return json({ error: 'A valid email is required for a quote.' }, 400);
    const ids = [...new Set(items.map((i: any) => i.variantId).filter(Boolean))];
    if (!ids.length) return json({ error: 'No variant ids' }, 400);

    const { data: variants } = await supabase.from('offering_variants')
      .select('id, name, base_price_minor, offering:offerings!inner(id, name, type, status, vendor_id, category_id)')
      .in('id', ids).is('deleted_at', null);
    const { data: ruleRows } = await supabase.from('pricing_rules').select('*, pricing_rule_targets(vendor_id,category_id,offering_id,tier_id)').eq('active', true).eq('status', 'published').is('deleted_at', null);
    const rules = (ruleRows || []).map(toRule);
    const { data: fx } = await supabase.from('org_settings').select('usd_to_gbp_display_rate').limit(1).maybeSingle();
    const rate = Number(fx?.usd_to_gbp_display_rate) || 1.30;
    const now = new Date();
    const buyer = await resolveBuyer(req);

    const rows: any[] = []; let total = 0;
    for (const it of items) {
      const v = (variants || []).find((x: any) => x.id === it.variantId);
      if (!v || !v.offering || v.offering.status !== 'published') continue;
      const qty = Math.max(1, Math.min(1000, Number(it.quantity) || 1));
      const listGbp = usdToGbpMinor(v.base_price_minor, rate); // converted base, pre-discount (null = POA)
      const fp = listGbp == null ? { amount: null, ruleId: null } : finalPrice(listGbp, 'GBP', v.offering, rules, now);
      if (fp.amount != null) total += fp.amount * qty;
      rows.push({ org_id: ORG, offering_id: v.offering.id, variant_id: v.id, applied_rule_id: fp.ruleId,
        offering_name: v.offering.name, variant_name: v.name, qty, list_price_minor: listGbp, captured_price_minor: fp.amount, currency: 'GBP' });
    }
    if (!rows.length) return json({ error: 'No quotable items.' }, 400);

    const { data: quote, error: qErr } = await supabase.from('quotes').insert({
      org_id: ORG, customer_id: buyer?.customerId ?? null, customer_user_id: buyer?.customerUserId ?? null,
      contact_name: contact?.name || null, contact_email: email, contact_company: contact?.company || null, contact_phone: contact?.phone || null,
      message: message || null, po_reference: poReference || null, status: 'new', source: 'product_page', currency: 'GBP', indicative_total_minor: total,
    }).select('id, reference').single();
    if (qErr) return json({ error: qErr.message }, 400);
    const { error: iErr } = await supabase.from('quote_items').insert(rows.map((r) => ({ ...r, quote_id: quote.id })));
    if (iErr) return json({ error: iErr.message }, 400);
    return json({ reference: quote.reference, id: quote.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
