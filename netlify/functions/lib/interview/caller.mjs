// Who is calling an interviewee endpoint (GRE-2612). Port of src/lib/caller.ts @505ba6a: the website resolves the
// caller from the Better Auth session cookie, the same account as the client portal. The caller's id (the Better
// Auth user id) is the identity every interview lookup keys on; the verified email is used once, when the person
// claims an invitation at join, so only a VERIFIED email counts. Port: the source's development-only
// x-test-employee-email bypass is not carried over; the tests inject `verify` instead.
import { userFromRequest } from '../better-auth.mjs';
import { deepgramKey } from './keys.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...HEADERS, ...headers } });

/** { id, email, name } for a signed-in, verified caller (id: Better Auth user id); { unverified: true } when the email is not verified; else null. */
export async function participantFromRequest(req, verify) {
  const user = await userFromRequest(req, verify);
  if (!user?.id || typeof user.email !== 'string' || !user.email) return null;
  const verified = user.emailVerified === true || user.email_verified === true || !!user.email_confirmed_at;
  if (!verified) return { unverified: true, email: user.email.toLowerCase() };
  return { id: String(user.id), email: user.email.trim().toLowerCase(), name: user.name || null };
}

/** The interview kill switch: every interviewee endpoint answers 404 unless INTERVIEW_ENABLED is 1. */
export const interviewEnabled = (env = process.env) => env.INTERVIEW_ENABLED === '1';

/** Port of session/page.tsx voiceEnabled(): offered when a Deepgram key is set, and VOICE_ENABLED=0 takes it away. */
export const voiceEnabled = (env = process.env) => env.VOICE_ENABLED !== '0' && Boolean(deepgramKey(env));

/** The request-time switch: GSAM sends a round with `voice: false` to take voice away from it at once, no redeploy. */
export const roundVoiceEnabled = (engagement) => engagement?.branding_config?.voice !== false;
