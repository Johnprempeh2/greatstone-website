// Port of SOURCE src/lib/provision.ts @505ba6a. provisionInvitee logic (idempotent membership, 23505
// race handling, messages) kept.
// Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter:
// provisionInvitee(db, p). ensureSignInAccount keeps its name and signature but provisions nothing:
// website accounts are created by the person through Better Auth sign-up (verified email) before they
// can enrol. `import 'server-only'` removed.
// Port: identity is the Better Auth user id, not the email. A person row exists only for a signed-in user
// (person.auth_user_id). An invitation made before the person has an account (GSAM's invite) is an
// employee row with user_id and person_id NULL; provisionInvitee with p.userId claims it — the one place
// the email is matched — and from then on the row is the user's by user_id.

/**
 * Shared invitee provisioning — the single place that turns a (name, email)
 * into an employee row, and, for a signed-in user, links it to their person
 * and account. The public self-serve join flow calls this, and so may any
 * future admin "invite someone" action, so the paths cannot drift.
 */

export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Escape PostgREST ilike metacharacters in a literal value. */
export function escapeIlike(value) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** @typedef {{ ok: true } | { ok: false, message: string }} InviteAccountOutcome */

/**
 * Kept so callers port unchanged: there is no account to pre-provision.
 *
 * @param {string} _email
 * @param {string} [_password]
 * @returns {Promise<InviteAccountOutcome>}
 */
export async function ensureSignInAccount(_email, _password) {
  // Port: the source created an auth user here. On the website the person creates their own Better Auth
  // account (email verified) and enrol requires that session. Always succeeds.
  return { ok: true };
}

/**
 * Find or create the person row of a Better Auth user (person.auth_user_id).
 * Idempotent under a concurrent create (the unique auth_user_id wins once).
 *
 * @param {any} db interviewDb client
 * @param {{ userId: string, email: string, name?: string | null }} p
 * @returns {Promise<string>} person_id
 */
export async function ensurePersonForUser(db, { userId, email, name = null }) {
  const lookup = async () => {
    const { data, error } = await db.from('person').select('person_id').eq('auth_user_id', String(userId)).limit(1);
    if (error) throw new Error(`person lookup failed: ${error.message}`);
    return data?.[0]?.person_id ?? null;
  };
  const found = await lookup();
  if (found) return found;
  const { data: created, error: createError } = await db
    .from('person')
    .insert({ auth_user_id: String(userId), verified_email: email.trim().toLowerCase(), display_name: name })
    .select('person_id')
    .single();
  if (createError) {
    if (createError.code === '23505') {
      const again = await lookup();
      if (again) return again;
    }
    throw new Error(`person create failed: ${createError.message}`);
  }
  return created.person_id;
}

/**
 * @typedef {{ engagementId: string, unitId: string, name: string, email: string, userId?: string | null,
 *   customerId?: string | null, roleTitle?: string | null, portalRole?: 'employee' | 'team_leader',
 *   canDelegate?: boolean, invitedBy?: string | null }} ProvisionParams
 * name: display name, trimmed by the caller. email: lowercased, EMAIL_SHAPE-validated by the caller (for a signed-in
 * caller, their verified email). userId: the signed-in caller's Better Auth user id; omitted for an invitation made
 * on someone else's behalf. customerId: the engagement's customer_id (the database fills and checks it either way).
 */
/**
 * @typedef {{ ok: true, employeeId: string, personId: string | null, alreadyMember: boolean, claimed?: boolean }
 *   | { ok: false, message: string }} ProvisionResult
 */

const TAKEN = 'This invitation is linked to another account. Please sign in with the account it was sent to.';

/**
 * Put this person on the engagement. Idempotent:
 *   - the user already holds a row on the engagement: that row (alreadyMember)
 *   - an unclaimed invitation to this email exists: with a userId, claim it (user_id + person link)
 *   - otherwise: insert the employee row (with the user and person when userId is given)
 * Does NOT check seat headroom or issue sign-in links — callers own those.
 *
 * @param {any} db interviewDb client
 * @param {ProvisionParams} p
 * @returns {Promise<ProvisionResult>}
 */
