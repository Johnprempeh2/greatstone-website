// Port of src/app/join/[token]/page.tsx and src/app/join/actions.ts enrol() @505ba6a (GRE-2612): the round's
// shareable join link, #join/<token>. POST /api/interview/join:
//   { op: 'info', token, team? }  public: is the link active, the client's name, the allowed domains, the teams
//   { op: 'enrol', token, name, unitId? }  signed in with a VERIFIED website account
// Gated as the source: the token is active and unexpired, the email is on an allowed work domain, a team target is a
// real team of this round (re-checked, never trusted), a seat is free (claim_seat stays the hard gate at session
// start), and rate limits per token and per IP.
// Port: identity is the website account (Better Auth, email verified), so the source's typed-email identity gap is
// closed: nobody enrols as an address they cannot read. Enrolment is the ONE place the email is matched: an
// invitation GSAM sent to the verified email (employee.user_id still NULL) is claimed here, which sets its user_id
// and person link; every later request finds the row by the Better Auth user id alone. A new row carries the
// caller's user id and the round's customer_id from the start. The account is made by the person on the sign-up form, so
// the source's password handling, "already registered" routing and session minting are gone. Port: the source made
// the first person to sign up the client's administrator; GSAM names client admins through the bridge instead, so
// self-enrolment always makes an interviewee.
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { json, participantFromRequest, interviewEnabled } from './lib/interview/caller.mjs';
import { withinRate } from './lib/interview/ratelimit.mjs';
import { provisionInvitee, escapeIlike } from './lib/interview/provision.mjs';
import { logAudit } from './lib/interview/audit.mjs';
import { acceptanceFor } from './lib/interview/agreement.mjs';

const welcome = () => ({ ok: true, redirect: '#portal/interview', message: 'Welcome aboard — taking you to your conversation…' });
const SPOKEN_FOR = new Set(['invited', 'started', 'completed']);
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientIp = (req) => req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

async function roundForToken(sys, token) {
  const { data: engs, error } = await sys.from('engagement')
    .select('id, client_name, customer_id, seat_total, enrol_enabled, enrol_expires_at, allowed_email_domains, default_unit_id, status, target_minutes')
    .eq('enrol_token', token).limit(1);
  if (error) throw new Error('engagement lookup failed');
  return engs?.[0] ?? null;
}

async function teamsFor(sys, eng) {
  const { data: units } = await sys.from('org_unit').select('id, name, kind').eq('engagement_id', eng.id)
    .neq('kind', 'organisation').order('name');
  // The default landing unit is the catch-all, not a real team someone would pick.
  return (units ?? []).filter((u) => u.id !== eng.default_unit_id).map((u) => ({ id: u.id, name: u.name }));
}

export async function joinInfo(sys, token, team) {
  const eng = TOKEN.test(token || '') ? await roundForToken(sys, token) : null;
  const expired = eng?.enrol_expires_at ? new Date(eng.enrol_expires_at).getTime() < Date.now() : false;
  // Port: a round GSAM has not opened (draft) or has closed is not active either
  // and no join link works until the organisation has accepted the data processing agreement (GRE-2794)
  const valid = Boolean(eng && eng.enrol_enabled && !expired && eng.status === 'active' && await acceptanceFor(sys, eng.customer_id));
  if (!valid) return { valid: false, expired };
  const teams = await teamsFor(sys, eng);
  const teamUnit = team ? teams.find((t) => t.id === team) ?? null : null;
  return { valid: true, clientName: eng.client_name, domains: eng.allowed_email_domains ?? [], targetMinutes: eng.target_minutes ?? 20,
    team: teamUnit, teams: teamUnit ? [] : teams };
}

