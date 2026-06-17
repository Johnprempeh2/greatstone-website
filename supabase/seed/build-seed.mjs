// Generate supabase/seed/seed.sql from the real catalogue feed.
// Maps greatstone-homepage/assets/products.json → the unified `offerings` model:
// vendors, categories, offerings(type=product), offering_variants, offering_specs.
// Money is stored as integer minor units (pence). Idempotent: TRUNCATEs catalogue tables first.
// Media (icons/galleries) is parked in offerings.attributes until the media_assets/Storage cycle.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const FEED = '/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json';
const OUT = new URL('./seed.sql', import.meta.url).pathname;
const ORG_ID = '11111111-1111-4111-8111-111111111111'; // stable Greatstone org id (also used in app config)

const data = JSON.parse(await readFile(FEED, 'utf8'));
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => !a || !a.length ? `'{}'` : `ARRAY[${a.map(q).join(',')}]::text[]`;
const json = (o) => `'${JSON.stringify(o || {}).replace(/'/g, "''")}'::jsonb`;
const minor = (whole) => (whole == null || whole === '') ? 'NULL' : String(Math.round(Number(whole) * 100));
const bool = (b) => b ? 'true' : 'false';
const billing = (name = '') => /subscription/i.test(name) ? 'annual' : /one[\s-]?time/i.test(name) ? 'one_time' : 'perpetual';

const L = [];
L.push('-- Greatstone catalogue seed (generated from products.json). Money = minor units (pence).');
L.push('BEGIN;');
L.push(`SET LOCAL app.current_org = '${ORG_ID}';   -- satisfy RLS WITH CHECK during seed (app sets this per request)`);
L.push(`TRUNCATE offering_specs, offering_variants, offering_media, offerings, categories, vendors RESTART IDENTITY CASCADE;`);
L.push('');
L.push('-- Organisation (idempotent)');
L.push(`INSERT INTO organisations (id, slug, name, domain, base_currency) VALUES (${q(ORG_ID)}, 'greatstone', 'Greatstone International', 'greatstonesoftware.co.uk', 'GBP') ON CONFLICT (id) DO NOTHING;`);
L.push('');

// Vendors
const vId = {};
L.push('-- Vendors');
data.vendors.forEach((v, i) => {
  vId[v.id] = randomUUID();
  L.push(`INSERT INTO vendors (id, org_id, slug, name, domain, logo_url, description, status, sort_order, published_at) VALUES (${q(vId[v.id])}, ${q(ORG_ID)}, ${q(v.slug)}, ${q(v.name)}, ${q(v.domain)}, ${q(v.logo)}, ${q(v.description)}, 'published', ${i}, now());`);
});
L.push('');

// Categories
const cId = {};
L.push('-- Categories (functional)');
data.categories.forEach((c, i) => {
  cId[c.id] = randomUUID();
  L.push(`INSERT INTO categories (id, org_id, slug, name, description, icon_url, status, sort_order, published_at) VALUES (${q(cId[c.id])}, ${q(ORG_ID)}, ${q(c.slug)}, ${q(c.name)}, ${q(c.description)}, ${q(c.icon)}, 'published', ${i}, now());`);
});
L.push('');

// Offerings + variants + specs
let vCount = 0, sCount = 0;
L.push('-- Offerings (products) + variants + specs');
for (const p of data.products) {
  const oid = randomUUID();
  const vendor = vId[p.vendorId] ? q(vId[p.vendorId]) : 'NULL';
  const cat = cId[p.categoryId] ? q(cId[p.categoryId]) : 'NULL';
  const fulfilment = (p.fromPrice != null && p.fromPrice !== '') ? 'license' : 'enquiry';
  const attrs = { icon: p.icon || '', mainImage: p.mainImage || '', gallery: p.gallery || [], sourceUrl: p.sourceUrl || '' };
  L.push(`INSERT INTO offerings (id, org_id, type, vendor_id, category_id, slug, name, short_description, description, platforms, tags, status, featured, fulfilment, from_price_minor, from_price_currency, attributes, seo, published_at) VALUES (${q(oid)}, ${q(ORG_ID)}, 'product', ${vendor}, ${cat}, ${q(p.slug)}, ${q(p.name)}, ${q(p.shortDescription)}, ${q(p.description)}, ${arr(p.platforms)}, ${arr(p.tags)}, 'published', ${bool(p.featured)}, '${fulfilment}', ${minor(p.fromPrice)}, ${p.fromPrice != null && p.fromPrice !== '' ? "'USD'" : 'NULL'}, ${json(attrs)}, ${json(p.seo)}, now());`);
  (p.variants || []).forEach((v, i) => {
    vCount++;
    L.push(`INSERT INTO offering_variants (id, org_id, offering_id, sku, name, license_type, platform, billing_period, base_price_minor, currency, min_order_qty, list_discount_pct, sort_order) VALUES (${q(randomUUID())}, ${q(ORG_ID)}, ${q(oid)}, ${q(v.sku || null)}, ${q(v.name)}, ${q(v.licenseType || null)}, ${q(v.platform || null)}, '${billing(v.name)}', ${minor(v.price)}, ${v.price != null && v.price !== '' ? "'USD'" : 'NULL'}, ${v.minOrderQty || 1}, ${v.discountPct || 0}, ${i});`);
  });
  (p.specs || []).forEach((s, i) => {
    sCount++;
    L.push(`INSERT INTO offering_specs (id, org_id, offering_id, label, value, sort_order) VALUES (${q(randomUUID())}, ${q(ORG_ID)}, ${q(oid)}, ${q(s.label)}, ${q(s.value || '✓')}, ${i});`);
  });
}
L.push('');
L.push("-- Full-text search vector");
L.push(`UPDATE offerings SET search_tsv = to_tsvector('english', coalesce(name,'')||' '||coalesce(short_description,'')||' '||coalesce(description,''));`);
L.push('COMMIT;');

await writeFile(OUT, L.join('\n') + '\n');
console.log(`seed.sql written: ${data.vendors.length} vendors · ${data.categories.length} categories · ${data.products.length} offerings · ${vCount} variants · ${sCount} specs`);
