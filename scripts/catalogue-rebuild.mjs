// GRE-3024: data-only staging seed. Source files stay outside Git; no implicit database target.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const names = ['source-catalogue.json', 'service-offerings.json', 'source-service-catalog.mjs', 'products.csv', 'services.csv'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expectedManifestDigest = 'dbf50a0bbe49b453d4742415d6764634b5903ddad2be39f2b9357a1385303a24';
const expectedIdentityDigest = '014bf55c8f21579b1a97982965b96fa563bb175a682beb3ce6acc40a61ea54f7';
const stable = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const same = (a, b) => stable(a) === stable(b);

export async function loadSource(bundle, identityPath) {
  const manifestBytes = await readFile(resolve(bundle, 'manifest.json'));
  if (sha256(manifestBytes) !== expectedManifestDigest) throw new Error('Manifest digest mismatch');
  const manifest = JSON.parse(manifestBytes);
  const files = {};
  for (const name of names) {
    const bytes = await readFile(resolve(bundle, name));
    if (sha256(bytes) !== manifest.files[name]) throw new Error(`Source digest mismatch: ${name}`);
    files[name] = bytes;
  }
  const catalogue = JSON.parse(files['source-catalogue.json']);
  const services = JSON.parse(files['service-offerings.json']);
  const identityBytes = await readFile(identityPath);
  if (sha256(identityBytes) !== expectedIdentityDigest) throw new Error('Identity map digest mismatch');
  const identity = JSON.parse(identityBytes);
  if (identity.schema !== 'greatstone-catalogue-rebuild-identity-map-v1') throw new Error('Identity map schema mismatch');
  if (catalogue.source_project !== manifest.source_project || catalogue.exported_at !== manifest.exported_at) throw new Error('Source provenance mismatch');
  if (services.source_ref !== `website PR 140 at ${manifest.website_head}`) throw new Error('Service source commit mismatch');
  if (catalogue.offerings.length !== manifest.counts.offerings || catalogue.variants.length !== manifest.counts.variants || catalogue.specs.length !== manifest.counts.specs || catalogue.vendors.length !== manifest.counts.vendors || catalogue.categories.length !== manifest.counts.categories || services.services.length !== manifest.service_count || identity.service_categories.length !== manifest.service_category_count) throw new Error('Source count mismatch');
  const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
  const products = byId(catalogue.offerings);
  const variants = byId(catalogue.variants);
  const specs = byId(catalogue.specs);
  if (products.size !== catalogue.offerings.length || variants.size !== catalogue.variants.length || specs.size !== catalogue.specs.length) throw new Error('Duplicate source ID');
  for (const row of identity.product_records) {
    const product = products.get(row.id);
    if (!product || product.slug !== row.slug || product.vendor_id !== row.vendor_id || product.category_id !== row.category_id) throw new Error(`Product identity mismatch: ${row.id}`);
    for (const ref of row.variant_refs) {
      const variant = variants.get(ref.id);
      if (!variant || variant.offering_id !== row.id || variant.sku !== ref.sku) throw new Error(`Variant identity mismatch: ${ref.id}`);
    }
    for (const id of row.spec_ids) if (specs.get(id)?.offering_id !== row.id) throw new Error(`Spec identity mismatch: ${id}`);
  }
  if (identity.product_records.length !== products.size || identity.product_records.reduce((n, p) => n + p.variant_refs.length, 0) !== variants.size || identity.product_records.reduce((n, p) => n + p.spec_ids.length, 0) !== specs.size) throw new Error('Incomplete identity map');
  const serviceBySlug = new Map(services.services.map((row) => [row.slug, row]));
  if (serviceBySlug.size !== services.services.length || identity.service_records.length !== services.services.length) throw new Error('Service identity mismatch');
  for (const row of identity.service_records) if (!serviceBySlug.has(row.slug) || serviceBySlug.get(row.slug).name !== row.name || row.status !== 'draft' || row.fulfilment !== 'enquiry') throw new Error(`Service identity mismatch: ${row.slug}`);
  const identityDigest = sha256(identityBytes);
  return { manifest, catalogue, services, identity, identityDigest, packageDigest: sha256(stable({ files: manifest.files, identityDigest })) };
}

