// GSAM admin bridge, read queries (GRE-2323; commerce resources GRE-2354). Every query runs inside asBridgeReader: the transaction is
// gsam_bridge_read with claims naming the org admin_bridge_begin returned, so RLS decides the rows and the
// migration's column grants decide the columns. Each resource lists its columns: no select *.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
const ORDER_REFERENCE_SQL = "CASE WHEN x.reference ~ '^(cs|pi|ch)_' THEN NULL ELSE x.reference END AS reference";

export class BridgeRequestError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

/** Global per-site cursor. PostgreSQL bigint stays a decimal string in JavaScript. */
export async function bridgeActivityEvents(client, params) {
  const keys = [...params.keys()];
  if (keys.length !== 2 || !keys.includes('cursor') || !keys.includes('limit'))
    throw new BridgeRequestError('bad_request', 'cursor and limit required');
  const cursor = params.get('cursor');
  const limit = params.get('limit');
  if (!cursor || cursor.length > 19 || !/^(0|[1-9]\d*)$/.test(cursor) ||
      !/^(?:[1-9]|[1-9]\d|100)$/.test(limit || '') ||
      BigInt(cursor) > 9223372036854775807n) throw new BridgeRequestError('bad_request', 'invalid cursor or limit');
  const { rows } = await client.query(`SELECT e.sequence::text AS sequence,e.id,
      organisation_id AS "organisationId",kind,subject_id AS "subjectId",label,
      to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
    FROM public.client_activity_outbox e WHERE e.org_id=app_bridge_org() AND e.sequence > $1::bigint
    ORDER BY e.sequence LIMIT $2::integer`, [cursor, Number(limit)]);
  return { items: rows, nextCursor: rows.at(-1)?.sequence || cursor };
}

/** Opens the bridge transaction, runs work(client, org) and closes the audit row with what work returned. */
export async function asBridgeReader(pool, call, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gsam_bridge_read');
    const { rows: [opened] } = await client.query('SELECT audit_id, org_id FROM admin_bridge_begin($1,$2,$3,$4,$5,$6,$7,$8)',
      [call.kid, call.capability, call.nonce, call.time, call.actor, call.run, call.method, call.path]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      role: 'gsam_bridge', cap: 'read', org: opened.org_id, kid: call.kid, actor: call.actor, run: call.run,
    })]);
    let result;
    try {
      result = await work(client);
    } catch (error) {
      if (!(error instanceof BridgeRequestError)) throw error;
      result = { outcome: error.code === 'not_found' ? 'not_found' : 'bad_request', rowCount: 0, error };
    }
    await client.query('SELECT admin_bridge_finish($1,$2,$3,$4,$5)',
      [opened.audit_id, call.resource || null, call.resourceId || null, result.outcome, result.rowCount]);
    await client.query('COMMIT');
    if (result.error) throw result.error;
    return result.body;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* disconnected */ }
    throw error;
  } finally {
    client.release();
  }
}

const items = (table, fk, columns, { order = 'i.created_at, i.id', where = 'true' } = {}) =>
  `(SELECT COALESCE(jsonb_agg(jsonb_build_object(${columns.map((c) => `'${c}',i.${c}`).join(',')})
  ORDER BY ${order}), '[]'::jsonb) FROM ${table} i WHERE i.${fk} = x.id AND ${where})`;

// Child rows of the catalogue, as the write routes return them too.
export const CHILD_COLUMNS = {
  offering_variants: ['id', 'offering_id', 'sku', 'name', 'license_type', 'platform', 'billing_period', 'base_price_minor',
    'currency', 'min_order_qty', 'list_discount_pct', 'sort_order', 'created_at', 'updated_at', 'row_version'],
  offering_specs: ['id', 'offering_id', 'label', 'value', 'sort_order'],
  offering_media: ['id', 'offering_id', 'asset_id', 'sort_order', 'created_at'],
  pricing_rule_targets: ['id', 'rule_id', 'vendor_id', 'category_id', 'offering_id', 'tier_id'],
};

