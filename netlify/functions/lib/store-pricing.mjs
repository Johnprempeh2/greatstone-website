import { toRule } from '../../../src/data/catalog.mjs';
import { effectivePrice, usdToGbpMinor } from '../../../src/lib/pricing.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function basketItems(items, maxQty) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new RangeError('No valid items.');
  return items.map((item) => {
    const qty = Number(item?.quantity);
    if (!UUID.test(item?.variantId || '') || !Number.isInteger(qty) || qty < 1 || qty > maxQty)
      throw new RangeError('Invalid basket item.');
    return { id: item.variantId, qty };
  });
}

export async function priceBasket(client, basket) {
  const ids = [...new Set(basket.map((item) => item.id))];
  const { rows: variants } = await client.query(`SELECT v.id,v.name,v.base_price_minor,o.id AS offering_id,o.name AS offering_name,
    o.type,o.vendor_id,o.category_id,o.status,vendor.name AS vendor_name
    FROM offering_variants v JOIN offerings o ON o.id=v.offering_id
    LEFT JOIN vendors vendor ON vendor.id=o.vendor_id
    WHERE v.id=ANY($1::uuid[]) AND v.deleted_at IS NULL AND o.status='published' AND o.deleted_at IS NULL`, [ids]);
  const { rows: ruleRows } = await client.query("SELECT * FROM pricing_rules WHERE active=true AND status='published' AND deleted_at IS NULL");
  const { rows: targets } = await client.query('SELECT rule_id,vendor_id,category_id,offering_id,tier_id FROM pricing_rule_targets');
  const { rows: rates } = await client.query('SELECT usd_to_gbp_display_rate FROM org_settings LIMIT 1');
  const rate = Number(rates[0]?.usd_to_gbp_display_rate);
  if (!(rate > 0)) throw new Error('FX rate unavailable');
  const byRule = new Map();
  for (const target of targets) {
    if (!byRule.has(target.rule_id)) byRule.set(target.rule_id, []);
    byRule.get(target.rule_id).push(target);
  }
  const rules = ruleRows.map((row) => toRule({ ...row, pricing_rule_targets: byRule.get(row.id) || [] }));
  const byId = new Map(variants.map((row) => [row.id, row]));
  const now = new Date();
  return basket.map(({ id, qty }) => {
    const variant = byId.get(id);
    if (!variant) return { id, qty, unavailable: true };
    const base = usdToGbpMinor(variant.base_price_minor, rate);
    const price = effectivePrice({ id: variant.offering_id, type: variant.type,
      vendorId: variant.vendor_id, categoryId: variant.category_id },
    { basePriceMinor: base, currency: 'GBP' }, rules, null, now);
    if (price.final != null && (!Number.isSafeInteger(price.final) || price.final < 0)) throw new Error('Invalid price');
    return { ...variant, qty, list: base, unit: price.final, ruleId: price.appliedRule?.id || null };
  });
}
