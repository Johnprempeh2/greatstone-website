// Port of src/lib/synthesis/data.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client; numeric columns are coerced to
// numbers at load (see the Port: note in loadSynthesisData). Eligibility, caps, the quote gate and
// SUMMARY_PROMPT_VERSION are unchanged.
//
// Data loading for the synthesis pipeline: engagement, org tree, employees, eligible sessions,
// insights and the participant turns needed for verbatim verification, all assembled into
// PreparedInsight records with the contract's caps applied at source.
//
// Eligibility (contract open choice 7, recommended option, locked for this build): a session enters
// synthesis when it has ENDED and its phase_reached is at or beyond `pain_mapping` (i.e. pain_mapping
// at least begun). Sessions that reached sign_off count as complete; ENDED sessions whose phase is
// pain_mapping, automation, or sign_off-without-a-full-read-back are partial and their insights are
// capped at 0.7 confidence because they were never read back. This admits abandoned interviews that
// an admin has closed out once they carry real pain evidence. Earlier or unended sessions contribute
// nothing but a methodology count — except under the dev-only relaxed override
// (StepOptions.relaxEligibility), which admits any session carrying insights, treats it as partial
// (0.7 cap) and stamps an honest note into the methodology.
//
// Escalation-type insights never enter synthesis (renderer invariant 8: no escalation rendered
// without a logged per-item GSA decision, and v1 has no decision mechanism). They are excluded here,
// with a count in the log.

import { normalise, quoteWithinSource, wordCount } from './invariants.mjs';
import { quotesAllowed } from '../quotes.mjs';

const PHASE_RANK = {
  warmup: 0,
  day_in_life: 1,
  pain_mapping: 2,
  automation: 3,
  sign_off: 4,
};

// Bumped with the June 2026 summariser rework: role/identity tokens are suppressed from summary
// bodies, automation candidates carry a "so what" impact, pains carry quantified specifics, and the
// prose is British English with no em dashes (it appears verbatim in the handoff brief). Bumping
// invalidates earlier caches so the brief and working view use the improved, identity-clean summaries.
// v4 (24 Jun): bumped again so the new summariser quote-length gate (>=30 chars / >=7 words) actually
// takes effect — the cache fingerprint includes this version, so pre-deploy summaries that still carry
// sub-floor fragment quotes are invalidated and re-summarised exactly once.
// v5 (5 Jul): the summariser now produces MUCH more detailed, granular per-interview summaries (up to
// 8 pains with multi-sentence detail, up to 5 notable quotes) so a Greatstone consultant has rich raw
// material to synthesise and cross-check by hand. Bump invalidates the thinner v4 caches.
export const SUMMARY_PROMPT_VERSION = 'v5';

// SynthesisData: { engagement, units, employees, allSessions (all sessions, for methodology counts),
//   eligible, insights (prepared, capped, turn-verified), loadLog (escalations excluded, relaxed
//   eligibility, ...), relaxed }

function fail(step, message) {
  throw new Error(`synthesis data load failed at ${step}: ${message}`);
}

// Port: node-postgres returns Postgres `numeric` as a string, where supabase-js (PostgREST JSON)
// returned a number. interviewDb already parses numeric and timestamps like supabase-js; this coercion
// is defence in depth (idempotent) so a different client can never turn the confidence caps or hour
// sums into string comparisons or concatenation.
const num = (v) => (v === null || v === undefined ? null : Number(v));