const fields = {
  vendors: ['id', 'org_id', 'slug', 'name', 'domain', 'logo_url', 'description', 'status', 'sort_order', 'published_at'],
  categories: ['id', 'org_id', 'parent_id', 'slug', 'name', 'description', 'icon_url', 'status', 'sort_order', 'published_at'],
  offerings: ['id', 'org_id', 'type', 'vendor_id', 'category_id', 'slug', 'name', 'short_description', 'description', 'platforms', 'tags', 'status', 'featured', 'fulfilment', 'from_price_minor', 'from_price_currency', 'attributes', 'seo', 'published_at'],
  offering_variants: ['id', 'org_id', 'offering_id', 'sku', 'name', 'license_type', 'platform', 'billing_period', 'base_price_minor', 'currency', 'min_order_qty', 'list_discount_pct', 'sort_order'],
  offering_specs: ['id', 'org_id', 'offering_id', 'label', 'value', 'sort_order'],
};

export function rowsFromSource({ catalogue, identity, manifest }) {
  const org = catalogue.offerings[0]?.org_id;
  if (!org || ![...catalogue.vendors, ...catalogue.categories, ...catalogue.offerings, ...catalogue.variants, ...catalogue.specs].every((row) => row.org_id === org)) throw new Error('Source org mismatch');
  const vendorIds = new Set(catalogue.vendors.map((v) => v.id));
  const categoryIds = new Set(catalogue.categories.map((c) => c.id));
  const productIds = new Set(catalogue.offerings.map((p) => p.id));
  for (const p of catalogue.offerings) if (!vendorIds.has(p.vendor_id) || (p.category_id && !categoryIds.has(p.category_id))) throw new Error(`Product relationship mismatch: ${p.id}`);
  for (const v of catalogue.variants) if (!productIds.has(v.offering_id)) throw new Error(`Variant relationship mismatch: ${v.id}`);
  for (const s of catalogue.specs) if (!productIds.has(s.offering_id)) throw new Error(`Spec relationship mismatch: ${s.id}`);
  const serviceCategoryIds = new Set(identity.service_categories.map((c) => c.id));
  if (serviceCategoryIds.size !== identity.service_categories.length || identity.service_categories.some((c) => categoryIds.has(c.id)) || identity.service_records.some((s) => productIds.has(s.id))) throw new Error('Cross-type ID conflict');
  for (const s of identity.service_records) if (!serviceCategoryIds.has(s.category_id)) throw new Error(`Service category mismatch: ${s.id}`);
  for (const row of [...catalogue.offerings, ...catalogue.variants]) for (const field of ['from_price_minor', 'base_price_minor']) if (row[field] != null && (!Number.isSafeInteger(row[field]) || row[field] < 0)) throw new Error(`Unsafe money value: ${row.id}`);
  const provenance = { projectRef: manifest.source_project_ref, exportedAt: manifest.exported_at, sourceDigest: manifest.files['source-catalogue.json'] };
  const rows = {
    vendors: catalogue.vendors,
    categories: [...catalogue.categories, ...identity.service_categories.map((c) => ({ id: c.id, org_id: org, slug: c.slug, name: c.source_category, description: '', status: 'draft', sort_order: 1000, published_at: null }))],
    offerings: [...catalogue.offerings.map((p) => ({ ...p, attributes: { ...p.attributes, catalogue_rebuild_source: { ...provenance, table: 'offerings', id: p.id } } })), ...identity.service_records.map((s) => ({ id: s.id, org_id: org, type: 'service', vendor_id: null, category_id: s.category_id, slug: s.slug, name: s.name, short_description: null, description: null, platforms: [], tags: [], status: 'draft', featured: false, fulfilment: 'enquiry', from_price_minor: null, from_price_currency: null, attributes: { catalogue_rebuild_source: { ...s.provenance, sourceDigest: manifest.files['service-offerings.json'], review: s.copy_review } }, seo: {}, published_at: null }))],
    offering_variants: catalogue.variants,
    offering_specs: catalogue.specs,
  };
  for (const [table, list] of Object.entries(rows)) {
    const ids = new Set();
    for (const row of list) {
      if (ids.has(row.id)) throw new Error(`Duplicate ${table} ID`);
      ids.add(row.id);
      for (const key of fields[table]) if (key !== 'parent_id' && key !== 'domain' && key !== 'description' && key !== 'icon_url' && key !== 'logo_url' && key !== 'published_at' && key !== 'short_description' && key !== 'vendor_id' && key !== 'category_id' && key !== 'platform' && key !== 'sku' && key !== 'license_type' && key !== 'base_price_minor' && key !== 'currency' && key !== 'from_price_minor' && key !== 'from_price_currency' && row[key] === undefined) throw new Error(`Missing ${table}.${key}`);
    }
  }
  return { org, rows };
}

