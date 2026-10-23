import { asCustomer } from './customer-store.mjs';

export const asStaff = asCustomer;
const TABLES = new Set([
  'users', 'org_settings', 'offerings', 'offering_variants', 'vendors', 'categories',
  'pricing_rules', 'pricing_rule_targets', 'fx_rate_history', 'import_jobs',
  'customers', 'customer_users', 'customer_tiers', 'engagements', 'member_invite_requests',
  'licence_keys', 'orders', 'order_items', 'quotes', 'quote_items',
  'portal_documents', 'portal_acceptances', 'portal_receipt_jobs', 'portal_approvals',
  'front_door_leads', 'service_inquiries',
]);
const RELATIONS = {
  'offerings:vendors': ['vendor_id', 'id', false],
  'offerings:categories': ['category_id', 'id', false],
  'offering_variants:offerings': ['offering_id', 'id', false],
  'customers:customer_tiers': ['tier_id', 'id', false],
  'pricing_rules:pricing_rule_targets': ['id', 'rule_id', true],
  'orders:order_items': ['id', 'order_id', true],
  'orders:licence_keys': ['id', 'order_id', true],
  'quotes:orders': ['id', 'quote_id', true],
  'quotes:quote_items': ['id', 'quote_id', true],
  'licence_keys:orders': ['order_id', 'id', false],
};
const IDENT = /^[a-z_][a-z0-9_]*$/;
const id = (value) => { if (typeof value !== 'string' || !IDENT.test(value)) throw new RangeError('Invalid column'); return '"' + value + '"'; };

function splitSelect(input) {
  const parts = []; let depth = 0; let start = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '(') depth++;
    else if (input[i] === ')') { if (--depth < 0) throw new RangeError('Invalid selection'); }
    else if (input[i] === ',' && depth === 0) { parts.push(input.slice(start, i).trim()); start = i + 1; }
  }
  if (depth) throw new RangeError('Invalid selection');
  parts.push(input.slice(start).trim());
  return parts;
}

function projection(table, alias, columns = '*', depth = 0) {
  if (depth > 3 || typeof columns !== 'string' || columns.length > 2000) throw new RangeError('Invalid selection');
  if (columns === '*') return `to_jsonb(${alias})`;
  const pairs = splitSelect(columns).map((part) => {
    const relation = /^(?:(\w+):)?(\w+)\((.*)\)$/.exec(part);
    if (relation) {
      const [, output, child, selection] = relation;
      const edge = RELATIONS[table + ':' + child];
      if (!edge) throw new RangeError('Invalid relation');
      const name = output || child;
      const childAlias = 'r' + (depth + 1);
      const childProjection = projection(child, childAlias, selection, depth + 1);
      const join = `${childAlias}.${id(edge[1])} = ${alias}.${id(edge[0])}`;
      const value = edge[2]
        ? `(SELECT COALESCE(jsonb_agg(${childProjection}), '[]'::jsonb) FROM ${id(child)} ${childAlias} WHERE ${join})`
        : `(SELECT ${childProjection} FROM ${id(child)} ${childAlias} WHERE ${join} LIMIT 1)`;
      return `'${name}', ${value}`;
    }
    id(part);
    return `'${part}', ${alias}.${id(part)}`;
  });
  return `jsonb_build_object(${pairs.join(', ')})`;
}

function filters(body, values) {
  if (!Array.isArray(body.filters) || body.filters.length > 12) throw new RangeError('Invalid filters');
  return body.filters.map(({ column, op, value }) => {
    const field = 't.' + id(column);
    if (op === 'is' && value === null) return `${field} IS NULL`;
    if (op === 'not-is' && value === null) return `${field} IS NOT NULL`;
    if (!['eq', 'ilike'].includes(op) || value == null || typeof value === 'object') throw new RangeError('Invalid filter');
    values.push(value);
    return `${field} ${op === 'eq' ? '=' : 'ILIKE'} $${values.length}`;
  });
}

