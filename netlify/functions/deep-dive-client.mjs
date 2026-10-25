import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { answerForClient, clientSnapshot } from './lib/deep-dive-client.mjs';
import { sendDeepDiveAnswer } from './lib/deep-dive-answer.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeDeepDiveClientHandler({ pool = getPool, verify, send = sendDeepDiveAnswer,
  log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    if (Number(req.headers.get('content-length')) > 4096) return reply({ error: 'Invalid request.' }, 400);
    let input;
    try {
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 4096) return reply({ error: 'Invalid request.' }, 400);
      input = JSON.parse(raw);
    } catch { return reply({ error: 'Invalid request.' }, 400); }
    if (!input || !['overview', 'answer', 'retry'].includes(input.op) ||
      (input.op !== 'overview' && !UUID.test(input.requestId || '')) ||
      (input.op === 'answer' && (typeof input.note !== 'string' || !input.note.trim() || input.note.length > 2000))) {
      return reply({ error: 'Invalid request.' }, 400);
    }
    const token = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return reply({ error: 'Sign in required.' }, 401);
    try {
      const check = verify || (async (value) => {
        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Auth unavailable');
        const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(value);
        return error ? null : data.user;
      });
      const user = await check(token);
      if (!UUID.test(user?.id || '')) return reply({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return reply({ error: 'Deep Dive unavailable.' }, 503);
      const identity = { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at };
      if (input.op === 'overview') return reply({ data: await asCustomer(db, identity, clientSnapshot) });
      const row = await asCustomer(db, identity, async (client) => {
        const access = await answerForClient(client, input.requestId);
        if (!access && input.op === 'answer') return null;
        if (input.op === 'retry') {
          const { rows } = await client.query(`SELECT * FROM deep_dive_answers
            WHERE request_id=$1 AND customer_id=app_customer_id() AND status='pending' LIMIT 1`, [input.requestId]);
          return rows[0] || null;
        }
        const { rows } = await client.query(`INSERT INTO deep_dive_answers
          (tenant_id,request_id,customer_id,customer_user_id,name,email,note)
          SELECT $1,$2,app_customer_id(),cu.id,cu.full_name,cu.email,$3 FROM customer_users cu
          WHERE cu.auth_subject=$4 AND cu.customer_id=app_customer_id() AND cu.deleted_at IS NULL
          ON CONFLICT (tenant_id,request_id,customer_id) DO UPDATE SET note=EXCLUDED.note
          WHERE deep_dive_answers.status='pending'
          RETURNING *`, [access.tenantId, input.requestId, input.note.trim(), user.id]);
        if (rows[0]) return rows[0];
        const existing = await client.query(`SELECT * FROM deep_dive_answers
          WHERE request_id=$1 AND customer_id=app_customer_id() LIMIT 1`, [input.requestId]);
        return existing.rows[0] || null;
      });
      if (!row) return reply({ error: 'This request is not available.' }, 404);
      if (row.status === 'received') return reply({ data: { status: 'received' } });
      const received = await send(row);
      if (received) await db.query(`UPDATE deep_dive_answers
        SET status='received',received_at=now() WHERE answer_id=$1 AND customer_id=$2 AND status='pending'`,
      [row.answer_id, row.customer_id]);
      return reply({ data: { status: received ? 'received' : 'pending' } }, received ? 200 : 202);
    } catch (error) {
      log('deep-dive-client: request failed (' + (error?.code || error?.name || 'error') + ')');
      return reply({ error: 'Deep Dive unavailable. Please try again.' }, 503);
    }
  };
}

export default makeDeepDiveClientHandler();
export const config = { path: '/api/deep-dive-client' };
