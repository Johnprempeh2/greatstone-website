// legacy-migrate.mjs — pure transforms that map an exported legacy-store dataset (the old iCandy
// greatstonesoftware.co.uk shop) into our Supabase row shapes. The importer script
// (scripts/migrate-legacy-store.mjs) does the I/O + upserts; ALL the mapping, validation and
// idempotency-key logic lives here so it is unit-tested without a database or any live service.
//
// Design: a migrated record is keyed by its LEGACY ID so re-running the import upserts instead of
// duplicating. Companies upsert on customers.slug ("legacy-<id>"); orders upsert on the unique
// orders.reference ("legacy:<id>"), which also doubles as the "migrated, no Stripe session" marker.
// Provenance is stamped in metadata.source = 'legacy-migration'.

export const DEFAULT_ORG_ID = '11111111-1111-4111-8111-111111111111';
export const MIGRATION_SOURCE = 'legacy-migration';

const ORDER_STATUSES = new Set(['pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded']);
// map whatever the old store called a status onto our enum. A migrated historical order was paid, so an
// unknown/blank status defaults to 'confirmed' (money in), never 'pending'.
const STATUS_ALIASES = {
  paid: 'confirmed', payment_received: 'confirmed', processing: 'confirmed', open: 'pending', new: 'pending',
  complete: 'fulfilled', completed: 'fulfilled', delivered: 'fulfilled', shipped: 'fulfilled', dispatched: 'fulfilled',
  void: 'cancelled', canceled: 'cancelled', failed: 'cancelled',
  refund: 'refunded', partially_refunded: 'refunded', partial_refund: 'refunded',
};
export function mapOrderStatus(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '_');
  if (ORDER_STATUSES.has(v)) return v;
  return STATUS_ALIASES[v] || 'confirmed';
}

function slugify(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// deterministic company slug so a re-import updates the same row rather than making a second one
export function customerSlug(c) {
  if (c && c.slug) return slugify(c.slug);
  if (c && c.legacy_id != null && String(c.legacy_id).trim() !== '') return 'legacy-' + slugify(String(c.legacy_id));
  const from = slugify((c && (c.company || c.name || c.domain)) || '');
  return from || 'customer';
}

// the unique orders.reference we store for a migrated order (also marks it as no-Stripe-session)
export function orderReference(o) {
  const id = o && o.legacy_id != null && String(o.legacy_id).trim() !== '' ? o.legacy_id : (o && o.reference);
  return 'legacy:' + slugify(String(id == null ? '' : id)) ;
}

export function isMigratedReference(ref) {
  return typeof ref === 'string' && ref.startsWith('legacy:');
}

// money: our schema stores minor units (pence). Prefer an explicit *_minor field; otherwise accept a major
// amount (pounds) and convert. Returns a non-negative integer number of minor units.
export function toMinor(minorField, majorField) {
  if (minorField != null && minorField !== '') {
    const n = Math.round(Number(minorField));
    if (!Number.isFinite(n) || n < 0) throw new Error('invalid minor amount: ' + minorField);
    return n;
  }
  if (majorField != null && majorField !== '') {
    const n = Math.round(Number(majorField) * 100);
    if (!Number.isFinite(n) || n < 0) throw new Error('invalid major amount: ' + majorField);
    return n;
  }
  return 0;
}

function cur(c, fallback = 'GBP') {
  const v = String(c == null ? '' : c).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : fallback;
}

function iso(d) {
  if (!d) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) throw new Error('invalid date: ' + d);
  return t.toISOString();
}

// --- row builders (no ids; the importer stamps org_id/customer_id and lets the DB gen uuids) ---

// one export customer -> the company row + its people rows
export function buildCustomer(c, orgId = DEFAULT_ORG_ID) {
  if (!c || typeof c !== 'object') throw new Error('customer must be an object');
  const name = String(c.company || c.name || '').trim();
  if (!name) throw new Error('customer is missing a company/name (legacy_id ' + (c.legacy_id ?? '?') + ')');
  const slug = customerSlug(c);
  const users = (Array.isArray(c.users) ? c.users : []).map((u, i) => {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) throw new Error('customer ' + slug + ' has a user with no email');
    return {
      org_id: orgId, email,
      full_name: (u.full_name || u.name || '').toString().trim() || null,
      phone: (u.phone || '').toString().trim() || null,
      is_primary: u.is_primary != null ? !!u.is_primary : i === 0,
    };
  });
  return {
    company: {
      org_id: orgId, slug, name,
      domain: (c.domain || '').toString().trim() || null,
      billing_currency: c.currency ? cur(c.currency) : null,
      notes: (c.notes || '').toString().trim() || null,
      metadata: { source: MIGRATION_SOURCE, legacy_id: c.legacy_id != null ? String(c.legacy_id) : null },
    },
    users,
  };
}

