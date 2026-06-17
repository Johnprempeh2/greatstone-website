// Seed the cloud Supabase via the REST API using the SERVICE_ROLE key (bypasses RLS).
// Needs only VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env — NO direct DB connection.
// Idempotent: clears the catalogue (child→parent) then re-inserts from products.json.
// Run: set -a; . ./.env; set +a; node supabase/seed/seed-via-rest.mjs
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const FEED = '/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const minor = (w) => (w == null || w === '') ? null : Math.round(Number(w) * 100);
const billing = (n = '') => /subscription/i.test(n) ? 'annual' : /one[\s-]?time/i.test(n) ? 'one_time' : 'perpetual';

const data = JSON.parse(await readFile(FEED, 'utf8'));

async function ins(table, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + chunk));
    if (error) { console.error(`insert ${table} [${i}]:`, error.message); process.exit(1); }
  }
  console.log(`  ${table}: +${rows.length}`);
}
async function clear(table) {
  const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error && !/does not exist/.test(error.message)) console.warn(`  clear ${table}: ${error.message}`);
}

// org (upsert)
await sb.from('organisations').upsert({ id: ORG_ID, slug: 'greatstone', name: 'Greatstone International', domain: 'greatstonesoftware.co.uk', base_currency: 'GBP' });

console.log('clearing catalogue (child→parent)…');
for (const t of ['offering_specs', 'offering_variants', 'offering_media', 'offerings', 'categories', 'vendors']) await clear(t);

const vId = {}, cId = {};
const vendors = data.vendors.map((v, i) => { vId[v.id] = randomUUID(); return { id: vId[v.id], org_id: ORG_ID, slug: v.slug, name: v.name, domain: v.domain, logo_url: v.logo, description: v.description, status: 'published', sort_order: i, published_at: new Date().toISOString() }; });
const categories = data.categories.map((c, i) => { cId[c.id] = randomUUID(); return { id: cId[c.id], org_id: ORG_ID, slug: c.slug, name: c.name, description: c.description || null, icon_url: c.icon || null, status: 'published', sort_order: i, published_at: new Date().toISOString() }; });

const offerings = [], variants = [], specs = [];
for (const p of data.products) {
  const oid = randomUUID();
  const priced = p.fromPrice != null && p.fromPrice !== '';
  offerings.push({
    id: oid, org_id: ORG_ID, type: 'product', vendor_id: vId[p.vendorId] || null, category_id: cId[p.categoryId] || null,
    slug: p.slug, name: p.name, short_description: p.shortDescription || null, description: p.description || null,
    platforms: p.platforms || [], tags: p.tags || [], status: 'published', featured: !!p.featured,
    fulfilment: priced ? 'license' : 'enquiry', from_price_minor: minor(p.fromPrice), from_price_currency: priced ? 'GBP' : null,
    attributes: { icon: p.icon || '', mainImage: p.mainImage || '', gallery: p.gallery || [], sourceUrl: p.sourceUrl || '' },
    seo: p.seo || {}, published_at: new Date().toISOString(),
  });
  (p.variants || []).forEach((v, i) => variants.push({
    id: randomUUID(), org_id: ORG_ID, offering_id: oid, sku: v.sku || null, name: v.name, license_type: v.licenseType || null,
    platform: v.platform || null, billing_period: billing(v.name), base_price_minor: minor(v.price),
    currency: (v.price != null && v.price !== '') ? (v.currency || 'GBP') : null, min_order_qty: v.minOrderQty || 1,
    list_discount_pct: v.discountPct || 0, sort_order: i,
  }));
  (p.specs || []).forEach((s, i) => specs.push({ id: randomUUID(), org_id: ORG_ID, offering_id: oid, label: s.label, value: s.value || '✓', sort_order: i }));
}

console.log('inserting…');
await ins('vendors', vendors);
await ins('categories', categories);
await ins('offerings', offerings);
await ins('offering_variants', variants);
await ins('offering_specs', specs);
console.log(`\nDONE: ${vendors.length} vendors · ${categories.length} categories · ${offerings.length} offerings · ${variants.length} variants · ${specs.length} specs`);