export async function provisionInvitee(db, p) {
  const portalRole = p.portalRole === 'team_leader' ? 'team_leader' : 'employee';
  const canDelegate = portalRole === 'team_leader' && p.canDelegate === true;
  const userId = p.userId ? String(p.userId) : null;

  // Already on this engagement under this account? (A re-clicked join link.)
  if (userId) {
    const { data: mine, error: mineError } = await db
      .from('employee')
      .select('id, person_id')
      .eq('engagement_id', p.engagementId)
      .eq('user_id', userId)
      .limit(1);
    if (mineError) {
      return { ok: false, message: `Could not check the invitation list: ${mineError.message}` };
    }
    if (mine && mine.length > 0) {
      return { ok: true, employeeId: mine[0].id, personId: mine[0].person_id, alreadyMember: true };
    }
  }

  // An invitation to this email (the one place the email is matched).
  const { data: existing, error: existingError } = await db
    .from('employee')
    .select('id, person_id, user_id')
    .eq('engagement_id', p.engagementId)
    .ilike('email', escapeIlike(p.email))
    .limit(1);
  if (existingError) {
    return { ok: false, message: `Could not check the invitation list: ${existingError.message}` };
  }
  if (existing && existing.length > 0) {
    const row = existing[0];
    if (!userId) return { ok: true, employeeId: row.id, personId: row.person_id, alreadyMember: true };
    if (row.user_id && row.user_id !== userId) return { ok: false, message: TAKEN };
    return claim(db, p, row.id, userId);
  }

  let personId = null;
  if (userId) {
    try {
      personId = await ensurePersonForUser(db, { userId, email: p.email, name: p.name });
    } catch (e) {
      return { ok: false, message: `Could not create the person record: ${e.message}` };
    }
  }

  const { data: inserted, error: employeeError } = await db
    .from('employee')
    .insert({
      engagement_id: p.engagementId,
      ...(p.customerId ? { customer_id: p.customerId } : {}),
      person_id: personId,
      user_id: userId,
      unit_id: p.unitId,
      name: p.name,
      email: p.email,
      role_title: p.roleTitle?.trim() || null,
      portal_role: portalRole,
      status: 'invited',
      can_delegate: canDelegate,
      invited_by: p.invitedBy ?? null,
    })
    .select('id')
    .single();

  if (employeeError) {
    // Lost a race to a concurrent enrol of the same person: treat as member.
    if (employeeError.code === '23505') {
      const lookup = db.from('employee').select('id, person_id, user_id').eq('engagement_id', p.engagementId);
      const { data: row } = await (userId ? lookup.eq('user_id', userId) : lookup.ilike('email', escapeIlike(p.email))).limit(1);
      const r = row?.[0];
      if (r) return { ok: true, employeeId: r.id, personId: r.person_id, alreadyMember: true };
      // the email is on the round under an account this caller cannot see
      if (userId) return { ok: false, message: TAKEN };
    }
    return { ok: false, message: `Could not add the invitation: ${employeeError.message}` };
  }

  return { ok: true, employeeId: inserted.id, personId, alreadyMember: false };
}

/** Claim an unclaimed invitation for a signed-in user: user_id (set once, never changed) and the person link. */
async function claim(db, p, employeeId, userId) {
  let personId;
  try {
    personId = await ensurePersonForUser(db, { userId, email: p.email, name: p.name });
  } catch (e) {
    return { ok: false, message: `Could not create the person record: ${e.message}` };
  }
  const { data: claimed, error } = await db
    .from('employee')
    .update({ user_id: userId, person_id: personId })
    .eq('id', employeeId)
    .is('user_id', null)
    .select('id');
  if (error) return { ok: false, message: `Could not accept the invitation: ${error.message}` };
  if (!claimed || claimed.length === 0) {
    // claimed meanwhile: by this user (a double click) is fine, by anyone else is not
    const { data: mine } = await db.from('employee').select('id').eq('id', employeeId).eq('user_id', userId).limit(1);
    if (mine && mine.length > 0) return { ok: true, employeeId, personId, alreadyMember: true };
    return { ok: false, message: TAKEN };
  }
  return { ok: true, employeeId, personId, alreadyMember: true, claimed: true };
}