export function inspectConflicts(rows, existing) {
  const errors = [];
  const counts = {};
  const keyed = { vendors: 'slug', categories: 'slug', offerings: 'slug', offering_variants: 'sku' };
  for (const [table, incoming] of Object.entries(rows)) {
    const current = existing[table] || [];
    const byId = new Map(current.map((r) => [r.id, r]));
    const key = keyed[table];
    const byKey = new Map(current.filter((r) => r.org_id === incoming[0]?.org_id && r[key] != null && r.deleted_at == null).map((r) => [String(r[key]).toLowerCase(), r]));
    const sourceKeys = new Map();
    const specSlot = table === 'offering_specs' ? new Map(current.filter((r) => r.org_id === incoming[0]?.org_id).map((r) => [`${r.offering_id}:${r.sort_order}`, r])) : null;
    const sourceSpecSlots = new Map();
    counts[table] = { source: incoming.length, insert: 0, update: 0, noop: 0 };
    for (const row of incoming) {
      if (key && row[key] != null) {
        const value = String(row[key]).toLowerCase();
        if (sourceKeys.has(value) && sourceKeys.get(value) !== row.id) errors.push(`${table} duplicate source ${key}: ${value}`);
        sourceKeys.set(value, row.id);
        if (byKey.has(value) && byKey.get(value).id !== row.id) errors.push(`${table} ${key} belongs to another ID: ${value}`);
      }
      const old = byId.get(row.id);
      if (old && (old.org_id !== row.org_id || old.deleted_at != null || (key && String(old[key] ?? '').toLowerCase() !== String(row[key] ?? '').toLowerCase()))) errors.push(`${table} ID conflict: ${row.id}`);
      if (old && ((table === 'offerings' && (old.type !== row.type || old.vendor_id !== row.vendor_id || old.category_id !== row.category_id)) || (table === 'offering_variants' && old.offering_id !== row.offering_id) || (table === 'offering_specs' && old.offering_id !== row.offering_id))) errors.push(`${table} relationship conflict: ${row.id}`);
      if (specSlot) {
        const slot = `${row.offering_id}:${row.sort_order}`;
        if (sourceSpecSlots.has(slot) && sourceSpecSlots.get(slot) !== row.id) errors.push(`offering_specs duplicate source slot: ${slot}`);
        sourceSpecSlots.set(slot, row.id);
        if (specSlot.has(slot) && specSlot.get(slot).id !== row.id) errors.push(`offering_specs slot belongs to another ID: ${slot}`);
      }
      const normalize = (field, value) => {
        if (value == null) return null;
        if (field === 'published_at') return new Date(value).toISOString();
        if (field === 'list_discount_pct') return Number(value);
        return value;
      };
      const comparable = Object.fromEntries(fields[table].map((f) => [f, normalize(f, old?.[f])]));
      const proposed = Object.fromEntries(fields[table].map((f) => [f, normalize(f, row[f])]));
      counts[table][!old ? 'insert' : same(comparable, proposed) ? 'noop' : 'update']++;
    }
  }
  return { counts, errors };
}

export async function loadExistingRows(client, rows, org) {
  const existing = {};
  for (const [table, incoming] of Object.entries(rows)) {
    existing[table] = (await client.query(`SELECT * FROM ${table} WHERE org_id = $1 OR id = ANY($2::uuid[])`, [org, incoming.map((row) => row.id)])).rows;
  }
  return existing;
}

