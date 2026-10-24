// GSAM admin bridge, read queries (GRE-2323). Every query runs inside asBridgeReader: the transaction is
// gsam_bridge_read with claims naming the org admin_bridge_begin returned, so RLS decides the rows and the
// migration's column grants decide the columns. Each resource lists its columns: no select *.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export class BridgeRequestError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
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

const items = (table, fk, columns) => `(SELECT COALESCE(jsonb_agg(jsonb_build_object(${columns.map((c) => `'${c}',i.${c}`).join(',')})
  ORDER BY i.created_at, i.id), '[]'::jsonb) FROM ${table} i WHERE i.${fk} = x.id)`;

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
      'po_reference', 'valid_until', 'created_at', 'updated_at'],
    extra: { items: items('quote_items', 'quote_id', ['id', 'offering_id', 'variant_id', 'offering_name', 'variant_name',
      'qty', 'list_price_minor', 'captured_price_minor', 'currency']) },
  },
  orders: {
    table: 'orders', time: 'created_at', updated: 'updated_at', customer: 'customer_id', live: 'x.deleted_at IS NULL',
    columns: ['id', 'reference', 'quote_id', 'customer_id', 'customer_user_id', 'customer_email', 'status', 'currency',
      'subtotal_minor', 'total_minor', 'refunded_minor', 'po_reference', 'invoice_number', 'placed_at', 'created_at',
      'updated_at'],
    extra: { items: items('order_items', 'order_id', ['id', 'offering_id', 'variant_id', 'offering_name', 'variant_name',
      'qty', 'unit_price_minor', 'line_total_minor', 'currency']) },
  },
  // There is no invoices table: an invoice is an order with an invoice number (014).
  invoices: {
    table: 'orders', time: 'created_at', updated: 'updated_at', customer: 'customer_id',
    live: 'x.deleted_at IS NULL AND x.invoice_number IS NOT NULL',
    columns: ['id', 'invoice_number', 'reference', 'customer_id', 'customer_email', 'status', 'currency',
      'subtotal_minor', 'total_minor', 'refunded_minor', 'po_reference', 'placed_at', 'created_at', 'updated_at'],
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
};
export const RESOURCE_NAMES = [...Object.keys(RESOURCES), 'enquiries'];

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
  return [...def.columns.map((c) => `x.${c}`), ...Object.entries(def.extra || {}).map(([k, sql]) => `${sql} AS ${k}`)].join(', ');
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