const RESOURCES = {
  customers: {
    table: 'customers', time: 'created_at', updated: 'updated_at', customer: 'id', live: 'x.deleted_at IS NULL',
    columns: ['id', 'slug', 'name', 'tier_id', 'domain', 'billing_currency', 'notes', 'created_at', 'updated_at'],
    extra: { users: `(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'full_name',u.full_name,
      'phone',u.phone,'is_primary',u.is_primary,'role',u.role,'created_at',u.created_at) ORDER BY u.is_primary DESC, u.created_at, u.id),
      '[]'::jsonb) FROM customer_users u WHERE u.customer_id = x.id AND u.deleted_at IS NULL)` },
  },
  quotes: {
    table: 'quotes', time: 'created_at', updated: 'updated_at', customer: 'customer_id', live: 'x.deleted_at IS NULL',
    columns: ['id', 'reference', 'customer_id', 'customer_user_id', 'contact_name', 'contact_email', 'contact_company',
      'contact_phone', 'message', 'status', 'source', 'currency', 'indicative_total_minor', 'quoted_total_minor',
      'po_reference', 'valid_until', 'created_at', 'updated_at', 'row_version'],
    extra: { items: items('quote_items', 'quote_id', ['id', 'offering_id', 'variant_id', 'offering_name', 'variant_name',
      'qty', 'list_price_minor', 'captured_price_minor', 'currency']) },
  },
  orders: {
    table: 'orders', time: 'created_at', updated: 'updated_at', customer: 'customer_id', live: 'x.deleted_at IS NULL',
    columns: ['id', 'reference', 'quote_id', 'customer_id', 'customer_user_id', 'customer_email', 'status', 'currency',
      'subtotal_minor', 'total_minor', 'refunded_minor', 'po_reference', 'invoice_number', 'placed_at', 'created_at',
      'updated_at', 'row_version'],
    extra: { items: items('order_items', 'order_id', ['id', 'offering_id', 'variant_id', 'offering_name', 'variant_name',
      'qty', 'unit_price_minor', 'line_total_minor', 'currency']) },
  },
  'billing-lines': {
    table: 'billing_lines', time: 'created_at', updated: 'updated_at', customer: 'customer_id', live: 'x.deleted_at IS NULL',
    columns: ['id', 'customer_id', 'offering_id', 'variant_id', 'order_id', 'description', 'qty', 'unit_price_minor',
      'currency', 'billing_period', 'starts_on', 'next_bill_on', 'ends_on', 'status', 'notes', 'created_at',
      'updated_at', 'row_version'],
  },
  // There is no invoices table: an invoice is an order with an invoice number (014).
  invoices: {
    table: 'orders', time: 'created_at', updated: 'updated_at', customer: 'customer_id',
    live: 'x.deleted_at IS NULL AND x.invoice_number IS NOT NULL',
    columns: ['id', 'invoice_number', 'reference', 'customer_id', 'customer_email', 'status', 'currency',
      'subtotal_minor', 'total_minor', 'refunded_minor', 'po_reference', 'placed_at', 'created_at', 'updated_at',
      'row_version'],
  },
  licences: {
    table: 'licence_keys', time: 'created_at', updated: 'updated_at', customer: 'customer_id', live: 'x.deleted_at IS NULL',
    columns: ['id', 'customer_id', 'order_id', 'offering_name', 'variant_name', 'licence_key_last4', 'seats', 'status',
      'delivered_at', 'expires_at', 'file_name', 'created_at', 'updated_at'],
  },
  'portal-documents': {
    table: 'portal_documents', time: 'created_at', updated: 'updated_at', customer: 'customer_id', live: 'true',
    columns: ['id', 'customer_id', 'kind', 'series', 'version', 'title', 'summary', 'action', 'signatory_email', 'status',
      'created_by_kind', 'created_run_id', 'published_at', 'withdrawn_at', 'created_at', 'updated_at'],
    extra: { has_pdf: 'x.pdf_sha256 IS NOT NULL' },
  },
  'portal-acceptances': {
    table: 'portal_acceptances', time: 'accepted_at', updated: 'accepted_at', customer: 'customer_id', live: 'true',
    columns: ['id', 'customer_id', 'document_id', 'document_version', 'content_sha256', 'action', 'signer_name',
      'signer_title', 'account_company_name', 'signer_email', 'customer_user_id', 'confirmation_text', 'accepted_at'],
  },
  // Commerce (GRE-2354). The catalogue has no customer, so these lists take no customer filter. No user ids.
  offerings: {
    table: 'offerings', time: 'created_at', updated: 'updated_at', customer: null, live: 'x.deleted_at IS NULL',
    columns: ['id', 'type', 'vendor_id', 'category_id', 'slug', 'name', 'short_description', 'description', 'platforms',
      'tags', 'status', 'featured', 'fulfilment', 'primary_image_id', 'from_price_minor', 'from_price_currency',
      'attributes', 'seo', 'created_at', 'updated_at', 'published_at', 'row_version'],
    extra: {
      variants: items('offering_variants', 'offering_id', CHILD_COLUMNS.offering_variants,
        { order: 'i.sort_order, i.created_at, i.id', where: 'i.deleted_at IS NULL' }),
      specs: items('offering_specs', 'offering_id', CHILD_COLUMNS.offering_specs, { order: 'i.sort_order, i.id' }),
      media: items('offering_media', 'offering_id', CHILD_COLUMNS.offering_media, { order: 'i.sort_order, i.id' }),
    },
  },
  categories: {
    table: 'categories', time: 'created_at', updated: 'updated_at', customer: null, live: 'x.deleted_at IS NULL',
    columns: ['id', 'parent_id', 'slug', 'name', 'description', 'icon_asset_id', 'icon_url', 'status', 'sort_order',
      'created_at', 'updated_at', 'published_at', 'row_version'],
  },
  vendors: {
    table: 'vendors', time: 'created_at', updated: 'updated_at', customer: null, live: 'x.deleted_at IS NULL',
    columns: ['id', 'slug', 'name', 'domain', 'logo_asset_id', 'logo_url', 'description', 'status', 'sort_order',
      'activation_instructions', 'created_at', 'updated_at', 'published_at', 'row_version'],
  },
  'pricing-rules': {
    table: 'pricing_rules', time: 'created_at', updated: 'updated_at', customer: null, live: 'x.deleted_at IS NULL',
    columns: ['id', 'name', 'active', 'scope_type', 'applies_to_offering_type', 'adjustment_type', 'adjustment_value',
      'adjustment_value_pct', 'currency', 'audience', 'audience_tier_id', 'starts_at', 'ends_at', 'priority',
      'floor_fraction', 'label', 'status', 'created_at', 'updated_at', 'published_at', 'row_version'],
    extra: { targets: items('pricing_rule_targets', 'rule_id', CHILD_COLUMNS.pricing_rule_targets, { order: 'i.id' }) },
  },
  'customer-tiers': {
    table: 'customer_tiers', time: 'created_at', updated: 'updated_at', customer: null, live: 'x.deleted_at IS NULL',
    columns: ['id', 'slug', 'name', 'rank', 'description', 'created_at', 'updated_at'],
  },
  // no rollback_token, no created_by; a get adds the rows (without the raw spreadsheet row), paged
  imports: {
    table: 'import_jobs', time: 'created_at', updated: 'created_at', customer: null, live: 'x.deleted_at IS NULL',
    columns: ['id', 'filename', 'type', 'status', 'dry_run', 'source_checksum', 'column_mapping', 'diff_summary',
      'error_summary', 'total_rows', 'applied_at', 'rolled_back_at', 'created_at'],
  },
};
export const RESOURCE_NAMES = [...Object.keys(RESOURCES), 'enquiries', 'fx', 'payments'];
/** Whether a list takes ?customer=. */
export const takesCustomer = (resource) => resource !== 'enquiries' && RESOURCES[resource]?.customer != null;
/** The table and read columns of a resource, for the write routes' answers. */
export const resourceDef = (resource) => RESOURCES[resource];

