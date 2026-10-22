import { supabase } from '../lib/supabase.mjs';

async function request(body) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { data: null, error: { message: 'Sign in required.' } };
    const response = await fetch('/api/staff-store', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    return response.ok ? { data: result.data, count: result.count ?? null, error: null }
      : { data: null, error: { message: result.error || 'Staff service unavailable.', code: result.code } };
  } catch {
    return { data: null, error: { message: 'Staff service unavailable. Please try again.' } };
  }
}

class StaffQuery {
  constructor(table) { this.body = { kind: 'select', table, filters: [] }; }
  select(columns = '*', options = {}) { this.body.columns = columns; this.body.count = options.count === 'exact'; this.body.head = !!options.head; return this; }
  insert(values) { this.body.kind = 'insert'; this.body.values = values; this.body.columns = null; return this; }
  update(values) { this.body.kind = 'update'; this.body.values = values; this.body.columns = null; return this; }
  eq(column, value) { this.body.filters.push({ column, op: 'eq', value }); return this; }
  is(column, value) { this.body.filters.push({ column, op: 'is', value }); return this; }
  not(column, op, value) { this.body.filters.push({ column, op: 'not-' + op, value }); return this; }
  ilike(column, value) { this.body.filters.push({ column, op: 'ilike', value }); return this; }
  order(column, { ascending = true } = {}) { this.body.order = { column, ascending }; return this; }
  limit(value) { this.body.limit = value; return this; }
  single() { this.body.single = true; return this; }
  maybeSingle() { this.body.maybeSingle = true; return this; }
  then(resolve, reject) { return request(this.body).then(resolve, reject); }
}

export const staffDb = {
  from: (table) => new StaffQuery(table),
  rpc: (name, args) => request({ kind: 'rpc', name, args }),
};
