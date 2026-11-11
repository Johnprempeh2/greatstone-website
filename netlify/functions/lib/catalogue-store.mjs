// Public catalogue reads. Every request uses one transaction as anon, including pricing reads.
// The connection owner is never the visitor role; FORCE RLS in the migrated schema filters rows.
import { decorateOffering, priceCard, toRule } from '../../../src/data/catalog.mjs';
import { shopCurrencyOf } from '../../../src/lib/pricing.mjs';

const CLAIMS = JSON.stringify({ role: 'anon', sub: null, email: null, email_verified: false });
const CARD = `o.id, o.slug, o.name, o.short_description, o.from_price_minor,
  o.from_price_currency, o.featured, o.platforms, o.type, o.attributes,
  o.vendor_id, o.category_id,
  CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id',v.id,'slug',v.slug,'name',v.name,'logo_url',v.logo_url) END AS vendor,
  CASE WHEN cat.id IS NULL THEN NULL ELSE jsonb_build_object('id',cat.id,'slug',cat.slug,'name',cat.name) END AS category`;
const JOINS = `FROM offerings o LEFT JOIN vendors v ON v.id = o.vendor_id
  LEFT JOIN categories cat ON cat.id = o.category_id`;
const PUBLISHED = `o.status = 'published' AND o.deleted_at IS NULL`;

export async function asCatalogueAnon(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* disconnected */ }
    throw error;
  } finally {
    client.release();
  }
}

/** The shop's price settings: { rate (US dollars for £1, or null), currency ('GBP' or 'USD') }. SELECT * so a
 * database without 074's shop_currency (a deploy ahead of its migration) still reads, and prices in pounds. */
export async function shopSettings(client) {
  const { rows } = await client.query('SELECT * FROM org_settings LIMIT 1');
  const rate = Number(rows[0]?.usd_to_gbp_display_rate);
  return { rate: rate > 0 ? rate : null, currency: shopCurrencyOf(rows[0]?.shop_currency) };
}

// The live price inputs: published rules, the USD to GBP display rate and the shop currency. The Next pages read these too.
export async function pricing(client) {
  const { rows: ruleRows } = await client.query("SELECT * FROM pricing_rules WHERE active = true AND status = 'published' AND deleted_at IS NULL");
  const { rows: targets } = await client.query('SELECT rule_id, vendor_id, category_id, offering_id, tier_id FROM pricing_rule_targets');
  const shop = await shopSettings(client);
  const byRule = new Map();
  for (const target of targets) {
    if (!byRule.has(target.rule_id)) byRule.set(target.rule_id, []);
    byRule.get(target.rule_id).push(target);
  }
  return {
    rules: ruleRows.map((r) => toRule({ ...r, pricing_rule_targets: byRule.get(r.id) || [] })),
    rate: shop.rate ?? 1.30,
    currency: shop.currency,
  };
}

function pricedCards(rows, price) {
  return rows.map((row) => ({ ...row, pricing: priceCard(row, price.rules, null, price.rate, price.currency) }));
}

export async function catalogueRead(client, op, params = {}) {
  if (op === 'vendors') {
    const { rows } = await client.query("SELECT id,slug,name,logo_url,description FROM vendors WHERE status = 'published' AND deleted_at IS NULL ORDER BY sort_order");
    return rows;
  }
  if (op === 'categories') {
    const { rows } = await client.query("SELECT id,slug,name,description FROM categories WHERE status = 'published' AND deleted_at IS NULL ORDER BY name");
    return rows;
  }
  if (op === 'list') {
    const { vendor = '', category = '', platform = '', type = '', q = '', sort = 'featured' } = params;
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 24;
    const values = [];
    const where = [PUBLISHED];
    for (const [column, value] of [['v.slug', vendor], ['cat.slug', category], ['o.type', type]]) {
      if (value) { values.push(value); where.push(`${column} = $${values.length}`); }
    }
    if (platform) { values.push(platform); where.push(`$${values.length} = ANY(o.platforms)`); }
    if (q) { values.push(q); where.push(`o.search_tsv @@ websearch_to_tsquery('simple', $${values.length})`); }
    const filter = `${JOINS} WHERE ${where.join(' AND ')}`;
    const order = {
      az: 'o.name ASC', price: 'o.from_price_minor ASC NULLS LAST',
      'price-desc': 'o.from_price_minor DESC NULLS LAST', featured: 'o.featured DESC, o.name ASC',
    }[sort] || 'o.featured DESC, o.name ASC';
    const { rows: counts } = await client.query(`SELECT count(*)::int AS total ${filter}`, values);
    const { rows } = await client.query(`SELECT ${CARD} ${filter} ORDER BY ${order}, o.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize]);
    const price = await pricing(client);
    return { items: pricedCards(rows, price), total: counts[0].total, page, pageSize };
  }
  if (op === 'detail') {
    const { rows } = await client.query(`SELECT ${CARD}, o.description, o.seo ${JOINS} WHERE ${PUBLISHED} AND o.slug = $1 LIMIT 1`, [params.slug]);
    if (!rows.length) return null;
    const o = rows[0];
    const { rows: variants } = await client.query('SELECT id,sku,name,license_type,platform,billing_period,base_price_minor,currency,min_order_qty,sort_order FROM offering_variants WHERE offering_id = $1 AND deleted_at IS NULL ORDER BY sort_order', [o.id]);
    const { rows: specs } = await client.query('SELECT label,value,sort_order FROM offering_specs WHERE offering_id = $1 ORDER BY sort_order', [o.id]);
    const price = await pricing(client);
    return decorateOffering({ ...o, offering_variants: variants, offering_specs: specs }, price.rules, price.rate, null, price.currency);
  }
  if (op === 'related') {
    const { rows: source } = await client.query(`SELECT o.id,o.slug,o.vendor_id,o.category_id ${JOINS} WHERE ${PUBLISHED} AND o.slug = $1 LIMIT 1`, [params.slug]);
    if (!source.length) return [];
    const o = source[0];
    const { rows } = await client.query(`SELECT ${CARD} ${JOINS} WHERE ${PUBLISHED} AND o.id <> $1 AND
        (o.category_id = $2 OR o.vendor_id = $3) ORDER BY o.featured DESC, o.name ASC LIMIT $4`,
      [o.id, o.category_id, o.vendor_id, params.limit || 4]);
    const price = await pricing(client);
    return pricedCards(rows, price);
  }
  throw new RangeError('Unknown catalogue operation');
}
