// The interview engine's data client (GRE-2612). The source engine was written against supabase-js with the service
// role; this is the same call surface over the site's Netlify Database pool, so the ported modules keep their queries.
// Each call is one statement in its own transaction, as each supabase-js call was one HTTP request:
//   BEGIN; SET LOCAL ROLE interview_worker; SET LOCAL search_path TO interview, public; claims; <statement>; COMMIT
// interview_worker does not bypass RLS, and role and claims end with the transaction (the claims bridge).
// Supported: from().select/insert/update/upsert/delete, eq neq gt gte lt lte like ilike is in contains not filter,
// order limit range single maybeSingle, count, rpc(). Embedded selects (`a:b!inner(…)`) are not: use db.sql().
import { getPool } from '../db.mjs';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };

/** Claims for one request: a signed-in participant ({ id, email }) or 'system' (bridge, jobs, voice after its token). */
export function claimsFor(identity) {
  if (identity === 'system') return { role: 'interview_worker', scope: 'system' };
  const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (!identity?.id || !email) throw new Error('interviewDb: a participant needs a verified id and email');
  return { role: 'interview_worker', scope: 'participant', sub: String(identity.id), email, email_verified: true };
}

const quote = (name) => {
  if (!IDENT.test(name)) throw new QueryError('PGRST100', `Unsupported identifier: ${name}`);
  return `"${name}"`;
};

// "col", "payload->engagement->>id" (JSON path, as supabase filter() takes)
function column(path) {
  const parts = String(path).trim().split(/(->>?)/);
  let sql = quote(parts[0]);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i + 1];
    if (!IDENT.test(key) && !/^\d+$/.test(key)) throw new QueryError('PGRST100', `Unsupported path: ${path}`);
    sql += `${parts[i]}${/^\d+$/.test(key) ? key : `'${key}'`}`;
  }
  return sql;
}

function selectList(cols) {
  const text = (cols ?? '*').trim();
  if (text === '*' || text === '') return '*';
  return text.split(',').map((raw) => {
    const item = raw.trim();
    if (item.includes('(') || item.includes('!')) throw new QueryError('PGRST100', 'Embedded selects are not supported; use db.sql()');
    const [alias, name] = item.includes(':') ? item.split(':').map((s) => s.trim()) : [null, item];
    if (name === '*') return '*';
    return alias ? `${column(name)} AS ${quote(alias)}` : column(name);
  }).join(', ');
}

export class QueryError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const asError = (e) => ({ code: e?.code || 'XX000', message: e?.message || 'query failed', details: e?.detail ?? e?.details ?? null,
  hint: e?.hint ?? null });

// supabase-js returns ISO timestamps and numbers; node-pg returns Dates, and strings for int8 and numeric.
let pgTypes;
async function types() {
  if (!pgTypes) {
    const mod = await import('pg');
    const base = (mod.default || mod).types;
    const iso = (oid) => { const parse = base.getTypeParser(oid, 'text');
      return (v) => { const d = parse(v); return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : d; }; };
    const own = { 20: Number, 1700: Number, 1184: iso(1184), 1114: iso(1114) };
    pgTypes = { getTypeParser: (oid, format) => (format !== 'binary' && own[oid]) || base.getTypeParser(oid, format) };
  }
  return pgTypes;
}

/** Runs one statement under the interview role and the given claims, in its own transaction. */
export async function runStatement(pool, claims, text, values = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE interview_worker');
    await client.query('SET LOCAL search_path TO interview, public');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await client.query({ text, values, types: await types() });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* connection gone */ }
    throw error;
  } finally {
    client.release();
  }
}

// Column and function argument types, so a JS array or object bound for json/jsonb is sent as JSON (node-pg would
// send a JS array as a Postgres array literal). Read once per table or function and kept.
const columnTypes = new Map();
const functionShapes = new Map();

async function tableColumns(run, table) {
  if (!columnTypes.has(table)) {
    columnTypes.set(table, run(`SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_attribute a WHERE a.attrelid = to_regclass('interview.' || $1) AND a.attnum > 0 AND NOT a.attisdropped`, [table])
      .then((r) => new Map(r.rows.map((c) => [c.name, c.type])))
      .catch((e) => { columnTypes.delete(table); throw e; }));
  }
  return columnTypes.get(table);
}

