// GSAM admin bridge, write and refund-request capabilities (GRE-2354, migration 049_gsam_bridge_commerce). One typed
// route per operation, never a generic table writer: each route names its table, its allow-listed fields and their
// checks, and the migration's column grants and guards hold the same line again in the database.
//
// Every call runs in asBridgeWriter: the transaction is gsam_bridge_write (or gsam_bridge_refund), begin claims the
// nonce and the idempotency key and opens the audit row, and the operation runs inside a SAVEPOINT. A refused write
// rolls back to the savepoint and still commits its audit row (and spends its nonce). The answer is stored under the
// idempotency key, so a retry with the same key and body gets the same answer and writes nothing.
import { BridgeRequestError, CHILD_COLUMNS, bridgeFx, bridgeRow } from './admin-bridge-store.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLE = { write: 'gsam_bridge_write', refund_request: 'gsam_bridge_refund' };
const BEGIN = { write: 'admin_bridge_begin_write', refund_request: 'admin_bridge_begin_refund' };
const FINISH = { write: 'admin_bridge_finish_write', refund_request: 'admin_bridge_finish_refund' };

// ── refusals ────────────────────────────────────────────────────────────────────────────────────────
// A refused write answers with a code; the audit outcome is the code, except over_refundable, which is a conflict.
export const WRITE_STATUS = { bad_request: 400, denied: 403, not_found: 404, conflict: 409, over_refundable: 409,
  idempotency_mismatch: 409 };
const PG_REFUSAL = {
  GB400: 'bad_request', GB403: 'denied', GB404: 'not_found', GB409: 'conflict', GBR01: 'over_refundable',
  23502: 'bad_request', 23503: 'bad_request', 23514: 'bad_request', '22P02': 'bad_request', 22003: 'bad_request',
  22007: 'bad_request', 22008: 'bad_request', 22023: 'bad_request', 22001: 'bad_request',
  23505: 'conflict', 42501: 'denied',
};
function refusal(error) {
  if (error instanceof BridgeRequestError) return WRITE_STATUS[error.code] ? error.code : null;
  return PG_REFUSAL[error?.code] || null;
}

/**
 * Opens the write transaction and runs work(client, { org, actor }) inside a savepoint. work returns
 * { status, body, rowCount, resourceId? }. call.current(client), when given, loads the row a conflict answers with.
 */
export async function asBridgeWriter(pool, call, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${ROLE[call.capability]}`);
    const { rows: [opened] } = await client.query(
      `SELECT audit_id, org_id, replay, mismatch FROM ${BEGIN[call.capability]}($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [call.kid, call.nonce, call.time, call.actor, call.run, call.method, call.path, call.idempotencyKey, call.bodySha256]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      role: 'gsam_bridge', cap: call.capability, org: opened.org_id, kid: call.kid, actor: call.actor, run: call.run,
      audit: opened.audit_id,
    })]);
    let result;
    let store = true;
    if (opened.mismatch) {
      result = { outcome: 'conflict', status: 409, body: { error: { code: 'idempotency_mismatch' } }, rowCount: 0 };
      store = false;
    } else if (opened.replay) {
      result = { outcome: 'replayed', status: opened.replay.status, body: opened.replay.body, rowCount: 0 };
      store = false;
    } else {
      await client.query('SAVEPOINT bridge_write');
      try {
        result = { outcome: 'ok', ...(await work(client, { org: opened.org_id, actor: call.actor })) };
        await client.query('RELEASE SAVEPOINT bridge_write');
      } catch (error) {
        const code = refusal(error);
        if (!code) throw error;
        await client.query('ROLLBACK TO SAVEPOINT bridge_write');
        result = { outcome: code === 'over_refundable' ? 'conflict' : code, status: WRITE_STATUS[code],
          body: { error: { code } }, rowCount: 0 };
        if (code === 'conflict' && call.current) {
          const current = await call.current(client);
          if (current) result.body.current = current;
        }
      }
    }
    await client.query(`SELECT ${FINISH[call.capability]}($1,$2,$3,$4,$5,$6)`, [opened.audit_id, call.resource || null,
      String(result.resourceId || call.resourceId || '').slice(0, 80) || null, result.outcome, result.rowCount,
      store ? JSON.stringify({ status: result.status, body: result.body }) : null]);
    await client.query('COMMIT');
    return { status: result.status, body: result.body };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* disconnected */ }
    throw error;
  } finally {
    client.release();
  }
}

