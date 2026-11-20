// GET /api/portal-prototypes: the signed-in client's shared prototypes (John, 14 Nov). It takes no parameters: the
// organisation comes from the session, and RLS (076) returns only that organisation's rows.
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { clientPrototypes } from './lib/portal-prototypes.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makePortalPrototypesHandler({ pool = getPool, verify, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'GET') return reply({ error: 'Use GET.' }, 405);
    try {
      const user = await userFromRequest(req, verify);
      if (!UUID.test(user?.id || '')) return reply({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return reply({ error: 'Prototypes unavailable.' }, 503);
      // Every query runs in the client's claims transaction, never on the owner pool, which bypasses RLS (GRE-1797).
      return reply({ data: await asCustomer(db, authIdentity(user), clientPrototypes) });
    } catch (error) {
      log('portal-prototypes: request failed (' + (error?.code || error?.name || 'error') + ')');
      return reply({ error: 'Prototypes unavailable. Please try again.' }, 503);
    }
  };
}

export default makePortalPrototypesHandler();
export const config = { path: '/api/portal-prototypes' };