// Enquiries: the service enquiry form and the front door, mapped to GSAM's WebsiteEnquiry shape (GRE-2324). Only
// those that left an email; the id says which table, so a get reads one row.
const ENQUIRIES = `
  SELECT 'si-' || s.id::text AS id, s.created_at AS t, s.updated_at AS u, jsonb_build_object(
    'name', s.contact_name, 'email', s.contact_email, 'organisationName', s.contact_company, 'message', s.message,
    'source', 'service-enquiry', 'page', s.attribution #>> '{page}', 'utm', s.attribution -> 'first',
    'services', s.services, 'industry', s.industry, 'sizeBand', s.size_band, 'status', s.status, 'createdAt', s.created_at) AS e
  FROM service_inquiries s WHERE s.deleted_at IS NULL AND s.contact_email IS NOT NULL
  UNION ALL
  SELECT 'fd-' || f.id::text, coalesce(f.contact_at, f.created_at), f.updated_at, jsonb_build_object(
    'name', f.contact_name, 'email', f.contact_email, 'organisationName', f.company_name, 'message', NULL,
    'source', 'front-door', 'page', f.source #>> '{page}', 'utm', f.source -> 'firstTouch',
    'consent', jsonb_build_object('given', f.consent_given, 'at', f.consent_at, 'version', f.consent_version),
    'industry', f.industry, 'sizeBand', f.team_size, 'role', f.contact_role, 'status', f.status,
    'createdAt', coalesce(f.contact_at, f.created_at))
  FROM front_door_leads f WHERE f.contact_email IS NOT NULL`;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