// ── body checks ─────────────────────────────────────────────────────────────────────────────────────
const bad = (field) => { throw new BridgeRequestError('bad_request', field); };
const text = (max, { required = false } = {}) => (x, k) => {
  if (x === null && !required) return null;
  if (typeof x !== 'string' || x.length > max || (required && !x.trim())) bad(k);
  return x;
};
const token = (x, k) => (typeof x === 'string' && /^[^\s]{1,200}$/.test(x) ? x : bad(k));
const int = (min, max, { nullable = false } = {}) => (x, k) => {
  if (x === null && nullable) return null;
  return Number.isInteger(x) && x >= min && x <= max ? x : bad(k);
};
const minor = ({ nullable = true } = {}) => (x, k) => {
  if (x === null && nullable) return null;
  return Number.isSafeInteger(x) && x >= 0 ? String(x) : bad(k);
};
const decimal = (max, scale) => (x, k) => {
  if (x === null) return null;
  const s = typeof x === 'number' ? String(x) : x;
  return typeof s === 'string' && new RegExp(`^\\d{1,6}(\\.\\d{1,${scale}})?$`).test(s) && Number(s) <= max ? s : bad(k);
};
const bool = (x, k) => (typeof x === 'boolean' ? x : bad(k));
const id = ({ nullable = true } = {}) => (x, k) => {
  if (x === null && nullable) return null;
  return typeof x === 'string' && UUID.test(x) ? x : bad(k);
};
const oneOf = (values, { nullable = false } = {}) => (x, k) => {
  if (x === null && nullable) return null;
  return values.includes(x) ? x : bad(k);
};
const currency = (x, k) => (x === null ? null : typeof x === 'string' && /^[A-Z]{3}$/.test(x) ? x : bad(k));
const words = (x, k) => (Array.isArray(x) && x.length <= 50 && x.every((w) => typeof w === 'string' && w.length <= 100) ? x : bad(k));
const object = (x, k) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? JSON.stringify(x) : bad(k));
const date = (x, k) => (x === null ? null : typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) ? x : bad(k));
const time = (x, k) => (x === null ? null : typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : bad(k));

/** The JSON body as an object. An empty body is {}. */
function parseBody(raw) {
  if (!raw) return {};
  let body;
  try { body = JSON.parse(raw); } catch { bad('body is not JSON'); }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) bad('body is not an object');
  return body;
}

/** Checks body against fields ({ jsonName: [column, check] }) and returns { column: value }. Unknown names are refused. */
function pick(body, fields, { required = [], allow = [] } = {}) {
  const out = {};
  for (const [k, value] of Object.entries(body)) {
    if (allow.includes(k)) continue;
    if (!fields[k]) bad(`unknown field ${k}`);
    out[fields[k][0]] = fields[k][1](value, k);
  }
  for (const k of required) if (body[k] === undefined || body[k] === null) bad(`${k} is required`);
  return out;
}
const expectedRowVersion = (body) => int(1, 2 ** 31 - 1)(body.expectedRowVersion, 'expectedRowVersion');