export async function enrol({ db, sys, caller, token, name: nameRaw, unitId: unitIdRaw, ip, env = process.env }) {
  const name = (nameRaw ?? '').trim() || caller.name || '';
  const email = caller.email;
  const unitId = (unitIdRaw ?? '').trim() || null;
  if (!token || !TOKEN.test(token)) return { ok: false, message: 'This link is missing its code. Please use the full link you were sent.' };
  if (!name || name.length > 200) return { ok: false, message: 'Please enter your name.' };

  // Rate limit per token and per IP, cohort-safe: a whole office joining in one minute shares both.
  const [okToken, okIp] = await Promise.all([
    withinRate(sys, `join:t:${token}`, 60, Number(env.JOIN_RATE_TOKEN_PER_MIN) || 80),
    withinRate(sys, `join:ip:${ip}`, 60, Number(env.JOIN_RATE_IP_PER_MIN) || 80),
  ]);
  if (!okToken || !okIp) return { ok: false, message: 'That was a lot of attempts at once. Please wait a minute and try again.' };

  let eng;
  try { eng = await roundForToken(sys, token); } catch { return { ok: false, message: 'Something went wrong on our side. Please try again shortly.' }; }
  if (!eng || !eng.enrol_enabled || eng.status !== 'active') {
    return { ok: false, message: 'This invitation link is not active. Please check with whoever shared it.' };
  }
  if (eng.enrol_expires_at && new Date(eng.enrol_expires_at).getTime() < Date.now()) {
    return { ok: false, message: 'This invitation link has expired. Please ask your organiser for a fresh one.' };
  }
  if (!eng.default_unit_id) return { ok: false, message: 'This engagement is not fully set up yet. Please contact your organiser.' };
  if (!(await acceptanceFor(sys, eng.customer_id))) {
    return { ok: false, message: 'This interview round is not open yet. Your organisation is still completing the set-up with Greatstone.' };
  }

  // Already on the round under this account: nothing to do. Someone GSAM already invited (any role) claims their
  // row by verified email; the domain gate is for self-enrolment.
  const { data: mine } = await sys.from('employee').select('id').eq('engagement_id', eng.id).eq('user_id', caller.id).limit(1);
  if (mine && mine.length > 0) return welcome();
  const { data: existing } = await sys.from('employee').select('id, user_id').eq('engagement_id', eng.id)
    .ilike('email', escapeIlike(email)).limit(1);
  if (existing?.[0]?.user_id && existing[0].user_id !== caller.id) {
    return { ok: false, message: 'This invitation is linked to another account. Please sign in with the account it was sent to.' };
  }
  const isNew = !(existing && existing.length > 0);
  const domain = email.split('@')[1] ?? '';
  const allowed = (eng.allowed_email_domains ?? []).map((d) => d.toLowerCase());
  if (isNew && (allowed.length === 0 || !allowed.includes(domain))) {
    return { ok: false, message: `Please use your work email${allowed.length ? ` (a ${allowed.join(' or ')} address)` : ''}.` };
  }

  if (!isNew) {
    const claimed = await provisionInvitee(db, { engagementId: eng.id, customerId: eng.customer_id, unitId: eng.default_unit_id,
      name, email, userId: caller.id });
    if (!claimed.ok) return { ok: false, message: claimed.message };
  } else {
    // Seat headroom for a genuinely new interviewee; admins hold no seat.
    const { data: people } = await sys.from('employee').select('status, portal_role').eq('engagement_id', eng.id);
    const spokenFor = (people ?? []).filter((p) => SPOKEN_FOR.has(p.status) && p.portal_role !== 'gs_admin' && p.portal_role !== 'client_admin').length;
    if (spokenFor + 1 > eng.seat_total) {
      return { ok: false, message: 'All the places for this round are currently taken. Please check back with your organiser — they can open more.' };
    }
    // A team target is honoured only when it is a real team of THIS round; anything else lands on the default unit.
    let targetUnitId = eng.default_unit_id;
    if (unitId && UUID.test(unitId)) {
      const { data: units } = await sys.from('org_unit').select('id, kind').eq('id', unitId).eq('engagement_id', eng.id).limit(1);
      if (units?.[0] && units[0].kind !== 'organisation') targetUnitId = units[0].id;
    }
    const provisioned = await provisionInvitee(db, { engagementId: eng.id, customerId: eng.customer_id, unitId: targetUnitId,
      name, email, userId: caller.id, portalRole: 'employee' });
    if (!provisioned.ok) return { ok: false, message: provisioned.message };
    await logAudit(sys, { engagementId: eng.id, actorEmail: email, actorName: name, action: 'person.enrolled',
      summary: `${name} signed up via the join link`, targetId: provisioned.employeeId });
  }
  return welcome();
}

export function makeJoinHandler({ pool = getPool, verify, env = process.env, log = console } = {}) {
  return async (req) => {
    if (!interviewEnabled(env)) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (Number(req.headers.get('content-length')) > 4096) return json({ error: 'Invalid request.' }, 400);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const p = pool();
    if (!p) return json({ error: 'Unavailable. Please try again.' }, 503);
    const sys = interviewDb('system', { pool: p });
    try {
      if (body?.op === 'info') {
        if (!(await withinRate(sys, `join:info:${clientIp(req)}`, 60, Number(env.JOIN_RATE_IP_PER_MIN) || 80))) {
          return json({ error: 'Please wait a minute and try again.' }, 429);
        }
        return json({ data: await joinInfo(sys, typeof body.token === 'string' ? body.token : '', typeof body.team === 'string' ? body.team : null) });
      }
      if (body?.op !== 'enrol') return json({ error: 'Invalid operation.' }, 400);
      let caller;
      try { caller = await participantFromRequest(req, verify); } catch { caller = null; }
      if (!caller) return json({ error: 'Sign in required.' }, 401);
      if (caller.unverified) return json({ error: 'Please verify your email first.', unverified: true }, 403);
      const out = await enrol({ db: interviewDb(caller, { pool: p }), sys, caller, token: body.token, name: body.name,
        unitId: body.unitId, ip: clientIp(req), env });
      return json({ data: out }, out.ok ? 200 : 400);
    } catch (error) {
      log.error(`interview-join: failed (${error?.code || error?.name || 'error'})`);
      return json({ error: 'Something went wrong on our side. Please try again shortly.' }, 500);
    }
  };
}

export default makeJoinHandler();
export const config = { path: '/api/interview/join' };