function toEnquiry(e, id) {
  const utm = {};
  if (e.utm && typeof e.utm === 'object') for (const k of UTM_KEYS) if (typeof e.utm[k] === 'string') utm[k] = e.utm[k];
  const email = String(e.email || '').trim();
  return {
    id, name: String(e.name || '').trim() || email, email,
    organisationName: e.organisationName || null, phone: null, message: e.message || null, source: e.source,
    page: e.page || null, utm, ...(e.consent ? { consent: e.consent } : {}), createdAt: new Date(e.createdAt).toISOString(),
    services: e.services, industry: e.industry || null, sizeBand: e.sizeBand || null, role: e.role || null,
    status: e.status,
  };
}

// Postgres's own text for the timestamp, so paging keeps the microseconds a JavaScript Date would drop.
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/;
export function encodeCursor(t, id) {
  return Buffer.from(JSON.stringify([t, id]), 'utf8').toString('base64url');
}
function decodeCursor(cursor) {
  try {
    const [t, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof t !== 'string' || !CURSOR_TIME.test(t) || typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) throw new Error();
    return { t, id };
  } catch {
    throw new BridgeRequestError('bad_request', 'cursor');
  }
}

/** Reads list options from the query. Unknown names are refused, so a typo is not a silently ignored filter. */
export function listOptions(searchParams, { customerFilter = true } = {}) {
  const known = new Set(['limit', 'cursor', 'updatedSince', ...(customerFilter ? ['customer'] : [])]);
  for (const name of searchParams.keys()) if (!known.has(name)) throw new BridgeRequestError('bad_request', `unknown parameter ${name}`);
  const raw = searchParams.get('limit');
  const limit = raw == null ? DEFAULT_LIMIT : /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!(limit >= 1 && limit <= MAX_LIMIT)) throw new BridgeRequestError('bad_request', 'limit');
  const customer = searchParams.get('customer');
  if (customer != null && !UUID.test(customer)) throw new BridgeRequestError('bad_request', 'customer');
  const updatedSince = searchParams.get('updatedSince');
  if (updatedSince != null && Number.isNaN(Date.parse(updatedSince))) throw new BridgeRequestError('bad_request', 'updatedSince');
  const cursor = searchParams.get('cursor');
  return { limit, customer, updatedSince, cursor: cursor ? decodeCursor(cursor) : null };
}

function selectList(def) {
  return [...def.columns.map((c) => def.table === 'orders' && c === 'reference' ? ORDER_REFERENCE_SQL : `x.${c}`),
    ...Object.entries(def.extra || {}).map(([k, sql]) => `${sql} AS ${k}`)].join(', ');
}

/** List one resource, keyset paged on (time, id), oldest first. */
export async function bridgeList(client, resource, opts) {
  if (resource === 'enquiries') return listEnquiries(client, opts);
  const def = RESOURCES[resource];
  const where = [def.live];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (opts.customer) where.push(`x.${def.customer} = ${p(opts.customer)}::uuid`);
  if (opts.updatedSince) where.push(`x.${def.updated} >= ${p(opts.updatedSince)}::timestamptz`);
  if (opts.cursor) where.push(`(x.${def.time}, x.id) > (${p(opts.cursor.t)}::timestamptz, ${p(opts.cursor.id)}::uuid)`);
  const { rows } = await client.query(`SELECT ${selectList(def)}, x.${def.time}::text AS _t FROM ${def.table} x
    WHERE ${where.join(' AND ')} ORDER BY x.${def.time}, x.id LIMIT ${p(opts.limit + 1)}`, params);
  return page(rows, opts.limit, (r) => r.id);
}

function page(rows, limit, idOf) {
  const more = rows.length > limit;
  const kept = more ? rows.slice(0, limit) : rows;
  const last = kept[kept.length - 1];
  const nextCursor = more ? encodeCursor(last._t, idOf(last)) : null;
  return { items: kept.map(({ _t, _id, ...rest }) => rest), nextCursor };
}

