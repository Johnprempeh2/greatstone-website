// The website guide's session token and its limits. The guide has no accounts and no table of its own: a session
// is a signed token the browser holds, and the counting reuses the interview engine's rate counter (bump_rate).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { anthropicKey } from '../interview/keys.mjs';

/** The hard cap on one typed session. A voice call's is shorter (VOICE_GUIDE_CALL_MINUTES in guide.mjs). */
export const SESSION_SECONDS = 600;

// Derived from a secret the guide cannot run without, so there is no extra variable to set.
const signingKey = (env) => {
  const secret = anthropicKey(env);
  return secret ? createHmac('sha256', secret).update('voice-guide-session-key').digest() : null;
};
const sign = (key, text) => createHmac('sha256', key).update(text).digest('base64url');

/** @returns {{ token: string, sid: string, expiresAt: number } | null} null when the guide has no model key. */
export function mintGuideToken(env, now = Date.now(), seconds = SESSION_SECONDS) {
  const key = signingKey(env);
  if (!key) return null;
  const sid = randomBytes(12).toString('base64url');
  const exp = Math.floor(now / 1000) + seconds;
  const body = `v1.${sid}.${exp}`;
  return { token: `${body}.${sign(key, body)}`, sid, expiresAt: exp * 1000 };
}

/** @returns {{ sid: string, expired: boolean } | null} null unless this server signed the token. */
export function readGuideToken(token, env, now = Date.now()) {
  const key = signingKey(env);
  const match = /^(v1\.([A-Za-z0-9_-]{16})\.(\d{10}))\.([A-Za-z0-9_-]{43})$/.exec(typeof token === 'string' ? token : '');
  if (!key || !match) return null;
  if (!timingSafeEqual(Buffer.from(sign(key, match[1])), Buffer.from(match[4]))) return null;
  return { sid: match[2], expired: Number(match[3]) * 1000 <= now };
}

/** A visitor's counter key. Keyed, so the stored value cannot be turned back into an address. */
export function visitorKey(env, ip) {
  const key = signingKey(env);
  return key ? sign(key, `visitor:${ip}`).slice(0, 22) : null;
}

/**
 * True only when the counter says this call is within the limit. `db` gives the interview engine's database client
 * (it throws when there is no database). No database, an error or an odd answer all count as over the limit: a
 * guide that cannot count must not run up a bill. (The interview's withinRate fails open.)
 */
export async function withinLimit(db, key, windowSecs, limit) {
  try {
    const { data, error } = await db().rpc('bump_rate', { p_key: key, p_window_secs: windowSecs, p_limit: limit });
    return !error && data === true;
  } catch {
    return false;
  }
}