// ── the catalogue ───────────────────────────────────────────────────────────────────────────────────
const VENDOR = {
  slug: ['slug', token], name: ['name', text(200, { required: true })], domain: ['domain', text(200)],
  logoAssetId: ['logo_asset_id', id()], logoUrl: ['logo_url', text(2000)], description: ['description', text(20000)],
  sortOrder: ['sort_order', int(-1e6, 1e6)], activationInstructions: ['activation_instructions', text(20000)],
};
const CATEGORY = {
  parentId: ['parent_id', id()], slug: ['slug', token], name: ['name', text(200, { required: true })],
  description: ['description', text(20000)], iconAssetId: ['icon_asset_id', id()], iconUrl: ['icon_url', text(2000)],
  sortOrder: ['sort_order', int(-1e6, 1e6)],
};
const OFFERING = {
  type: ['type', oneOf(['product', 'service'])], vendorId: ['vendor_id', id()], categoryId: ['category_id', id()],
  slug: ['slug', token], name: ['name', text(300, { required: true })], shortDescription: ['short_description', text(2000)],
  description: ['description', text(50000)], platforms: ['platforms', words], tags: ['tags', words],
  featured: ['featured', bool], fulfilment: ['fulfilment', oneOf(['license', 'subscription', 'engagement', 'enquiry'])],
  primaryImageId: ['primary_image_id', id()], fromPriceMinor: ['from_price_minor', minor()],
  fromPriceCurrency: ['from_price_currency', currency], attributes: ['attributes', object], seo: ['seo', object],
};
const PRICING_RULE = {
  name: ['name', text(200, { required: true })], active: ['active', bool],
  scopeType: ['scope_type', oneOf(['all', 'vendor', 'category', 'offering', 'tier'])],
  appliesToOfferingType: ['applies_to_offering_type', oneOf(['product', 'service'], { nullable: true })],
  adjustmentType: ['adjustment_type', oneOf(['percentage', 'fixed'])],
  adjustmentValue: ['adjustment_value', minor({ nullable: false })], adjustmentValuePct: ['adjustment_value_pct', decimal(100, 2)],
  currency: ['currency', currency], audience: ['audience', oneOf(['public', 'tier'])],
  audienceTierId: ['audience_tier_id', id()], startsAt: ['starts_at', time], endsAt: ['ends_at', time],
  priority: ['priority', int(-1e6, 1e6)], floorFraction: ['floor_fraction', decimal(1, 3)], label: ['label', text(100)],
};
const VARIANT = {
  sku: ['sku', text(200)], name: ['name', text(300, { required: true })], licenseType: ['license_type', text(500)],
  platform: ['platform', text(100)],
  billingPeriod: ['billing_period', oneOf(['one_time', 'perpetual', 'monthly', 'quarterly', 'annual', 'multi_year'])],
  basePriceMinor: ['base_price_minor', minor()], currency: ['currency', currency],
  minOrderQty: ['min_order_qty', int(1, 1e6)], listDiscountPct: ['list_discount_pct', decimal(100, 2)],
  sortOrder: ['sort_order', int(-1e6, 1e6)],
};
const SPEC = { label: ['label', text(500, { required: true })], value: ['value', text(2000, { required: true })], sortOrder: ['sort_order', int(-1e6, 1e6)] };
const MEDIA = { assetId: ['asset_id', id({ nullable: false })], sortOrder: ['sort_order', int(-1e6, 1e6)] };
const TARGET = { vendorId: ['vendor_id', id()], categoryId: ['category_id', id()], offeringId: ['offering_id', id()], tierId: ['tier_id', id()] };

const PARENTS = {
  vendors: { table: 'vendors', fields: VENDOR, required: ['slug', 'name'] },
  categories: { table: 'categories', fields: CATEGORY, required: ['slug', 'name'] },
  offerings: { table: 'offerings', fields: OFFERING, required: ['type', 'slug', 'name'] },
  'pricing-rules': { table: 'pricing_rules', fields: PRICING_RULE, required: ['name', 'scopeType', 'adjustmentType', 'adjustmentValue'] },
};
// Child rows. Those with a row_version are edited and soft deleted; the rest have no deleted_at and are deleted.
const CHILDREN = {
  'offerings/variants': { table: 'offering_variants', parent: 'offerings', fk: 'offering_id', fields: VARIANT, required: ['name'], versioned: true },
  'offerings/specs': { table: 'offering_specs', parent: 'offerings', fk: 'offering_id', fields: SPEC, required: ['label', 'value'] },
  'offerings/media': { table: 'offering_media', parent: 'offerings', fk: 'offering_id', fields: MEDIA, required: ['assetId'] },
  'pricing-rules/targets': { table: 'pricing_rule_targets', parent: 'pricing-rules', fk: 'rule_id', fields: TARGET, required: [] },
};

