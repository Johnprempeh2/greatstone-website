// The interviewee pages' server side (GRE-2612): POST /api/interview/portal { op, args } runs one ported server action
// or page loader (lib/interview/portal-ops.mjs) for the signed-in, verified website account. 401 without a session.
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { json, participantFromRequest, interviewEnabled, voiceEnabled } from './lib/interview/caller.mjs';
import { OPS, runPortalOp } from './lib/interview/portal-ops.mjs';

export function makePortalHandler({ pool = getPool, verify, env = process.env, log = console } = {}) {
  return async (req) => {
    if (!interviewEnabled(env)) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (Number(req.headers.get('content-length')) > 16384) return json({ error: 'Invalid request.' }, 400);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const { op, args = {} } = body || {};
    if (typeof op !== 'string' || !Object.hasOwn(OPS, op) || !args || typeof args !== 'object' || Array.isArray(args)) {
      return json({ error: 'Invalid operation.' }, 400);
    }
    let caller;
    try { caller = await participantFromRequest(req, verify); } catch { caller = null; }
    if (!caller) return json({ error: 'Sign in required.' }, 401);
    if (caller.unverified) return json({ error: 'Please verify your email first.', unverified: true }, 403);
    const p = pool();
    if (!p) return json({ error: 'The interview is unavailable. Please try again.' }, 503);
    try {
      const data = await runPortalOp(op, {
        db: interviewDb(caller, { pool: p }), sys: interviewDb('system', { pool: p }), caller, args,
        env: { voice: voiceEnabled(env) }, log,
      });
      return json({ data });
    } catch (error) {
      log.error(`interview-portal: ${op} failed (${error?.code || error?.name || 'error'})`);
      return json({ error: 'Something went wrong on our side. Nothing you said was lost — please try again.' }, 500);
    }
  };
}

export default makePortalHandler();
export const config = { path: '/api/interview/portal' };
