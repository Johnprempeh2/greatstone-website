// GRE-2653: the website account's "See my interview data" and "Delete my interview data".
//   POST /api/interview/my-data { op: 'see' }                                   -> { data: { generatedAt, rounds } }
//   POST /api/interview/my-data { op: 'delete', engagementId, confirm: true }   -> { data: { deleted: true } }
// Better Auth session cookie, verified email; 401 without it. The person reaches only their own rows (RLS by email
// and user id). The response of 'see' is also the download. Counts of a delete stay on the server's deletion record.
import { getPool } from './lib/db.mjs';
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { deleteMyInterviewData, seeMyInterviewData } from './lib/interview/self-service.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeMyDataHandler({ pool = getPool, verify, env = process.env, log = console.error } = {}) {
  return async (req) => {
    if (env.INTERVIEW_ENABLED !== '1') return reply({ error: 'Not found.' }, 404);
    if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    let input;
    try {
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 1024) return reply({ error: 'Invalid request.' }, 400);
      input = JSON.parse(raw);
    } catch { return reply({ error: 'Invalid request.' }, 400); }
    if (!input || !['see', 'delete'].includes(input.op)
      || (input.op === 'delete' && (!UUID.test(input.engagementId || '') || input.confirm !== true))) {
      return reply({ error: 'Invalid request.' }, 400);
    }
    try {
      const user = await userFromRequest(req, verify);
      const identity = user ? authIdentity(user) : null;
      if (!UUID.test(identity?.id || '') || !identity.email) return reply({ error: 'Session expired. Sign in again.' }, 401);
      if (!identity.email_verified) return reply({ error: 'Verify your email address first.' }, 403);
      const db = pool();
      if (!db) return reply({ error: 'Interview data unavailable.' }, 503);
      if (input.op === 'see') return reply({ data: await seeMyInterviewData(db, identity) });
      await deleteMyInterviewData(db, identity, input.engagementId);
      return reply({ data: { deleted: true } });
    } catch (error) {
      if (error?.code === 'NOT_FOUND') return reply({ error: 'No interview found.' }, 404);
      log('interview-my-data failed', error?.code || 'error');
      return reply({ error: 'Something went wrong. Nothing was changed; try again.' }, 500);
    }
  };
}

export default makeMyDataHandler();
export const config = { path: '/api/interview/my-data' };