async function insert(client, table, values) {
  const cols = Object.keys(values);
  const { rows } = await client.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
    RETURNING id`, Object.values(values));
  return rows[0].id;
}

// the database clock, for a soft delete
const NOW = Symbol('now');

/** UPDATE one live row at its expected version; 0 rows means not found or a stale version, told apart here. */
async function update(client, table, rowId, version, values, { scope = '', scopeParams = [] } = {}) {
  const cols = Object.keys(values);
  if (!cols.length) bad('nothing to change');
  const set = [];
  const params = [];
  for (const c of cols) {
    if (values[c] === NOW) set.push(`${c} = now()`);
    else { params.push(values[c]); set.push(`${c} = $${params.length}`); }
  }
  const n = params.length;
  params.push(rowId, version, ...scopeParams);
  const { rowCount } = await client.query(`UPDATE ${table} SET ${set.join(', ')}
    WHERE id = $${n + 1}::uuid AND row_version = $${n + 2} AND deleted_at IS NULL${scope.replace(/\$S(\d)/g, (_, i) => `$${n + 2 + Number(i)}`)}`, params);
  if (rowCount) return;
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1::uuid AND deleted_at IS NULL`, [rowId]);
  throw new BridgeRequestError(rows.length ? 'conflict' : 'not_found');
}

async function parentLive(client, resource, parentId) {
  if (!UUID.test(parentId)) throw new BridgeRequestError('not_found');
  const { rows } = await client.query(`SELECT 1 FROM ${PARENTS[resource].table} WHERE id = $1::uuid AND deleted_at IS NULL`, [parentId]);
  if (!rows.length) throw new BridgeRequestError('not_found');
}

async function childRow(client, child, rowId) {
  const { rows } = await client.query(`SELECT ${CHILD_COLUMNS[child.table].join(', ')} FROM ${child.table} WHERE id = $1::uuid`, [rowId]);
  return rows[0] || null;
}

const answer = (status, item, extra = {}) => ({ status, body: { item, ...extra }, rowCount: 1, resourceId: item?.id });
const people = (actor) => { if (!actor.startsWith('user:')) throw new BridgeRequestError('denied', 'people only'); };
const needId = (x) => { if (!UUID.test(x)) throw new BridgeRequestError('not_found'); return x; };