export async function staffStore(client, body) {
  const { table, kind, columns = '*', values: payload } = body;
  if (kind === 'rpc') {
    const portalRpc = {
      portal_is_approver: ['SELECT portal_is_approver() AS data', []],
      portal_withdraw: ['SELECT portal_withdraw($1::uuid) AS data', [body.args?.p_document_id]],
      portal_requeue_receipt: ['SELECT portal_requeue_receipt($1::uuid) AS data', [body.args?.p_acceptance_id]],
      portal_receipt_document: ['SELECT to_jsonb(d) AS data FROM portal_receipt_document($1::uuid) d', [body.args?.p_acceptance_id]],
      portal_approve_and_publish: ['SELECT portal_approve_and_publish($1::uuid,$2::text,$3::text) AS data',
        [body.args?.p_document_id, body.args?.p_expected_sha256, body.args?.p_gsam_approval_ref || null]],
    }[body.name];
    if (portalRpc) {
      const { rows } = await client.query(...portalRpc);
      return { data: body.name === 'portal_receipt_document' ? rows.map((row) => row.data) : rows[0]?.data ?? null };
    }
    if (body.name === 'import_skus') {
      if (!Array.isArray(body.args?.p_creates) || !Array.isArray(body.args?.p_updates) ||
          body.args.p_creates.length + body.args.p_updates.length > 5000) throw new RangeError('Invalid import');
      const { rows } = await client.query('SELECT import_skus($1::jsonb, $2::jsonb) AS data', [JSON.stringify(body.args?.p_creates || []), JSON.stringify(body.args?.p_updates || [])]);
      return { data: rows[0]?.data };
    }
    if (body.name === 'convert_quote_to_order') {
      const { rows } = await client.query('SELECT convert_quote_to_order($1::uuid) AS data', [body.args?.p_quote_id]);
      return { data: rows[0]?.data };
    }
    throw new RangeError('Invalid operation');
  }
  if (!TABLES.has(table) || !['select', 'insert', 'update', 'delete'].includes(kind)) throw new RangeError('Invalid operation');
  if (kind === 'delete' && table !== 'front_door_leads') throw new RangeError('Invalid operation');
  if (['front_door_leads', 'service_inquiries'].includes(table)) {
    if (kind === 'insert') throw new RangeError('Invalid operation');
    if (kind === 'update' && (!payload || Object.keys(payload).some((key) =>
      !(table === 'front_door_leads' ? ['status', 'last_contacted_at'] : ['status']).includes(key)))) throw new RangeError('Invalid operation');
  }
  if (['portal_acceptances', 'portal_receipt_jobs', 'portal_approvals'].includes(table) && kind !== 'select')
    throw new RangeError('Invalid operation');
  if (table === 'users' && kind !== 'select') throw new RangeError('Invalid operation');
  if (table !== 'users') {
    const { rows } = await client.query('SELECT app_staff_org() AS org_id');
    if (!rows[0]?.org_id) return { forbidden: true };
  }
  const params = [];
  const clauses = filters(body, params);
  if (table === 'users') { params.push(body.subject); clauses.push(`t.auth_subject = $${params.length}`); }
  else clauses.push('t.org_id = app_staff_org()');
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const returning = body.columns ? ` RETURNING ${projection(table, 't', columns)} AS data` : '';
  let sql;
  if (kind === 'select') {
    if (body.order) {
      id(body.order.column);
      if (typeof body.order.ascending !== 'boolean') throw new RangeError('Invalid order');
    }
    const order = body.order ? ` ORDER BY t.${id(body.order.column)} ${body.order.ascending ? 'ASC' : 'DESC'}` : '';
    const limit = Math.min(5000, Number.isInteger(body.limit) && body.limit >= 0 ? body.limit : 1000);
    if (body.count && body.head) {
      const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${id(table)} t${where}`, params);
      return { data: null, count: rows[0].count };
    }
    sql = `SELECT ${projection(table, 't', columns)} AS data FROM ${id(table)} t${where}${order} LIMIT ${limit}`;
  } else if (kind === 'delete') {
    if (body.filters.length !== 1 || body.filters[0].column !== 'id' || body.filters[0].op !== 'eq') throw new RangeError('Invalid delete');
    sql = `DELETE FROM ${id(table)} t${where}${returning}`;
  } else if (kind === 'update') {
    if (!body.filters.length || !payload || Array.isArray(payload) || typeof payload !== 'object') throw new RangeError('Invalid update');
    const entries = Object.entries(payload);
    if (!entries.length || entries.length > 40) throw new RangeError('Invalid update');
    const set = entries.map(([key, value]) => { params.push(value); return `${id(key)} = $${params.length}`; }).join(', ');
    sql = `UPDATE ${id(table)} t SET ${set}${where}${returning}`;
  } else {
    const rows = Array.isArray(payload) ? payload : [payload];
    if (!rows.length || rows.length > 1000 || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new RangeError('Invalid insert');
    const keys = Object.keys(rows[0]);
    if (!keys.length || keys.length > 40 || rows.some((row) => Object.keys(row).sort().join() !== [...keys].sort().join())) throw new RangeError('Invalid insert');
    const tuples = rows.map((row) => '(' + keys.map((key) => { id(key); params.push(row[key]); return '$' + params.length; }).join(', ') + ')');
    sql = `INSERT INTO ${id(table)} AS t (${keys.map(id).join(', ')}) VALUES ${tuples.join(', ')}${returning}`;
  }
  const { rows } = await client.query(sql, params);
  const data = body.columns ? rows.map((row) => row.data) : null;
  if ((body.single || body.maybeSingle) && data?.length > 1) throw new RangeError('More than one row');
  if (body.single && !data?.length) return { notFound: true };
  return { data: body.single || body.maybeSingle ? data?.[0] || null : data };
}
