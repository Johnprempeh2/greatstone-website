// Bulk CSV round-trip for offerings — PURE (no I/O), unit-testable.
// Export → admin edits in Excel → re-import: match rows by slug, compute a dry-run diff,
// then the UI applies the changes via the authenticated client. Editable data-point fields only
// (name/short_description/status/featured); structural fields (slug/vendor/category) are read-only here.

const EXPORT_COLS = ['slug', 'name', 'vendor', 'category', 'type', 'status', 'featured', 'short_description'];
export const EDITABLE = ['name', 'status', 'featured', 'short_description'];
const STATUSES = ['draft', 'published', 'archived'];

const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function offeringsToCsv(list) {
  const lines = [EXPORT_COLS.join(',')];
  for (const o of list) {
    lines.push([o.slug, o.name, (o.vendor && o.vendor.name) || o.vendor || '', (o.category && o.category.name) || o.category || '',
      o.type, o.status, o.featured ? 'true' : 'false', o.short_description].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

// RFC4180-ish parser: handles quoted fields, escaped quotes, embedded commas/newlines.
export function parseCsv(text) {
  const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = []; let field = '', row = [], inQ = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] && r[0] !== ''));
}

export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; }); return o; });
}

const asBool = (v) => /^(true|yes|1|y)$/i.test(String(v).trim());

// Compute the dry-run diff of imported rows vs the current offerings (keyed by slug).
export function diffOfferings(objects, current) {
  const bySlug = new Map(current.map(o => [o.slug, o]));
  const updates = [], unchanged = [], errors = [];
  for (const row of objects) {
    const slug = (row.slug || '').trim();
    if (!slug) { errors.push({ slug: '', reason: 'missing slug' }); continue; }
    const cur = bySlug.get(slug);
    if (!cur) { errors.push({ slug, reason: 'unknown slug (not in catalogue)' }); continue; }
    const changes = {}; let bad = null;
    for (const f of EDITABLE) {
      if (row[f] === undefined || row[f] === '') continue;
      let nv = f === 'featured' ? asBool(row[f]) : String(row[f]);
      if (f === 'status' && !STATUSES.includes(nv)) { bad = 'invalid status “' + nv + '”'; break; }
      let cv = f === 'featured' ? !!cur[f] : (cur[f] == null ? '' : String(cur[f]));
      if (String(nv) !== String(cv)) changes[f] = { from: cv, to: nv };
    }
    if (bad) { errors.push({ slug, reason: bad }); continue; }
    if (Object.keys(changes).length) updates.push({ slug, id: cur.id, changes });
    else unchanged.push(slug);
  }
  return { updates, unchanged, errors };
}

// Reduce a diff update's `changes` to a flat {field:value} patch for the DB update.
export function changesToPatch(changes) {
  const patch = {};
  for (const f of Object.keys(changes)) patch[f] = changes[f].to;
  return patch;
}

// ───────────────────────────────────────────────────────────────────────────
// SKU-keyed bulk import (USD price book). SKU is the unique match key for every
// create/update. Prices are USD (stored as-is); GBP is derived at read from the
// global FX rate, so the importer NEVER writes a GBP figure. All functions pure.
// ───────────────────────────────────────────────────────────────────────────

// Canonical column schema. sku = match key; offering_slug groups a variant under its parent.
export const SKU_COLS = ['sku', 'offering_slug', 'offering_name', 'vendor', 'category', 'edition_name', 'license_type', 'billing_period', 'list_price_usd', 'status', 'featured'];

export const normalizeSku = (s) => String(s == null ? '' : s).trim();   // case-sensitive exact match

/** Parse a USD list price into integer minor units (cents). Blank → {minor:null} (POA/no-change).
 * Accepts '870', '870.00', '$1,299.99', '£1,299'. Non-numeric/negative → {error}. */
export function parseUsdPriceToMinor(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/[$£,\s]/g, '');
  if (s === '') return { minor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: 'not a valid price: "' + String(raw).trim() + '"' };
  return { minor: Math.round(parseFloat(s) * 100) };
}