// ── routes ──────────────────────────────────────────────────────────────────────────────────────────
// Each route: capability, people (only a user: actor may call it), run(client, ctx, body) and, for a versioned
// edit, current(client) for the 409 answer.
function catalogueRoute(method, parts) {
  const [res, rowId, sub, childId, extra] = parts;
  const parent = PARENTS[res];
  if (!parent || extra !== undefined) return null;
  if (rowId === undefined) {
    if (method !== 'POST') return null;
    return { run: async (client, ctx, body) => {
      const values = pick(body, parent.fields, { required: parent.required });
      return answer(201, await bridgeRow(client, res, await insert(client, parent.table, { org_id: ctx.org, ...values })));
    } };
  }
  const current = (client) => (UUID.test(rowId) ? bridgeRow(client, res, rowId) : null);
  if (sub === undefined) {
    if (method === 'PATCH') {
      return { current, run: async (client, ctx, body) => {
        const values = pick(body, parent.fields, { allow: ['expectedRowVersion'] });
        await update(client, parent.table, needId(rowId), expectedRowVersion(body), values);
        return answer(200, await bridgeRow(client, res, rowId));
      } };
    }
    if (method === 'DELETE') {
      return { current, run: async (client, ctx, body) => {
        pick(body, {}, { allow: ['expectedRowVersion'] });
        await update(client, parent.table, needId(rowId), expectedRowVersion(body), { deleted_at: NOW });
        return answer(200, await bridgeRow(client, res, rowId));
      } };
    }
    return null;
  }
  if ((sub === 'publish' || sub === 'archive') && childId === undefined && method === 'POST') {
    return { people: true, current, run: async (client, ctx, body) => {
      people(ctx.actor);
      pick(body, {}, { allow: ['expectedRowVersion'] });
      await client.query('SELECT bridge_set_status($1, $2::uuid, $3, $4)',
        [parent.table, needId(rowId), sub === 'publish' ? 'published' : 'archived', expectedRowVersion(body)]);
      return answer(200, await bridgeRow(client, res, rowId));
    } };
  }
  const child = CHILDREN[`${res}/${sub}`];
  if (!child) return null;
  if (childId === undefined) {
    if (method !== 'POST') return null;
    return { run: async (client, ctx, body) => {
      await parentLive(client, res, rowId);
      const values = pick(body, child.fields, { required: child.required });
      const newId = await insert(client, child.table, { org_id: ctx.org, [child.fk]: rowId, ...values });
      return answer(201, await childRow(client, child, newId));
    } };
  }
  const childCurrent = (client) => (UUID.test(childId) ? childRow(client, child, childId) : null);
  if (method === 'PATCH' && child.versioned) {
    return { current: childCurrent, run: async (client, ctx, body) => {
      const values = pick(body, child.fields, { allow: ['expectedRowVersion'] });
      await update(client, child.table, needId(childId), expectedRowVersion(body), values,
        { scope: ` AND ${child.fk} = $S1::uuid`, scopeParams: [needId(rowId)] });
      return answer(200, await childRow(client, child, childId));
    } };
  }
  if (method === 'DELETE' && child.versioned) {
    return { current: childCurrent, run: async (client, ctx, body) => {
      pick(body, {}, { allow: ['expectedRowVersion'] });
      await update(client, child.table, needId(childId), expectedRowVersion(body), { deleted_at: NOW },
        { scope: ` AND ${child.fk} = $S1::uuid`, scopeParams: [needId(rowId)] });
      return answer(200, await childRow(client, child, childId));
    } };
  }
  if (method === 'DELETE') {
    return { run: async (client, ctx, body) => {
      pick(body, {});
      const { rows } = await client.query(`DELETE FROM ${child.table} WHERE id = $1::uuid AND ${child.fk} = $2::uuid
        RETURNING ${CHILD_COLUMNS[child.table].join(', ')}`, [needId(childId), needId(rowId)]);
      if (!rows.length) throw new BridgeRequestError('not_found');
      return answer(200, rows[0]);
    } };
  }
  return null;
}