export async function loadSynthesisData(db, engagementId, relaxEligibility) {
  const loadLog = [];

  const [engagementRes, unitsRes, employeesRes] = await Promise.all([
    db.from('engagement').select('id, client_name, status, seat_total').eq('id', engagementId).maybeSingle(),
    db.from('org_unit').select('id, engagement_id, parent_id, name, kind, path').eq('engagement_id', engagementId).order('path'),
    db.from('employee').select('id, engagement_id, person_id, user_id, unit_id, name, role_title, portal_role, status, leader_track, quote_choice').eq('engagement_id', engagementId),
  ]);
  if (engagementRes.error) fail('engagement', engagementRes.error.message);
  if (!engagementRes.data) fail('engagement', `engagement ${engagementId} not found`);
  if (unitsRes.error) fail('org_unit', unitsRes.error.message);
  if (employeesRes.error) fail('employee', employeesRes.error.message);

  const engagement = engagementRes.data;
  const units = unitsRes.data ?? [];
  const employees = employeesRes.data ?? [];
  const employeesById = new Map(employees.map((e) => [e.id, e]));

  const employeeIds = employees.map((e) => e.id);
  const sessionsRes = employeeIds.length
    ? await db
        .from('session')
        .select('id, employee_id, started_at, ended_at, phase, completion_score, taxonomy_state, is_test')
        .in('employee_id', employeeIds)
    : { data: [], error: null };
  if (sessionsRes.error) fail('session', sessionsRes.error.message);
  // Port: numeric coercion (see `num`); timestamps normalised to ISO strings because node-postgres
  // returns Date objects for timestamptz and the source slices/sorts/stringifies them as text.
  const allSessions = (sessionsRes.data ?? []).map((s) => ({
    ...s,
    started_at: isoOrNull(s.started_at),
    ended_at: isoOrNull(s.ended_at),
    completion_score: num(s.completion_score),
  }));

  const sessionIds = allSessions.map((s) => s.id);
  const insightsRes = sessionIds.length
    ? await db
        .from('insight')
        .select('id, session_id, type, label, evidence_quote, time_per_week_hours, confidence, attribution_redacted, second_hand')
        .in('session_id', sessionIds)
    : { data: [], error: null };
  if (insightsRes.error) fail('insight', insightsRes.error.message);
  // Port: numeric coercion (see `num`).
  const allInsights = (insightsRes.data ?? []).map((i) => ({
    ...i,
    time_per_week_hours: num(i.time_per_week_hours),
    confidence: num(i.confidence),
  }));

  const insightCountBySession = new Map();
  for (const i of allInsights) {
    insightCountBySession.set(i.session_id, (insightCountBySession.get(i.session_id) ?? 0) + 1);
  }

  // ── Eligibility ────────────────────────────────────────────────────────────
  const eligible = [];
  for (const session of allSessions) {
    const employee = employeesById.get(session.employee_id);
    if (!employee) continue;
    // Test runs never reach the analysis. Admins (Greatstone staff, a client's own admins) can
    // experience the agent themselves and choose at the start whether the conversation is a test
    // (is_test = true, skipped here) or their real perspective (is_test = false, included like anyone
    // else).
    if (session.is_test) continue;
    const rank = PHASE_RANK[session.phase] ?? 0;
    const insightCount = insightCountBySession.get(session.id) ?? 0;
    const complete = session.ended_at !== null && session.phase === 'sign_off';
    // Any ENDED session that reached at least pain_mapping (pain_mapping, automation, or sign_off
    // without a full read-back) is admitted as PARTIAL. This lets abandoned interviews that were
    // closed out by an admin — and so carry real day-in-the-life and pain evidence — flow through to
    // synthesis, confidence-capped at 0.7 downstream because they were never read back. (Previously
    // only sessions that ended exactly at `automation` qualified, which silently dropped closed-out
    // abandoned interviews.)
    const partialByRule =
      session.ended_at !== null && rank >= PHASE_RANK.pain_mapping && !complete;
    const relaxedAdmit =
      relaxEligibility && !complete && !partialByRule && insightCount > 0;
    if (!complete && !partialByRule && !relaxedAdmit) continue;
    eligible.push({
      session,
      employee,
      complete,
      partial: !complete,
      relaxed: relaxedAdmit,
      fingerprint: `${session.ended_at ?? 'live'}|${insightCount}|${SUMMARY_PROMPT_VERSION}`,
      insightCount,
    });
  }
  const relaxedCount = eligible.filter((e) => e.relaxed).length;
  if (relaxedCount > 0) {
    loadLog.push({
      kind: 'note',
      subject: 'eligibility',
      reason: `${relaxedCount} session(s) admitted by the dev-only relaxed eligibility override; their insights are confidence-capped at 0.7 and counted as partial`,
    });
  }

  // ── Participant turns for verbatim verification ────────────────────────────
  const eligibleIds = eligible.map((e) => e.session.id);
  const turnsRes = eligibleIds.length
    ? await db.from('turn').select('session_id, content').eq('role', 'user').in('session_id', eligibleIds)
    : { data: [], error: null };
  if (turnsRes.error) fail('turn', turnsRes.error.message);
  const turnsBySession = new Map();
  for (const t of turnsRes.data ?? []) {
    const list = turnsBySession.get(t.session_id) ?? [];
    list.push(normalise(t.content));
    turnsBySession.set(t.session_id, list);
  }

  // ── Prepared insights ──────────────────────────────────────────────────────
  const unitNameById = new Map(units.map((u) => [u.id, u.name]));
  const eligibleBySession = new Map(eligible.map((e) => [e.session.id, e]));
  const insights = [];
  let escalations = 0;

  for (const row of allInsights) {
    const elig = eligibleBySession.get(row.session_id);
    if (!elig) continue;
    if (row.type === 'escalation') {
      escalations += 1;
      continue;
    }
    const { employee, session } = elig;
    const secondHand = row.second_hand || employee.leader_track === 'on_behalf';
    let confidence = row.confidence === null ? null : Number(row.confidence);
    if (confidence !== null) {
      if (elig.partial) confidence = Math.min(confidence, 0.7); // open choice 7
      if (secondHand) confidence = Math.min(confidence, 0.7); // rule 7.2.1
      confidence = Math.round(confidence * 100) / 100;
    }

    const quote = row.evidence_quote ?? '';
    const turns = turnsBySession.get(session.id) ?? [];
    const quoteEligible =
      normalise(quote).length >= 30 &&
      wordCount(quote) >= 7 &&
      turns.some((turn) => quoteWithinSource(quote, turn));

    insights.push({
      row,
      employee,
      session,
      unitId: employee.unit_id,
      unitName: employee.unit_id
        ? unitNameById.get(employee.unit_id) ?? 'Unassigned'
        : 'Unassigned',
      voiceKey: employee.person_id ?? employee.id,
      secondHand,
      confidence,
      quoteEligible,
      // GRE-2653: false when the person chose 'No quotes' or never chose. The insight still counts in themes
      // (voices, confidence, hours); only its words are withheld from what the synthesis renders.
      quotesAllowed: quotesAllowed(employee),
    });
  }

  if (escalations > 0) {
    loadLog.push({
      kind: 'note',
      subject: 'escalations',
      reason: `${escalations} escalation-type insight(s) excluded from synthesis (portal-only path; renderer invariant 8)`,
    });
  }

  return {
    engagement,
    units,
    employees,
    allSessions,
    eligible,
    insights,
    loadLog,
    relaxed: relaxedCount > 0,
  };
}

// Port: helper for the timestamp normalisation above (Date from node-postgres -> ISO text).
function isoOrNull(v) {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
