// Port of SOURCE src/lib/provision.ts @505ba6a. provisionInvitee logic (idempotent membership, person
// reuse, 23505 race handling, messages) unchanged.
// Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter:
// provisionInvitee(db, p). ensureSignInAccount keeps its name and signature but no longer creates a
// Supabase auth user: website accounts are created by the person through Better Auth sign-up (verified
// email) before they can enrol, so there is nothing to provision here. `import 'server-only'` removed.

/**
 * Shared invitee provisioning — the single place that turns a (name, email)
 * into a person + employee row, plus a working sign-in for that email. Both
 * the admin "invite someone" action and the public self-serve /join flow call
 * this, so the two paths cannot drift.
 *
 * Provider history: under Clerk this file sent invitation emails. Under
 * Supabase Auth there is NO transactional email: ensureSignInAccount()
 * provisions the confirmed auth user, and entry happens through a personal
 * /welcome link (src/lib/login-link.ts) that the organiser shares personally.
 * When a transactional email provider lands (Resend is the candidate), the
 * send step slots back in HERE without touching any caller.
 *
 * This is also the seam the future central website will drive: when the
 * website owns account creation, it calls provisionInvitee() behind an
 * authenticated internal route — nothing else in the interview/admin runtime
 * needs to change, because identity is always re-resolved from the verified
 * email at request time.
 */

export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Escape PostgREST ilike metacharacters in a literal value. */
export function escapeIlike(value) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** @typedef {{ ok: true } | { ok: false, message: string }} InviteAccountOutcome */

/**
 * Make sure this email can sign in: a confirmed Supabase auth user exists
 * (idempotent — already-registered is success). No email is sent; the
 * personal /welcome link is issued separately via issueLoginLink().
 *
 * @param {string} _email
 * @param {string} [_password]
 * @returns {Promise<InviteAccountOutcome>}
 */
export async function ensureSignInAccount(_email, _password) {
  // Port: the source called ensureAuthUser() (Supabase auth admin createUser). On the website the
  // person creates their own Better Auth account (email verified) and enrol requires that session,
  // so there is no account to pre-provision. Always succeeds; kept so callers port unchanged.
  return { ok: true };
}

/**
 * @typedef {{ engagementId: string, unitId: string, name: string, email: string, roleTitle?: string | null,
 *   portalRole?: 'employee' | 'team_leader', canDelegate?: boolean, invitedBy?: string | null }} ProvisionParams
 * name: display name, trimmed by the caller. email: lowercased, EMAIL_SHAPE-validated by the caller.
 */
/**
 * @typedef {{ ok: true, employeeId: string, personId: string | null, alreadyMember: boolean }
 *   | { ok: false, message: string }} ProvisionResult
 */

/**
 * Upsert the person (identity = verified email) and insert the employee row
 * for this engagement. Idempotent: if the email is already on the
 * engagement, returns the existing row with alreadyMember:true rather than
 * erroring. Does NOT check seat headroom or issue sign-in links — callers
 * own those.
 *
 * @param {any} db interviewDb client
 * @param {ProvisionParams} p
 * @returns {Promise<ProvisionResult>}
 */
export async function provisionInvitee(db, p) {
  const portalRole = p.portalRole === 'team_leader' ? 'team_leader' : 'employee';
  const canDelegate = portalRole === 'team_leader' && p.canDelegate === true;

  // Already on this engagement? Idempotent success (a re-clicked join link,
  // or a re-issued admin invite).
  const { data: existing, error: existingError } = await db
    .from('employee')
    .select('id, person_id')
    .eq('engagement_id', p.engagementId)
    .ilike('email', escapeIlike(p.email))
    .limit(1);
  if (existingError) {
    return { ok: false, message: `Could not check the invitation list: ${existingError.message}` };
  }
  if (existing && existing.length > 0) {
    const row = existing[0];
    return { ok: true, employeeId: row.id, personId: row.person_id, alreadyMember: true };
  }

  // person row: reuse on conflict, identity is the verified email.
  let personId = null;
  const { data: person, error: personLookupError } = await db
    .from('person')
    .select('person_id')
    .eq('verified_email', p.email)
    .maybeSingle();
  if (personLookupError) {
    return { ok: false, message: `Could not look up the person record: ${personLookupError.message}` };
  }
  if (person) {
    personId = person.person_id;
  } else {
    const { data: created, error: personInsertError } = await db
      .from('person')
      .insert({ verified_email: p.email, display_name: p.name })
      .select('person_id')
      .maybeSingle();
    if (personInsertError) {
      if (personInsertError.code === '23505') {
        const { data: again } = await db
          .from('person')
          .select('person_id')
          .eq('verified_email', p.email)
          .maybeSingle();
        if (!again) return { ok: false, message: 'Could not create the person record. Please try again.' };
        personId = again.person_id;
      } else {
        return { ok: false, message: `Could not create the person record: ${personInsertError.message}` };
      }
    } else if (created) {
      personId = created.person_id;
    }
  }

  const { data: inserted, error: employeeError } = await db
    .from('employee')
    .insert({
      engagement_id: p.engagementId,
      person_id: personId,
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
    // Lost a race to a concurrent enrol of the same email: treat as member.
    if (employeeError.code === '23505') {
      const { data: row } = await db
        .from('employee')
        .select('id, person_id')
        .eq('engagement_id', p.engagementId)
        .ilike('email', escapeIlike(p.email))
        .limit(1);
      const r = row?.[0];
      if (r) return { ok: true, employeeId: r.id, personId: r.person_id, alreadyMember: true };
    }
    return { ok: false, message: `Could not add the invitation: ${employeeError.message}` };
  }

  return { ok: true, employeeId: inserted.id, personId, alreadyMember: false };
}