const QUOTE = {
  status: ['status', oneOf(['new', 'contacted', 'quoted', 'won', 'lost', 'cancelled'])], poReference: ['po_reference', text(200)],
  quotedTotalMinor: ['quoted_total_minor', minor()], validUntil: ['valid_until', date],
};
const LINE = {
  offeringId: ['offering_id', id()], variantId: ['variant_id', id()], offeringName: ['offering_name', text(300, { required: true })],
  variantName: ['variant_name', text(300)], qty: ['qty', int(1, 1e6)], unitPriceMinor: ['unit_price_minor', minor({ nullable: false })],
};
const INVOICE = {
  poReference: ['po_reference', text(200)], subtotalMinor: ['subtotal_minor', minor({ nullable: false })],
  totalMinor: ['total_minor', minor({ nullable: false })],
  lines: ['lines', (x, k) => (Array.isArray(x) && x.length <= 200
    ? x.map((l, i) => (l !== null && typeof l === 'object' && !Array.isArray(l)
      ? { qty: 1, ...pick(l, LINE, { required: ['offeringName', 'unitPriceMinor'] }) } : bad(`${k}[${i}]`)))
    : bad(k))],
};
const IMPORT_ROW = {
  rowNumber: ['row_number', int(1, 1e6)], raw: ['raw', (x, k) => JSON.parse(object(x, k))],
  mapped: ['mapped', (x, k) => (x === null ? null : JSON.parse(object(x, k)))], targetEntity: ['target_entity', text(40)],
  matchKey: ['match_key', text(200)], action: ['action', oneOf(['insert', 'update', 'noop', 'skip', 'error'])],
  errors: ['errors', (x, k) => (Array.isArray(x) ? x : bad(k))],
  before: ['before', (x, k) => (x === null ? null : JSON.parse(object(x, k)))],
  after: ['after', (x, k) => (x === null ? null : JSON.parse(object(x, k)))],
};
const IMPORT = {
  filename: ['filename', text(200, { required: true })],
  type: ['type', oneOf(['offerings', 'variants', 'pricing', 'vendors', 'categories', 'mixed'])],
  columnMapping: ['column_mapping', object], sourceChecksum: ['source_checksum', text(128)],
  rows: ['rows', (x, k) => (Array.isArray(x) && x.length >= 1 && x.length <= 2000 ? x : bad(k))],
};
const BILLING_LINE = {
  customerId: ['customer_id', id({ nullable: false })], offeringId: ['offering_id', id()],
  variantId: ['variant_id', id()], orderId: ['order_id', id()],
  description: ['description', text(2000, { required: true })], qty: ['qty', int(1, 1e6)],
  unitPriceMinor: ['unit_price_minor', minor({ nullable: false })], currency: ['currency', currency],
  billingPeriod: ['billing_period', oneOf(['monthly', 'quarterly', 'annual', 'multi_year'])],
  startsOn: ['starts_on', date], nextBillOn: ['next_bill_on', date], endsOn: ['ends_on', date],
  notes: ['notes', text(10000)],
};
const BILLING_LINE_EDIT = Object.fromEntries(Object.entries(BILLING_LINE).filter(([key]) =>
  !['customerId', 'offeringId', 'variantId', 'orderId'].includes(key)));
BILLING_LINE_EDIT.status = ['status', oneOf(['active', 'paused'])];

/** A dry-run import: the job and its rows as GSAM planned them, validated when no row is an error. */
async function createImport(client, ctx, body) {
  const job = pick(body, IMPORT, { required: ['filename', 'type', 'rows'] });
  const seen = new Set();
  const rows = job.rows.map((r, i) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) bad(`rows[${i}]`);
    const row = { errors: [], ...pick(r, IMPORT_ROW, { required: ['rowNumber', 'raw', 'action'] }) };
    if (seen.has(row.row_number)) bad(`rows[${i}].rowNumber repeats`);
    seen.add(row.row_number);
    // the plan import_skus applies: a create names its offering, an update its variant
    if (row.action === 'insert' && typeof row.mapped?.offeringSlug !== 'string') bad(`rows[${i}].mapped.offeringSlug`);
    if (row.action === 'update' && !UUID.test(String(row.mapped?.variantId))) bad(`rows[${i}].mapped.variantId`);
    return row;
  });
  const count = (a) => rows.filter((r) => r.action === a).length;
  const errors = rows.filter((r) => r.action === 'error').map((r) => r.row_number);
  const { rows: [made] } = await client.query(`INSERT INTO import_jobs (org_id, filename, type, status, dry_run,
      source_checksum, column_mapping, diff_summary, error_summary, total_rows)
    VALUES ($1, $2, $3, $4, true, $5, COALESCE($6::jsonb, '{}'::jsonb), $7::jsonb, $8::jsonb, $9) RETURNING id`,
    [ctx.org, job.filename, job.type, errors.length ? 'failed' : 'validated', job.source_checksum ?? null,
      job.column_mapping ?? null,
      JSON.stringify({ inserts: count('insert'), updates: count('update'), noops: count('noop'), skips: count('skip'), errors: errors.length }),
      JSON.stringify({ errorRows: errors }), rows.length]);
  await client.query(`INSERT INTO import_job_rows (org_id, job_id, row_number, raw, mapped, target_entity, match_key, action,
      errors, before, after)
    SELECT $1, $2, r.row_number, r.raw, r.mapped, r.target_entity, r.match_key, r.action, r.errors, r.before, r.after
      FROM jsonb_to_recordset($3::jsonb) AS r(row_number integer, raw jsonb, mapped jsonb, target_entity text,
           match_key text, action import_row_action, errors jsonb, before jsonb, after jsonb)`,
  [ctx.org, made.id, JSON.stringify(rows.map((r) => ({ target_entity: null, match_key: null, mapped: null, before: null, after: null, ...r })))]);
  return { ...answer(201, await bridgeRow(client, 'imports', made.id)), rowCount: rows.length };
}

