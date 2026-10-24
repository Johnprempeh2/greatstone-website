import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asStaff } from './lib/staff-store.mjs';
import { deepdivePlan } from './lib/deepdive-plan.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const OPS = new Set(['capability', 'client-name', 'plan', 'engagements', 'summaries', 'create', 'edit']);

export function makeDeepdivePlanHandler({ pool = getPool, query = deepdivePlan, verify, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const { op, args = {} } = body || {};
    if (!OPS.has(op) || !args || typeof args !== 'object' || Array.isArray(args) ||
        JSON.stringify(body).length > 2_000_000 ||
        (['client-name', 'plan', 'create', 'edit'].includes(op) && !SLUG.test(args.slug || '')) ||
        (op === 'edit' && (!Number.isSafeInteger(args.version) || args.version < 1 ||
          !args.operation || typeof args.operation !== 'object')) ||
        (op === 'create' && (!args.plan || typeof args.plan !== 'object' || Array.isArray(args.plan)))) {
      return json({ error: 'Invalid record request.' }, 400);
    }
    try {
      const user = await userFromRequest(req, verify);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Record service unavailable.' }, 503);
      const data = await asStaff(db, authIdentity(user),
        (client) => query(client, op, args));
      if (data?.forbidden) return json({ error: 'Staff access required.' }, 403);
      if (data?.conflict) return json({ error: 'This record changed while you were typing. Reload before saving again.' }, 409);
      return json({ data });
    } catch (error) {
      if (error?.code === '23505') return json({ error: `A record already exists for "${args.slug}".` }, 409);
      if (error instanceof RangeError || ['22P02', '23514'].includes(error?.code)) return json({ error: error.message || 'Invalid record request.' }, 400);
      if (error?.code === '42501') return json({ error: 'Record access denied.' }, 403);
      log('deepdive-plan: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Record service unavailable. Please try again.' }, 503);
    }
  };
}

export default makeDeepdivePlanHandler();
export const config = { path: '/api/deepdive-plan' };