// one export order -> the order row + item rows + optional historical licence-key rows.
// customerId is resolved by the importer (from customer_legacy_id); may be null (order kept, unlinked).
export function buildOrder(o, orgId = DEFAULT_ORG_ID, customerId = null) {
  if (!o || typeof o !== 'object') throw new Error('order must be an object');
  const reference = orderReference(o);
  if (reference === 'legacy:') throw new Error('order is missing a legacy_id/reference');
  const currency = cur(o.currency);
  const items = (Array.isArray(o.items) ? o.items : []).map((it) => {
    const offering_name = String(it.offering_name || it.name || it.product || '').trim();
    if (!offering_name) throw new Error('order ' + reference + ' has a line item with no product name');
    const qty = Math.max(1, Math.round(Number(it.qty || it.quantity || 1)) || 1);
    const unit = toMinor(it.unit_price_minor, it.unit_price);
    const line = it.line_total_minor != null || it.line_total != null ? toMinor(it.line_total_minor, it.line_total) : unit * qty;
    return {
      org_id: orgId, offering_name,
      variant_name: (it.variant_name || it.edition || '').toString().trim() || null,
      qty, unit_price_minor: unit, line_total_minor: line, currency,
    };
  });
  const subtotal = o.subtotal_minor != null || o.subtotal != null
    ? toMinor(o.subtotal_minor, o.subtotal)
    : items.reduce((n, it) => n + it.line_total_minor, 0);
  const total = o.total_minor != null || o.total != null ? toMinor(o.total_minor, o.total) : subtotal;
  const keys = (Array.isArray(o.licence_keys) ? o.licence_keys : []).map((k) => {
    const licence_key = String(k.licence_key || k.key || '').trim();
    if (!licence_key) throw new Error('order ' + reference + ' has a licence key with no code');
    const download_url = (k.download_url || '').toString().trim() || null;
    if (download_url && !/^https?:\/\//i.test(download_url)) throw new Error('order ' + reference + ' has an invalid download_url');
    return {
      org_id: orgId, offering_name: (k.offering_name || '').toString().trim() || 'Software licence',
      variant_name: (k.variant_name || '').toString().trim() || null,
      licence_key, download_url,
      seats: k.seats != null && k.seats !== '' ? Math.max(1, Math.round(Number(k.seats))) : null,
      status: 'issued',
      metadata: { source: MIGRATION_SOURCE },
    };
  });
  return {
    order: {
      org_id: orgId, reference, customer_id: customerId,
      status: mapOrderStatus(o.status),
      currency, subtotal_minor: subtotal, total_minor: total,
      placed_at: iso(o.placed_at || o.date || o.created_at) || null,
      customer_email: (o.buyer_email || o.email || '').toString().trim().toLowerCase() || null,
    },
    items, keys,
  };
}

// values that appear more than once, in first-seen order (for duplicate-key reporting)
function duplicates(arr) {
  const counts = new Map();
  for (const x of arr) counts.set(x, (counts.get(x) || 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([x]) => x);
}

// validate the whole export shape up-front and return a normalised { orgId, customers, orders }
export function validateExport(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('export must be a JSON object');
  const orgId = raw.org_id || DEFAULT_ORG_ID;
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error('org_id must be a uuid');
  const customers = Array.isArray(raw.customers) ? raw.customers : [];
  const orders = Array.isArray(raw.orders) ? raw.orders : [];
  // build everything once so any bad record throws here, before we touch the DB
  const builtCustomers = customers.map((c) => buildCustomer(c, orgId));
  const builtOrders = orders.map((o) => buildOrder(o, orgId, null));
  // referential check: every order's customer_legacy_id must match a known customer
  const known = new Set(customers.map((c) => (c.legacy_id != null ? String(c.legacy_id) : null)).filter(Boolean));
  const orphans = orders
    .filter((o) => o.customer_legacy_id != null && !known.has(String(o.customer_legacy_id)))
    .map((o) => orderReference(o));
  // duplicate idempotency keys: two source records that collapse onto ONE upsert key would silently merge
  // (the second overwrites the first) — data loss in a one-shot migration. Surface them so the export is
  // fixed before we apply, not discovered after.
  const duplicateCustomerSlugs = duplicates(builtCustomers.map((c) => c.company.slug));
  const duplicateOrderReferences = duplicates(builtOrders.map((o) => o.order.reference));
  return { orgId, customers, orders, builtCustomers, builtOrders, orphanOrders: orphans, duplicateCustomerSlugs, duplicateOrderReferences };
}

// a dry-run summary: what the import would touch (no DB access)
export function summarise(raw) {
  const v = validateExport(raw);
  return {
    orgId: v.orgId,
    customers: v.builtCustomers.length,
    users: v.builtCustomers.reduce((n, c) => n + c.users.length, 0),
    orders: v.builtOrders.length,
    orderItems: v.builtOrders.reduce((n, o) => n + o.items.length, 0),
    licenceKeys: v.builtOrders.reduce((n, o) => n + o.keys.length, 0),
    orphanOrders: v.orphanOrders,
    duplicateCustomerSlugs: v.duplicateCustomerSlugs,
    duplicateOrderReferences: v.duplicateOrderReferences,
  };
}