function commerceRoute(method, parts) {
  const [res, rowId, action, extra] = parts;
  if (extra !== undefined) return null;
  if (res === 'billing-lines') {
    if (rowId === undefined && action === undefined && method === 'POST') return { run: async (client, ctx, body) => {
      const values = pick(body, BILLING_LINE,
        { required: ['customerId', 'description', 'qty', 'unitPriceMinor', 'currency', 'billingPeriod', 'startsOn'] });
      const lineId = await insert(client, 'billing_lines', { org_id: ctx.org, ...values });
      return answer(201, await bridgeRow(client, 'billing-lines', lineId));
    } };
    if (rowId === undefined || !UUID.test(rowId)) return null;
    const current = (client) => bridgeRow(client, 'billing-lines', rowId);
    if (action === undefined && method === 'PATCH') return { current, run: async (client, ctx, body) => {
      const values = pick(body, BILLING_LINE_EDIT, { allow: ['expectedRowVersion'] });
      await update(client, 'billing_lines', rowId, expectedRowVersion(body), values);
      return answer(200, await current(client));
    } };
    if (action === 'end' && method === 'POST') return { current, run: async (client, ctx, body) => {
      pick(body, { endsOn: ['ends_on', date] }, { required: ['endsOn'], allow: ['expectedRowVersion'] });
      await update(client, 'billing_lines', rowId, expectedRowVersion(body), { status: 'ended', ends_on: body.endsOn, next_bill_on: null });
      return answer(200, await current(client));
    } };
    if (action === undefined && method === 'DELETE') return { current, run: async (client, ctx, body) => {
      pick(body, {}, { allow: ['expectedRowVersion'] });
      await update(client, 'billing_lines', rowId, expectedRowVersion(body), { deleted_at: NOW });
      return answer(200, await current(client));
    } };
    return null;
  }
  if (res === 'fx' && rowId === undefined && method === 'PATCH') {
    return { people: true, current: (client) => bridgeFx(client), run: async (client, ctx, body) => {
      people(ctx.actor);
      const { rate } = pick(body, { usdToGbpDisplayRate: ['rate', decimal(100, 6)] }, { required: ['usdToGbpDisplayRate'], allow: ['expectedRowVersion'] });
      await client.query('SELECT bridge_set_fx($1::numeric, $2)', [rate, expectedRowVersion(body)]);
      return answer(200, await bridgeFx(client));
    } };
  }
  if (res === 'imports' && rowId === undefined && method === 'POST') return { run: createImport };
  if (res === 'imports' && rowId !== undefined && action === 'apply' && method === 'POST') {
    return { people: true, run: async (client, ctx, body) => {
      people(ctx.actor);
      pick(body, {});
      const { rows: [r] } = await client.query('SELECT bridge_import_apply($1::uuid) AS result', [needId(rowId)]);
      return answer(200, await bridgeRow(client, 'imports', rowId), { result: r.result });
    } };
  }
  if (res === 'quotes' && rowId !== undefined && action === undefined && method === 'PATCH') {
    return { current: (client) => (UUID.test(rowId) ? bridgeRow(client, 'quotes', rowId) : null), run: async (client, ctx, body) => {
      const values = pick(body, QUOTE, { allow: ['expectedRowVersion'] });
      await update(client, 'quotes', needId(rowId), expectedRowVersion(body), values);
      return answer(200, await bridgeRow(client, 'quotes', rowId));
    } };
  }
  if (res === 'quotes' && rowId !== undefined && action === 'convert' && method === 'POST') {
    return { run: async (client, ctx, body) => {
      pick(body, {});
      const { rows: [r] } = await client.query('SELECT bridge_convert_quote($1::uuid) AS order_id', [needId(rowId)]);
      return answer(201, await bridgeRow(client, 'orders', r.order_id));
    } };
  }
  const order = (client) => (UUID.test(rowId) ? bridgeRow(client, 'orders', rowId) : null);
  if (res === 'invoices' && rowId !== undefined && action === undefined && method === 'PATCH') {
    return { current: order, run: async (client, ctx, body) => {
      const patch = pick(body, INVOICE, { allow: ['expectedRowVersion'] });
      if (!Object.keys(patch).length) bad('nothing to change');
      await client.query('SELECT bridge_edit_draft_invoice($1::uuid, $2, $3::jsonb)', [needId(rowId), expectedRowVersion(body), JSON.stringify(patch)]);
      return answer(200, await bridgeRow(client, 'orders', rowId));
    } };
  }
  if (res === 'invoices' && rowId !== undefined && action === 'issue' && method === 'POST') {
    return { people: true, current: order, run: async (client, ctx, body) => {
      people(ctx.actor);
      pick(body, {}, { allow: ['expectedRowVersion'] });
      await client.query('SELECT bridge_issue_invoice($1::uuid, $2)', [needId(rowId), expectedRowVersion(body)]);
      return answer(200, await bridgeRow(client, 'orders', rowId));
    } };
  }
  return null;
}