// Export the current catalogue as a SKU price book (round-trips with the importer).
export function variantsToSkuCsv(variants) {
  const lines = [SKU_COLS.join(',')];
  for (const v of variants) {
    const o = v.offering || {};
    lines.push([v.sku || '', o.slug || '', o.name || '', (o.vendor && o.vendor.name) || '', (o.category && o.category.name) || '',
      v.name || '', v.license_type || '', v.billing_period || '', v.base_price_minor != null ? (v.base_price_minor / 100).toFixed(2) : '',
      o.status || '', o.featured ? 'true' : 'false'].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

const VARIANT_TEXT = [['edition_name', 'name'], ['license_type', 'license_type'], ['billing_period', 'billing_period']];

/** Classify CSV rows against the current catalogue. current = { variantsBySku:Map, offeringsBySlug:Map }.
 * Returns { creates, updates, unchanged, invalid, duplicates, counts } — computed before ANY write. */
export function buildSkuPlan(objects, current) {
  const variantsBySku = current.variantsBySku || new Map();
  const offeringsBySlug = current.offeringsBySlug || new Map();
  // count occurrences first → any sku appearing >1 time in the file is a duplicate (no row applied)
  const skuCount = new Map();
  for (const row of objects) { const sku = normalizeSku(row.sku); if (sku) skuCount.set(sku, (skuCount.get(sku) || 0) + 1); }

  const creates = [], updates = [], unchanged = [], invalid = [], dupMap = new Map();
  objects.forEach((row, rowIndex) => {
    const sku = normalizeSku(row.sku);
    if (!sku) { invalid.push({ rowIndex, sku: '', reason: 'missing sku' }); return; }
    if ((skuCount.get(sku) || 0) > 1) {
      const d = dupMap.get(sku) || { sku, rowIndexes: [] }; d.rowIndexes.push(rowIndex); dupMap.set(sku, d); return;
    }
    const price = parseUsdPriceToMinor(row.list_price_usd);
    if (price.error) { invalid.push({ rowIndex, sku, reason: price.error }); return; }
    const status = (row.status || '').trim();
    if (status && !STATUSES.includes(status)) { invalid.push({ rowIndex, sku, reason: 'invalid status "' + status + '"' }); return; }

    const cur = variantsBySku.get(sku);
    if (cur) {                                                          // UPDATE existing SKU
      const changes = {};
      for (const [csvKey, col] of VARIANT_TEXT) {
        if (row[csvKey] === undefined || row[csvKey] === '') continue;  // blank = no change
        const nv = String(row[csvKey]).trim();
        const cv = cur[col] == null ? '' : String(cur[col]);
        if (nv !== cv) changes[col] = { from: cv, to: nv };
      }
      if (price.minor !== null && price.minor !== cur.base_price_minor) changes.base_price_minor = { from: cur.base_price_minor, to: price.minor };
      if (Object.keys(changes).length) updates.push({ sku, variantId: cur.id, offeringId: cur.offering_id, changes });
      else unchanged.push(sku);
    } else {                                                            // CREATE new SKU
      const offeringSlug = (row.offering_slug || '').trim() || null;
      const vendor = (row.vendor || '').trim() || null;
      // A new product offering requires a vendor (chk_product_has_vendor). Attaching to an EXISTING
      // offering doesn't. Flag the gap here so it shows in the preview rather than failing at commit.
      const parentExists = offeringSlug && offeringsBySlug.has(offeringSlug);
      if (!parentExists && !vendor) { invalid.push({ rowIndex, sku, reason: 'new product needs a vendor' }); return; }
      creates.push({
        sku,
        offeringSlug,
        offeringName: (row.offering_name || '').trim() || null,
        vendor,
        category: (row.category || '').trim() || null,
        status: status || 'draft',
        featured: asBool(row.featured),
        variant: {
          name: (row.edition_name || '').trim() || 'Standard',
          license_type: (row.license_type || '').trim() || null,
          billing_period: (row.billing_period || '').trim() || 'perpetual',
          base_price_minor: price.minor,                                // USD minor (null = POA)
        },
      });
    }
  });
  const duplicates = [...dupMap.values()];
  const counts = { total: objects.length, matching: updates.length, new: creates.length, invalid: invalid.length, duplicate: duplicates.length, unchanged: unchanged.length };
  return { creates, updates, unchanged, invalid, duplicates, counts };
}
