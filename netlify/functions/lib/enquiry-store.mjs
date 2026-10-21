// The enquiry inbox on Netlify Database (migration 001_enquiry_inbox). Every query runs in its own short
// transaction as `anon`, with the claims set local to it, so nothing runs as the owner and nothing carries
// over to the next request on a pooled connection. `anon` may insert a contact enquiry and call the two
// narrow functions; it cannot read rows back, so the id is made here instead of RETURNING it.
import { randomUUID } from 'node:crypto';

const ANON_CLAIMS = JSON.stringify({ role: 'anon' });
// the columns `anon` holds INSERT on; enquiryRow() (supabase/functions/_shared/enquiry.mjs) fills them
const COLUMNS = ['id', 'services', 'contact_name', 'contact_email', 'contact_company', 'message', 'size_band', 'industry', 'attribution', 'source', 'ip'];
const JSONB = new Set(['services', 'attribution']);
const INSERT = `INSERT INTO service_inquiries (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c, i) => '$' + (i + 1) + (JSONB.has(c) ? '::jsonb' : '')).join(', ')})`;

export async function asAnon(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [ANON_CLAIMS]);
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* the connection is gone */ }
    throw e;
  } finally {
    client.release();
  }
}

// handleEnquiry's database half. `pool` may be null (no database configured): the count is unknown and the
// row is not saved, so the alert carries the enquiry. Errors are logged by code only, never with the row.
export function enquiryStore(pool, { log = () => {}, newId = randomUUID } = {}) {
  const fail = (what) => (e) => { log('error', `enquiry: ${what} (${(e && (e.code || e.name)) || 'error'})`); return null; };
  return {
    countRecent: (ip) => (pool
      ? asAnon(pool, async (c) => (await c.query('SELECT enquiry_recent_count($1) AS n', [ip])).rows[0].n).catch(fail('could not count'))
      : Promise.resolve(null)),
    saveRow: (row) => {
      if (!pool) { log('error', 'enquiry: no database configured'); return Promise.resolve(null); }
      const id = newId();
      const values = COLUMNS.map((c) => (c === 'id' ? id : JSONB.has(c) ? JSON.stringify(row[c] ?? (c === 'services' ? [] : {})) : row[c] ?? null));
      return asAnon(pool, (c) => c.query(INSERT, values)).then(() => ({ id }), fail('not saved'));
    },
    markAlerted: (id) => (pool
      ? asAnon(pool, (c) => c.query('SELECT enquiry_mark_alerted($1)', [id])).catch(fail('alert_sent_at not set'))
      : Promise.resolve(null)),
  };
}
