// Port of SOURCE src/lib/login-link.ts @505ba6a, reduced to the parts that still mean something on the
// website: the token hashing helper and the default link lifetime.
// Port: NOT ported, on purpose. Sign-in is the website's Better Auth account (verified email), and the
// site never mints sessions on someone's behalf, so these source exports have no website equivalent:
// authUserExists, ensureAuthUser (Supabase auth admin createUser), issueLoginLink and consumeLoginToken
// (the personal /welcome/<token> link that signed a person in), requestOrigin (Next.js headers),
// mintSessionTokenHash and createSessionForEmail (Supabase magic-link session creation), and the
// re-exported authApiKey. Entry is `#join/<token>` plus a website sign-in instead (docs/INTERVIEW-ENGINE.md).

import { createHash } from 'node:crypto';

export const DEFAULT_LINK_DAYS = 14;

/** sha256 hex of a raw link token; only the hash is ever stored. */
export function hashLoginToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
