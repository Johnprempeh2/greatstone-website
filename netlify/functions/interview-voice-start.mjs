// Port of src/app/api/voice/start/route.ts @505ba6a: starting a spoken interview (GRE-2612).
// The browser is trusted with neither the Deepgram key nor its own Settings (Settings carries the think endpoint that
// drives a real interview), so both are built here after the caller is authorised exactly as the chat endpoint does.
// The browser gets a Deepgram token that expires in well under a minute and Settings whose bearer is scoped to this
// one session. Port: as the source, voice needs a Deepgram key and VOICE_ENABLED=0 switches it off (404); the think URL is /api/interview/voice/think.
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { json, participantFromRequest, interviewEnabled, voiceEnabled } from './lib/interview/caller.mjs';
import { getEmployeeContextByEmail } from './lib/interview/employee.mjs';
import { withinRate } from './lib/interview/ratelimit.mjs';
import { mintSessionToken } from './lib/interview/voice/session-token.mjs';
import { buildVoiceSettings } from './lib/interview/voice/settings.mjs';

// Short: Deepgram only needs the credential valid at connect time.
const TOKEN_TTL_SECONDS = 30;
// Starting a voice session is rare; this only ever catches a stuck client.
const STARTS_PER_MIN = Number(process.env.VOICE_RATE_START_PER_MIN) || 10;

// Deepgram must be able to REACH the think endpoint, and resolves it when Settings arrives, so a localhost value
// fails the session at once. In deployment the request origin is right; locally use a tunnel and the override.
function thinkBaseUrl(req, env) {
  const override = env.VOICE_THINK_BASE_URL;
  if (override) return override.replace(/\/+$/, '');
  return new URL(req.url).origin;
}

/** Deepgram's short-lived credential, minted from the key we never expose. */
export async function grantDeepgramToken(env = process.env, fetchImpl = fetch) {
  const key = env.DEEPGRAM_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchImpl('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.access_token ?? null;
  } catch {
    return null;
  }
}

// Spoken the moment the socket is ready: the human opening, and the warm-up that lets echo cancellation converge
// before anyone talks. Written for the ear, about four and a half seconds; a resumed session gets its own line.
export function greetingFor(firstName, resuming) {
  if (resuming) return `Welcome back${firstName ? `, ${firstName}` : ''}. Carry on whenever you are ready.`;
  return `Hello${firstName ? ` ${firstName}` : ''}, thanks for making the time. Whenever you are ready.`;
}

export function makeVoiceStartHandler({ pool = getPool, verify, grant = grantDeepgramToken, env = process.env } = {}) {
  return async (req) => {
    if (!interviewEnabled(env) || !voiceEnabled(env)) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    // ── Authorisation: identical shape to the chat endpoint, deliberately ──
    let caller;
    try { caller = await participantFromRequest(req, verify); } catch { caller = null; }
    if (!caller) return json({ error: 'Not signed in' }, 401);
    if (caller.unverified) return json({ error: 'Please verify your email first' }, 403);
    const p = pool();
    if (!p) return json({ error: 'Voice is not available right now' }, 503);
    const db = interviewDb(caller, { pool: p });
    const ctx = await getEmployeeContextByEmail(db, caller.email).catch(() => null);
    if (!ctx) return json({ error: 'No matching employee' }, 403);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const sessionId = body?.sessionId;
    if (!sessionId || typeof sessionId !== 'string') return json({ error: 'sessionId required' }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return json({ error: 'Session not found' }, 404);

    if (!(await withinRate(db, `voice:start:${ctx.employee.id}`, 60, STARTS_PER_MIN))) {
      return json({ error: 'Too many attempts, give it a moment' }, 429);
    }
    const { data: sessions, error: sessionError } = await db.from('session').select('*')
      .eq('id', sessionId).eq('employee_id', ctx.employee.id) // ownership, not merely existence
      .limit(1);
    if (sessionError) return json({ error: 'Session lookup failed' }, 500);
    const session = sessions?.[0];
    if (!session) return json({ error: 'Session not found' }, 404);
    if (session.ended_at) return json({ error: 'Session already complete', complete: true }, 409);

    // Fail before writing anything if voice is not configured.
    const deepgramToken = await grant(env);
    if (!deepgramToken) return json({ error: 'Voice is not available right now' }, 503);

    // A fresh bearer per start: re-entering voice rotates it, so a token from an abandoned attempt stops working.
    const { token, hash } = mintSessionToken();
    const { error: updateError } = await db.from('session').update({ voice_token_hash: hash, is_voice: true })
      .eq('id', session.id).eq('employee_id', ctx.employee.id);
    if (updateError) return json({ error: 'Could not start voice mode' }, 500);

    // Decides the greeting, nothing else: the think endpoint reads the turn table itself.
    const { count } = await db.from('turn').select('id', { count: 'exact', head: true }).eq('session_id', session.id);
    const firstName = (ctx.employee.name ?? '').trim().split(/\s+/)[0] ?? '';
    const settings = buildVoiceSettings({
      thinkEndpointUrl: `${thinkBaseUrl(req, env)}/api/interview/voice/think?session=${encodeURIComponent(session.id)}`,
      sessionToken: token,
      greeting: greetingFor(firstName, (count ?? 0) > 0),
    });
    return json({ deepgramToken, settings, expiresIn: TOKEN_TTL_SECONDS });
  };
}

export default makeVoiceStartHandler();
export const config = { path: '/api/interview/voice/start' };