const isJson = (type) => type === 'json' || type === 'jsonb';
const bind = (value, type) => {
  if (value === undefined) return null;
  if (isJson(type) && value !== null) return JSON.stringify(value);
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) return JSON.stringify(value);
  return value;
};

class Builder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = 'select';
    this.cols = '*';
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.offsetN = null;
    this.mode = null;            // 'one' | 'maybe'
    this.returning = null;       // columns after a write, when .select() is chained
    this.countMode = null;
    this.head = false;
  }

  select(cols = '*', opts = {}) {
    if (this.op === 'select') {
      this.cols = cols;
      this.countMode = opts.count || null;
      this.head = !!opts.head;
    } else {
      this.returning = cols;
    }
    return this;
  }
  insert(rows, opts = {}) { this.op = 'insert'; this.payload = rows; this.countMode = opts.count || null; return this; }
  update(patch, opts = {}) { this.op = 'update'; this.payload = patch; this.countMode = opts.count || null; return this; }
  upsert(rows, opts = {}) {
    this.op = 'upsert'; this.payload = rows; this.onConflict = opts.onConflict || null;
    this.ignoreDuplicates = !!opts.ignoreDuplicates; return this;
  }
  delete(opts = {}) { this.op = 'delete'; this.countMode = opts.count || null; return this; }

  filterOp(col, op, value) { this.filters.push({ col, op, value }); return this; }
  eq(c, v) { return this.filterOp(c, 'eq', v); }
  neq(c, v) { return this.filterOp(c, 'neq', v); }
  gt(c, v) { return this.filterOp(c, 'gt', v); }
  gte(c, v) { return this.filterOp(c, 'gte', v); }
  lt(c, v) { return this.filterOp(c, 'lt', v); }
  lte(c, v) { return this.filterOp(c, 'lte', v); }
  like(c, v) { return this.filterOp(c, 'like', v); }
  ilike(c, v) { return this.filterOp(c, 'ilike', v); }
  is(c, v) { return this.filterOp(c, 'is', v); }
  in(c, v) { return this.filterOp(c, 'in', v); }
  contains(c, v) { return this.filterOp(c, 'contains', v); }
  not(c, op, v) { this.filters.push({ col: c, op, value: v, negate: true }); return this; }
  filter(c, op, v) { return this.filterOp(c, op, v); }
  match(obj) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }

  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst }); return this; }
  limit(n) { this.limitN = Number(n); return this; }
  range(from, to) { this.offsetN = Number(from); this.limitN = Number(to) - Number(from) + 1; return this; }
  single() { this.mode = 'one'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  where(values, types) {
    if (!this.filters.length) return '';
    const parts = this.filters.map(({ col, op, value, negate }) => {
      const c = column(col);
      const type = types?.get(String(col).split(/->/)[0]);
      let sql;
      if (op === 'is') {
        const v = value === null || value === 'null' ? 'NULL' : value === true || value === 'true' ? 'TRUE'
          : value === false || value === 'false' ? 'FALSE' : null;
        if (!v) throw new QueryError('PGRST100', 'is() takes null, true or false');
        sql = `${c} IS ${v}`;
      } else if (op === 'in') {
        // not('col','in','(a,b)') passes PostgREST's list syntax
        const list = Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        values.push(list);
        sql = `${c} = ANY($${values.length})`;
      } else if (op === 'contains' || op === 'cs') {
        values.push(isJson(type) || (value && typeof value === 'object' && !Array.isArray(value)) ? JSON.stringify(value) : value);
        sql = `${c} @> $${values.length}`;
      } else if (OPS[op]) {
        values.push(bind(value, type));
        sql = `${c} ${OPS[op]} $${values.length}`;
      } else {
        throw new QueryError('PGRST100', `Unsupported filter: ${op}`);
      }
      return negate ? `NOT (${sql})` : sql;
    });
    return ` WHERE ${parts.join(' AND ')}`;
  }

  async build() {
    const t = quote(this.table);
    const values = [];
    const types = this.op === 'select' && !this.filters.some((f) => f.op === 'contains')
      ? null : await tableColumns(this.db.run, this.table);
    if (this.op === 'select') {
      const order = this.orders.length ? ` ORDER BY ${this.orders.map((o) =>
        `${column(o.col)} ${o.asc ? 'ASC' : 'DESC'}${o.nullsFirst === undefined ? '' : o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST'}`).join(', ')}` : '';
      const where = this.where(values, types);
      if (this.head) return { text: `SELECT count(*)::int AS count FROM ${t}${where}`, values, head: true };
      const count = this.countMode ? ', count(*) OVER ()::int AS "__count"' : '';
      const limit = this.limitN != null ? ` LIMIT ${Math.max(0, Math.floor(this.limitN))}` : '';
      const offset = this.offsetN ? ` OFFSET ${Math.max(0, Math.floor(this.offsetN))}` : '';
      return { text: `SELECT ${selectList(this.cols)}${count} FROM ${t}${where}${order}${limit}${offset}`, values };
    }
    const returning = this.returning != null ? ` RETURNING ${selectList(this.returning)}` : '';
    if (this.op === 'delete') {
      if (!this.filters.length) throw new QueryError('21000', 'DELETE requires a filter');
      return { text: `DELETE FROM ${t}${this.where(values, types)}${returning}`, values };
    }
    if (this.op === 'update') {
      const entries = Object.entries(this.payload || {}).filter(([, v]) => v !== undefined);
      if (!entries.length) throw new QueryError('PGRST100', 'Empty update');
      if (!this.filters.length) throw new QueryError('21000', 'UPDATE requires a filter');
      const set = entries.map(([k, v]) => { values.push(bind(v, types.get(k))); return `${quote(k)} = $${values.length}`; });
      return { text: `UPDATE ${t} SET ${set.join(', ')}${this.where(values, types)}${returning}`, values };
    }
    // insert / upsert: the columns are the union of the rows' keys; a missing key takes the column default
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
    if (!rows.length) return { text: null, values };
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const tuples = rows.map((row) => `(${cols.map((k) => {
      if (row[k] === undefined) return 'DEFAULT';
      values.push(bind(row[k], types.get(k)));
      return `$${values.length}`;
    }).join(', ')})`);
    let text = `INSERT INTO ${t} (${cols.map(quote).join(', ')}) VALUES ${tuples.join(', ')}`;
    if (this.op === 'upsert') {
      const target = (this.onConflict || 'id').split(',').map((s) => quote(s.trim()));
      const rest = cols.filter((k) => !target.includes(quote(k)));
      text += this.ignoreDuplicates || !rest.length ? ` ON CONFLICT (${target.join(', ')}) DO NOTHING`
        : ` ON CONFLICT (${target.join(', ')}) DO UPDATE SET ${rest.map((k) => `${quote(k)} = EXCLUDED.${quote(k)}`).join(', ')}`;
    }
    return { text: text + returning, values };
  }

  async execute() {
    try {
      const q = await this.build();
      if (!q.text) return { data: this.returning != null ? [] : null, error: null, count: 0 };
      const result = await this.db.run(q.text, q.values);
      if (q.head) return { data: null, error: null, count: result.rows[0]?.count ?? 0 };
      let rows = result.rows;
      let count = null;
      if (this.countMode) {
        count = this.op === 'select' ? (rows[0]?.__count ?? 0) : result.rowCount;
        if (this.op === 'select') rows = rows.map(({ __count, ...r }) => r); // eslint-disable-line no-unused-vars
      }
      const data = this.op !== 'select' && this.returning == null ? null : rows;
      if (this.mode && data) {
        if (data.length > 1 || (this.mode === 'one' && data.length === 0)) {
          return { data: null, error: { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned`,
            details: `The result contains ${data.length} rows`, hint: null }, count };
        }
        return { data: data[0] ?? null, error: null, count };
      }
      return { data, error: null, count };
    } catch (e) {
      return { data: null, error: asError(e), count: null };
    }
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

async function functionShape(run, fn) {
  if (!functionShapes.has(fn)) {
    functionShapes.set(fn, run(`SELECT p.proretset AS set, t.typname AS ret, t.typtype AS kind,
        coalesce(p.proargnames, '{}') AS names, ARRAY(SELECT format_type(x, NULL) FROM unnest(p.proargtypes) x) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype
      WHERE n.nspname = 'interview' AND p.proname = $1 LIMIT 1`, [fn])
      .then((r) => r.rows[0] || null)
      .catch((e) => { functionShapes.delete(fn); throw e; }));
  }
  return functionShapes.get(fn);
}

/**
 * The engine's db client for one request. identity: Better Auth { id, email } (email verified) or 'system'.
 * Pass { pool } to use another pool (tests).
 */
export function interviewDb(identity, { pool = getPool() } = {}) {
  if (!pool) throw new Error('interviewDb: the database is not configured');
  const claims = claimsFor(identity);
  return makeDb(claims, (text, values) => runStatement(pool, claims, text, values));
}

/**
 * The same client inside a transaction someone else holds (the admin bridge, so a round's writes commit with its
 * audit row). Each statement runs in a savepoint as interview_worker with system claims plus the bridge org, and the
 * holder's role, claims and search_path are put back after it. A failed statement rolls back to its savepoint only,
 * as a failed supabase-js call left the others standing.
 */
export function interviewDbOnClient(client, extraClaims = {}) {
  const claims = { ...claimsFor('system'), ...extraClaims };
  let held;
  let queue = Promise.resolve();
  const run = (text, values) => {
    const step = queue.then(async () => {
      if (!held) {
        const { rows: [h] } = await client.query(`SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims,
          current_setting('search_path') AS path`);
        held = h;
      }
      await client.query('SAVEPOINT interview_stmt');
      try {
        await client.query('SET LOCAL ROLE interview_worker');
        await client.query('SET LOCAL search_path TO interview, public');
        await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        const result = await client.query({ text, values, types: await types() });
        await restore(client, held);
        await client.query('RELEASE SAVEPOINT interview_stmt');
        return result;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT interview_stmt');
        await client.query('RELEASE SAVEPOINT interview_stmt');
        throw error;
      }
    });
    queue = step.catch(() => {});
    return step;
  };
  return makeDb(claims, run);
}

async function restore(client, held) {
  await client.query(`SET LOCAL ROLE ${quote(held.role)}`);
  await client.query("SELECT set_config('search_path', $1, true)", [held.path]);
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [held.claims ?? '']);
}

function makeDb(claims, run) {
  const db = {
    claims,
    run,
    from: (table) => new Builder(db, table),
    async rpc(fn, args = {}) {
      try {
        const shape = await functionShape(db.run, quote(fn).slice(1, -1));
        if (!shape) return { data: null, error: { code: 'PGRST202', message: `Could not find the function ${fn}` } };
        const values = [];
        const named = Object.entries(args).map(([k, v]) => {
          const i = shape.names.indexOf(k);
          values.push(bind(v, i >= 0 ? shape.args[i] : null));
          return `${quote(k)} => $${values.length}`;
        }).join(', ');
        const call = `${quote(fn)}(${named})`;
        if (shape.ret === 'void') { await db.run(`SELECT ${call}`, values); return { data: null, error: null }; }
        if (shape.set || shape.kind === 'c' || shape.ret === 'record') {
          const r = await db.run(`SELECT * FROM ${call}`, values);
          const rows = shape.kind === 'c' || shape.ret === 'record' ? r.rows : r.rows.map((row) => Object.values(row)[0]);
          return { data: shape.set ? rows : rows[0] ?? null, error: null };
        }
        const r = await db.run(`SELECT ${call} AS value`, values);
        return { data: r.rows[0]?.value ?? null, error: null };
      } catch (e) {
        return { data: null, error: asError(e) };
      }
    },
    async sql(text, values = []) {
      try {
        const r = await db.run(text, values);
        return { data: r.rows, error: null, count: r.rowCount };
      } catch (e) {
        return { data: null, error: asError(e), count: null };
      }
    },
  };
  return db;
}


/** One transaction for several engine statements (retention delete): work(db) commits together or not at all. */
export async function inInterviewTransaction(pool, work, extraClaims = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(interviewDbOnClient(client, extraClaims));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* connection gone */ }
    throw error;
  } finally {
    client.release();
  }
}
