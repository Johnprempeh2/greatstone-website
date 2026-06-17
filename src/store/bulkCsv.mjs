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