async function listEnquiries(client, opts) {
  const where = ['true'];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (opts.updatedSince) where.push(`q.u >= ${p(opts.updatedSince)}::timestamptz`);
  if (opts.cursor) where.push(`(q.t, q.id COLLATE "C") > (${p(opts.cursor.t)}::timestamptz, ${p(opts.cursor.id)}::text COLLATE "C")`);
  const { rows } = await client.query(`SELECT q.id AS _id, q.t::text AS _t, q.e FROM (${ENQUIRIES}) q
    WHERE ${where.join(' AND ')} ORDER BY q.t, q.id COLLATE "C" LIMIT ${p(opts.limit + 1)}`, params);
  const out = page(rows, opts.limit, (r) => r._id);
  return { items: rows.slice(0, out.items.length).map((r) => toEnquiry(r.e, r._id)), nextCursor: out.nextCursor };
}

/** Get one row by id, or throw not_found. */
export async function bridgeGet(client, resource, id) {
  if (resource === 'enquiries') {
    const m = /^(si|fd)-([0-9a-f-]{36})$/.exec(id);
    if (!m || !UUID.test(m[2])) throw new BridgeRequestError('not_found');
    const { rows } = await client.query(`SELECT q.id, q.e FROM (${ENQUIRIES}) q WHERE q.id = $1`, [id]);
    if (!rows.length) throw new BridgeRequestError('not_found');
    return toEnquiry(rows[0].e, rows[0].id);
  }
  if (!UUID.test(id)) throw new BridgeRequestError('not_found');
  const def = RESOURCES[resource];
  const { rows } = await client.query(`SELECT ${selectList(def)} FROM ${def.table} x WHERE x.id = $1::uuid AND ${def.live}`, [id]);
  if (!rows.length) throw new BridgeRequestError('not_found');
  return rows[0];
}

/** One row of a resource by id, deleted or not, or null: what a write answers with. */
export async function bridgeRow(client, resource, id) {
  const def = RESOURCES[resource];
  const { rows } = await client.query(`SELECT ${selectList(def)} FROM ${def.table} x WHERE x.id = $1::uuid`, [id]);
  return rows[0] || null;
}

/** The FX rate, its row version and the last 50 changes (no user ids). */
export async function bridgeFx(client) {
  const { rows } = await client.query(`SELECT s.id, s.usd_to_gbp_display_rate::text AS usd_to_gbp_display_rate,
      s.row_version, s.updated_at,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', h.id, 'old_rate', h.old_rate::text, 'new_rate', h.new_rate::text,
         'changed_at', h.changed_at, 'note', h.note) ORDER BY h.changed_at DESC, h.id), '[]'::jsonb)
         FROM (SELECT id, old_rate, new_rate, changed_at, note FROM fx_rate_history ORDER BY changed_at DESC, id LIMIT 50) h) AS history
    FROM org_settings s LIMIT 1`);
  if (!rows.length) throw new BridgeRequestError('not_found');
  return rows[0];
}

/**
 * Client users by Better Auth id (GRE-2631): ?ids=<id,id,...>, 1 to 100 uuids. id, email, name and memberships
 * ({ organisationId, membershipId }) from bridge_client_users (054). An id with no client user is left out.
 */
export async function bridgeUsers(client, searchParams) {
  for (const name of searchParams.keys()) if (name !== 'ids') throw new BridgeRequestError('bad_request', `unknown parameter ${name}`);
  const raw = searchParams.getAll('ids');
  if (raw.length !== 1) throw new BridgeRequestError('bad_request', 'ids');
  const ids = raw[0].split(',').map((s) => s.trim().toLowerCase());
  if (ids.length > MAX_LIMIT || !ids.every((x) => UUID.test(x))) throw new BridgeRequestError('bad_request', 'ids');
  const { rows: [r] } = await client.query('SELECT bridge_client_users($1::uuid[]) AS items', [[...new Set(ids)]]);
  return r.items;
}

