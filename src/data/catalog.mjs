// Catalogue data-access layer — the typed read API over Supabase (PostgREST), per
// docs/api-contract.md §2. Pure-ish: every fn takes a supabase client so it runs in the app
// (anon, RLS-gated) and in node verification. Prices are decorated via the pricing engine.
import { offeringFromPrice, effectivePrice } from '../lib/pricing.mjs';

const OFFERING_CARD = 'id,slug,name,short_description,from_price_minor,from_price_currency,featured,platforms,type,attributes,vendor:vendors(id,slug,name,logo_url),category:categories(id,slug,name)';
const OFFERING_FULL = `${OFFERING_CARD},description,seo,offering_variants(id,sku,name,license_type,platform,billing_period,base_price_minor,currency,min_order_qty,sort_order),offering_specs(label,value,sort_order)`;

/** Map a pricing_rules row (+ targets) to the engine's rule shape. */
function toRule(r) {
  const t = { vendorIds: [], categoryIds: [], offeringIds: [], tierIds: [] };
  for (const x of r.pricing_rule_targets || []) {
    if (x.vendor_id) t.vendorIds.push(x.vendor_id);
    if (x.category_id) t.categoryIds.push(x.category_id);
    if (x.offering_id) t.offeringIds.push(x.offering_id);
    if (x.tier_id) t.tierIds.push(x.tier_id);
  }
  return {
    id: r.id, active: r.active, status: r.status, scopeType: r.scope_type, targets: t,
    appliesToOfferingType: r.applies_to_offering_type, adjustmentType: r.adjustment_type,
    adjustmentValue: r.adjustment_value, adjustmentValuePct: r.adjustment_value_pct,
    currency: r.currency, audience: r.audience, audienceTierId: r.audience_tier_id,
    startsAt: r.starts_at, endsAt: r.ends_at, priority: r.priority,
    floorFraction: Number(r.floor_fraction || 0), label: r.label, createdAt: r.created_at,
  };
}

/** Active, published pricing rules (RLS already limits anon to these). */
export async function getActiveRules(sb) {
  const { data, error } = await sb.from('pricing_rules')
    .select('*,pricing_rule_targets(vendor_id,category_id,offering_id,tier_id)')
    .eq('active', true).eq('status', 'published');
  if (error) throw error;
  return (data || []).map(toRule);
}

const ctxOf = (o) => ({ id: o.id, type: o.type, vendorId: o.vendor?.id, categoryId: o.category?.id });

/** Faceted, paginated offerings listing. Filters: vendor/category (slug), platform, type, q (search). */
export async function listOfferings(sb, params = {}) {
  const { vendor, category, platform, type, q, sort = 'featured', page = 1, pageSize = 24, tier = null } = params;
  let query = sb.from('offerings').select(OFFERING_CARD, { count: 'exact' }).eq('status', 'published');
  if (vendor) query = query.eq('vendor.slug', vendor);     // requires !inner — applied below
  if (category) query = query.eq('category.slug', category);
  if (type) query = query.eq('type', type);
  if (platform) query = query.contains('platforms', [platform]);
  if (q) query = query.textSearch('search_tsv', q, { type: 'websearch', config: 'english' });
  // embedded filters need !inner; rebuild select with inner hints when filtering on them
  if (vendor || category) {
    const sel = OFFERING_CARD
      .replace('vendor:vendors(', vendor ? 'vendor:vendors!inner(' : 'vendor:vendors(')
      .replace('category:categories(', category ? 'category:categories!inner(' : 'category:categories(');
    query = sb.from('offerings').select(sel, { count: 'exact' }).eq('status', 'published');
    if (vendor) query = query.eq('vendor.slug', vendor);
    if (category) query = query.eq('category.slug', category);
    if (type) query = query.eq('type', type);
    if (platform) query = query.contains('platforms', [platform]);
    if (q) query = query.textSearch('search_tsv', q, { type: 'websearch', config: 'english' });
  }
  if (sort === 'az') query = query.order('name');
  else if (sort === 'price') query = query.order('from_price_minor', { nullsFirst: false });
  else query = query.order('featured', { ascending: false }).order('name'); // featured
  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  const rules = await getActiveRules(sb).catch(() => []);
  const items = (data || []).map(o => ({ ...o, pricing: priceCard(o, rules, tier) }));
  return { items, total: count ?? items.length, page, pageSize };
}

/** Decorate a card with a from-price (cheapest variant after rules). Card rows lack variants,
 * so we use the stored from_price_minor as the base and apply rules at the offering level. */
function priceCard(o, rules, tier) {
  if (o.from_price_minor == null) return { poa: true, final: null, base: null, hasDiscount: false };
  const pseudoVariant = { basePriceMinor: o.from_price_minor, currency: o.from_price_currency || 'GBP' };
  return effectivePrice(ctxOf(o), pseudoVariant, rules, tier);
}

/** Full offering by slug, with variants + specs + priced editions. */
export async function getOffering(sb, slug, tier = null) {
  const { data, error } = await sb.from('offerings').select(OFFERING_FULL).eq('slug', slug).eq('status', 'published').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rules = await getActiveRules(sb).catch(() => []);
  const ctx = ctxOf(data);
  const variants = (data.offering_variants || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(v => ({ ...v, pricing: effectivePrice(ctx, { basePriceMinor: v.base_price_minor, currency: v.currency }, rules, tier) }));
  const specs = (data.offering_specs || []).sort((a, b) => a.sort_order - b.sort_order);
  const from = offeringFromPrice(ctx, variants.map(v => ({ basePriceMinor: v.base_price_minor, currency: v.currency })), rules, tier);
  return { ...data, variants, specs, from };
}

export async function listVendors(sb) {
  const { data, error } = await sb.from('vendors').select('id,slug,name,logo_url,description').eq('status', 'published').order('sort_order');
  if (error) throw error; return data || [];
}
export async function listCategories(sb) {
  const { data, error } = await sb.from('categories').select('id,slug,name,description').eq('status', 'published').order('name');
  if (error) throw error; return data || [];
}
/** Related offerings (same category or vendor), excluding self. */
export async function relatedOfferings(sb, offering, limit = 4) {
  const { data } = await sb.from('offerings').select(OFFERING_CARD).eq('status', 'published')
    .or(`category_id.eq.${offering.category?.id || offering.category_id},vendor_id.eq.${offering.vendor?.id || offering.vendor_id}`)
    .neq('slug', offering.slug).limit(limit + 4);
  const seen = new Set(), out = [];
  for (const o of data || []) { if (out.length >= limit) break; if (seen.has(o.slug)) continue; seen.add(o.slug); out.push(o); }
  return out;
}
