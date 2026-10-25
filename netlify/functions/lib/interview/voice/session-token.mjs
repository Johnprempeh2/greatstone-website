// Port of SOURCE src/lib/voice/session-token.ts @505ba6a. Unchanged apart from stripped types and the
// removed `import 'server-only'` (Port). Server only: uses node:crypto.

/**
 * Per-session bearer tokens for the voice think endpoint.
 *
 * WHY THIS EXISTS: voice inverts who calls whom. In the typed interview the
 * browser calls us carrying the participant's session cookie, so
 * resolveCallerEmail plus the employee row does the authorising. In voice,
 * DEEPGRAM calls our think endpoint server to server. There is no cookie, no
 * user, and the URL is publicly reachable, yet that endpoint drives a real
 * interview and writes to the transcript.
 *
 * A single static shared secret would mean one leak opens every interview. So
 * each voice session gets its own random token: we store only the sha256 and
 * hand the raw token to Deepgram inside the server-minted Settings message.
 * A leaked token is scoped to one session and dies when that session ends.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** @returns {{ token: string, hash: string }} */
export function mintSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two hex hashes. Length is checked first because
 * timingSafeEqual throws on a length mismatch rather than returning false.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function tokenHashMatches(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Pull the bearer token out of an Authorization header. @param {string | null} header */
export function bearerFrom(header) {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}
