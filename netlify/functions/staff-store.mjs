import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asStaff, staffStore } from './lib/staff-store.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeStaffStoreHandler({ pool = getPool, query = staffStore, verify, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
    if (JSON.stringify(body).length > 2_000_000) return json({ error: 'Request too large.' }, 413);
    try {
      const user = await userFromRequest(req, verify);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Staff service unavailable.' }, 503);
      const identity = authIdentity(user);
      const result = await asStaff(db, identity, (client) => query(client, { ...body, subject: identity.id }));
      if (result.forbidden) return json({ error: 'Staff access required.' }, 403);
      if (result.notFound) return json({ error: 'Record not found.' }, 404);
      return json(result);
    } catch (error) {
      if (error instanceof RangeError || ['22P02', '23514'].includes(error?.code)) return json({ error: 'Invalid staff request.' }, 400);
      if (error?.code === '23505') return json({ error: 'This record already exists.', code: error.code }, 409);
      log('staff-store: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Staff service unavailable. Please try again.' }, 503);
    }
  };
}

export default makeStaffStoreHandler();
export const config = { path: '/api/staff-store' };