export async function upsertRow(client, table, row) {
  const cols = fields[table];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const assignments = cols.filter((c) => c !== 'id' && c !== 'org_id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const distinct = cols.filter((c) => c !== 'id' && c !== 'org_id').map((c) => `${table}.${c} IS DISTINCT FROM EXCLUDED.${c}`).join(' OR ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${assignments} WHERE ${table}.org_id = EXCLUDED.org_id AND (${distinct})`;
  await client.query(sql, cols.map((c) => row[c] ?? null));
}

const usage = 'Usage: node scripts/catalogue-rebuild.mjs --bundle PATH --identity-map PATH --db-url-env ENV --expect-host HOST --expect-db DB --expect-org UUID --receipt PATH [--apply --dry-run-receipt PATH]';
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) out[argv[i++].slice(2)] = argv[i];
    else throw new Error(usage);
  }
  for (const key of ['bundle', 'identity-map', 'db-url-env', 'expect-host', 'expect-db', 'expect-org', 'receipt']) if (!out[key]) throw new Error(usage);
  if (out.apply && !out['dry-run-receipt']) throw new Error('Apply requires the matching dry-run receipt');
  return out;
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options['db-url-env'] === 'NETLIFY_DB_URL' || options['db-url-env'] === 'DATABASE_URL') throw new Error('Use a dedicated staging target environment variable');
  const url = process.env[options['db-url-env']];
  if (!url) throw new Error('Target URL environment variable is unset');
  if (new URL(url).hostname !== options['expect-host']) throw new Error('Target host mismatch');
  const source = await loadSource(options.bundle, options['identity-map']);
  const { org, rows } = rowsFromSource(source);
  if (org !== options['expect-org']) throw new Error('Target org mismatch');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const db = await client.query('SELECT current_database() AS name, current_user AS actor');
    if (db.rows[0].name !== options['expect-db']) throw new Error('Target database mismatch');
    await client.query('LOCK TABLE organisations, org_settings, vendors, categories, offerings, offering_variants, offering_specs, import_jobs IN SHARE ROW EXCLUSIVE MODE');
    const existingOrg = await client.query('SELECT id, slug FROM organisations WHERE id = $1 OR slug = $2', [org, 'greatstone']);
    if (existingOrg.rows.some((r) => r.id !== org || r.slug !== 'greatstone')) throw new Error('Organisation identity conflict');
    if (!existingOrg.rows.length) await client.query('INSERT INTO organisations(id, slug, name) VALUES ($1, $2, $3)', [org, 'greatstone', 'Greatstone International']);
    const existing = await loadExistingRows(client, rows, org);
    const { counts, errors } = inspectConflicts(rows, existing);
    if (errors.length) throw new Error(`Import conflicts:\n${errors.join('\n')}`);
    const fx = source.catalogue.display_settings;
    if (fx.length !== 1 || fx[0].org_id !== org || !(Number(fx[0].usd_to_gbp_display_rate) > 0)) throw new Error('FX source mismatch');
    const priorFx = await client.query('SELECT usd_to_gbp_display_rate FROM org_settings WHERE org_id = $1', [org]);
    const fxAction = !priorFx.rows.length ? 'insert' : Number(priorFx.rows[0].usd_to_gbp_display_rate) === Number(fx[0].usd_to_gbp_display_rate) ? 'noop' : 'update';
    const receipt = { mode: options.apply ? 'apply' : 'dry-run', target: { host: options['expect-host'], database: options['expect-db'], org }, source: { projectRef: source.manifest.source_project_ref, exportedAt: source.manifest.exported_at, websiteHead: source.manifest.website_head, manifestFiles: source.manifest.files, identityDigest: source.identityDigest, packageDigest: source.packageDigest }, counts, fx: fxAction, committed: false };
    if (options.apply) {
      const dry = JSON.parse(await readFile(options['dry-run-receipt'], 'utf8'));
      if (dry.mode !== 'dry-run' || dry.committed || !same(dry.target, receipt.target) || dry.source?.packageDigest !== source.packageDigest || !same(dry.counts, counts) || dry.fx !== fxAction) throw new Error('Dry-run receipt no longer matches this source and target');
      const previous = await client.query("SELECT id FROM import_jobs WHERE org_id = $1 AND source_checksum = $2 AND status = 'applied' AND deleted_at IS NULL", [org, source.packageDigest]);
      if (previous.rows.length && (Object.values(counts).some((c) => c.insert || c.update) || fxAction !== 'noop')) throw new Error('Previously applied source has drifted');
      for (const [table, list] of Object.entries(rows)) {
        for (const row of list) await upsertRow(client, table, row);
      }
      await client.query('INSERT INTO org_settings(org_id, usd_to_gbp_display_rate) VALUES ($1, $2) ON CONFLICT (org_id) DO UPDATE SET usd_to_gbp_display_rate = EXCLUDED.usd_to_gbp_display_rate WHERE org_settings.usd_to_gbp_display_rate IS DISTINCT FROM EXCLUDED.usd_to_gbp_display_rate', [org, fx[0].usd_to_gbp_display_rate]);
      if (!previous.rows.length) await client.query("INSERT INTO import_jobs(org_id, filename, type, status, dry_run, source_checksum, column_mapping, diff_summary, total_rows, applied_at) VALUES ($1, $2, 'mixed', 'applied', false, $3, $4, $5, $6, now())", [org, 'catalogue-rebuild-source-bundle', source.packageDigest, JSON.stringify({ identityDigest: source.identityDigest, manifestFiles: source.manifest.files }), JSON.stringify(counts), Object.values(rows).reduce((n, list) => n + list.length, 0)]);
      await client.query('COMMIT');
      receipt.committed = true;
    } else await client.query('ROLLBACK');
    await writeFile(options.receipt, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(receipt));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