const ROWS_CURSOR = /^\d{1,9}$/;
/** An import job and one page of its rows, by row number. ?limit=&cursor= page the rows. */
export async function bridgeImport(client, id, searchParams) {
  for (const name of searchParams.keys()) if (!['limit', 'cursor'].includes(name)) throw new BridgeRequestError('bad_request', `unknown parameter ${name}`);
  const raw = searchParams.get('limit');
  const limit = raw == null ? DEFAULT_LIMIT : /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!(limit >= 1 && limit <= MAX_LIMIT)) throw new BridgeRequestError('bad_request', 'limit');
  let after = 0;
  const cursor = searchParams.get('cursor');
  if (cursor) {
    try { after = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))[0]; } catch { after = NaN; }
    if (!ROWS_CURSOR.test(String(after))) throw new BridgeRequestError('bad_request', 'cursor');
  }
  const item = await bridgeGet(client, 'imports', id);
  const { rows } = await client.query(`SELECT id, row_number, mapped, target_entity, match_key, action, errors, before, after
    FROM import_job_rows WHERE job_id = $1::uuid AND row_number > $2 ORDER BY row_number LIMIT $3`, [id, after, limit + 1]);
  const more = rows.length > limit;
  const kept = more ? rows.slice(0, limit) : rows;
  const nextCursor = more ? Buffer.from(JSON.stringify([kept[kept.length - 1].row_number]), 'utf8').toString('base64url') : null;
  return { ...item, rows: { items: kept, nextCursor } };
}

/**
 * The payment report, from the site's database only: orders Stripe took payment for (a boolean, never the payment
 * intent), their refunds and refund requests, totals per currency and requests by status. ?from=&to= bound the
 * order's created_at; ?limit=&cursor= page the orders. A refund with no request shows as unallocated_refund_minor; an
 * approved request older than 7 days with no refund shows as waiting_on_stripe.
 */
export async function bridgePayments(client, searchParams, stripeMode) {
  const known = new Set(['from', 'to', 'limit', 'cursor']);
  for (const name of searchParams.keys()) if (!known.has(name)) throw new BridgeRequestError('bad_request', `unknown parameter ${name}`);
  const opts = listOptions(new URLSearchParams([...searchParams].filter(([k]) => k === 'limit' || k === 'cursor')), { customerFilter: false });
  const range = ['x.deleted_at IS NULL', 'x.paid_by_stripe'];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  for (const [name, op] of [['from', '>='], ['to', '<']]) {
    const v = searchParams.get(name);
    if (v == null) continue;
    if (Number.isNaN(Date.parse(v))) throw new BridgeRequestError('bad_request', name);
    range.push(`x.created_at ${op} ${p(v)}::timestamptz`);
  }
  const rangeParams = [...params];
  const where = [...range];
  if (opts.cursor) where.push(`(x.created_at, x.id) > (${p(opts.cursor.t)}::timestamptz, ${p(opts.cursor.id)}::uuid)`);
  const { rows } = await client.query(`SELECT x.id, ${ORDER_REFERENCE_SQL}, x.status, x.currency, x.subtotal_minor, x.total_minor,
      x.refunded_minor, x.paid_by_stripe, x.placed_at, x.created_at,
      x.refunded_minor - COALESCE((SELECT sum(r.amount_minor) FROM refund_requests r WHERE r.order_id = x.id AND r.status = 'done'), 0)
        AS unallocated_refund_minor,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'amount_minor', r.amount_minor,
         'reason', r.reason, 'requested_by', r.requested_by, 'decided_by', r.decided_by, 'decided_at', r.decided_at,
         'created_at', r.created_at,
         'waiting_on_stripe', r.status = 'approved' AND r.decided_at < now() - interval '7 days')
         ORDER BY r.created_at, r.id), '[]'::jsonb) FROM refund_requests r WHERE r.order_id = x.id) AS refund_requests,
      x.created_at::text AS _t
    FROM orders x WHERE ${where.join(' AND ')} ORDER BY x.created_at, x.id LIMIT ${p(opts.limit + 1)}`, params);
  const orders = page(rows, opts.limit, (r) => r.id);
  const { rows: totals } = await client.query(`SELECT x.currency, count(*)::int AS orders, sum(x.total_minor)::bigint AS total_minor,
      sum(x.refunded_minor)::bigint AS refunded_minor
    FROM orders x WHERE ${range.join(' AND ')} GROUP BY x.currency ORDER BY x.currency`, rangeParams);
  const { rows: requests } = await client.query(`SELECT r.status, count(*)::int AS requests, sum(r.amount_minor)::bigint AS amount_minor
    FROM refund_requests r JOIN orders x ON x.id = r.order_id WHERE ${range.join(' AND ')} GROUP BY r.status ORDER BY r.status`, rangeParams);
  return { stripeMode, totals, refundRequests: requests, items: orders.items, nextCursor: orders.nextCursor };
}