// The refund role reads no table: both functions return the request row.
function refundRoute(method, parts) {
  const [res, rowId, action, extra] = parts;
  if (res !== 'refund-requests' || method !== 'POST' || extra !== undefined) return null;
  if (rowId === undefined) {
    return { run: async (client, ctx, body) => {
      const r = pick(body, { orderId: ['order', id({ nullable: false })], amountMinor: ['amount', minor({ nullable: false })],
        reason: ['reason', text(2000, { required: true })] }, { required: ['orderId', 'amountMinor', 'reason'] });
      const { rows: [row] } = await client.query('SELECT bridge_request_refund($1::uuid, $2::bigint, $3) AS item', [r.order, r.amount, r.reason]);
      return answer(201, row.item);
    } };
  }
  if (action === 'decision') {
    return { people: true, run: async (client, ctx, body) => {
      people(ctx.actor);
      const d = pick(body, { decision: ['decision', oneOf(['approved', 'rejected'])], approvalRef: ['ref', text(200)] }, { required: ['decision'] });
      const { rows: [row] } = await client.query('SELECT bridge_refund_decision($1::uuid, $2, $3) AS item', [needId(rowId), d.decision, d.ref ?? null]);
      return answer(200, row.item);
    } };
  }
  return null;
}

/** The write or refund route for a method and the path parts after /api/admin/v1/, with its capability, or null. */
export function writeRoute(method, parts) {
  const refund = refundRoute(method, parts);
  if (refund) return { capability: 'refund_request', ...refund };
  const route = catalogueRoute(method, parts) || commerceRoute(method, parts);
  return route ? { capability: 'write', ...route } : null;
}

/** The parsed body, checked inside the transaction so a malformed write still leaves its audit row. */
export const runRoute = (route, rawBody) => async (client, ctx) => route.run(client, ctx, parseBody(rawBody));
