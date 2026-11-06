// The interviewee's server actions and page loaders (GRE-2612), one op each, ported from @505ba6a:
//   src/app/(portal)/interview/page.tsx, actions.ts, session/page.tsx, complete/page.tsx, complete/lib.ts,
//   complete/actions.ts, and the client branch of deliverable/[engagementId]/page.tsx.
// Worker-plane pattern, as the source: every op re-derives the employee from the signed-in caller (Port: by Better
// Auth user id, was the verified email), never from client input, before it reads or writes. `db` carries the caller's claims (participant scope); `sys` is the system
// client, used only where the source wrote what a participant may not reach (the outbox, deleting a discarded
// session) or counted the whole engagement for the client admin's holding screen, always after the code check.
// Port: Next's redirect('/interview/x') is returned as { redirect: '#portal/interview/x' }; a thrown action error is
// an Error the function answers with 500 and a calm message; revalidatePath has no equivalent.
import { getEmployeeContextByUserId, getEmployeeContextForEngagement } from './employee.mjs';
import { escapeIlike, provisionInvitee } from './provision.mjs';
import { createInitialTaxonomyState } from './types.mjs';
import { enqueueOutboxEvent, scheduleOutboxDrain } from './outbox.mjs';
import { applySignOffConsent } from './memory.mjs';
import { applySlotUpdates, computeCompletionScore, normaliseTaxonomyState } from './interview.mjs';
import { runExtraction, persistableInsights, EXTRACTION_MODEL } from './extraction.mjs';
import { recordUsage } from './budget.mjs';
import { getReleasedSynthesis } from './synthesis/release.mjs';
import { verifyForRender } from './synthesis/pipeline.mjs';
import { roundVoiceEnabled } from './caller.mjs';
import { acceptanceFor } from './agreement.mjs';

const go = (view, query = '') => ({ redirect: `#portal/interview${view ? `/${view}` : ''}${query}` });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSIGHT_COLS = 'id, type, label, evidence_quote, time_per_week_hours, confidence, attribution_redacted, second_hand';
const employeePayload = (ctx) => ({ id: ctx.employee.id, name: ctx.employee.name, role_title: ctx.employee.role_title,
  unit_name: ctx.orgUnit?.name ?? null });
const isAdmin = (ctx) => ctx.employee.portal_role === 'gs_admin' || ctx.employee.portal_role === 'client_admin';

// ─── page loaders ────────────────────────────────────────────────────────────

async function claimInviteOnArrival(db, sys, caller) {
  if (!caller?.email || !caller.id) return null;
  const { data: open } = await db.from('employee').select('id, engagement_id, name').is('user_id', null)
    .ilike('email', escapeIlike(caller.email)).limit(2);
  if (!open || open.length !== 1) return null; // none, or more than one round: the round's own link decides
  // the round is not visible to the person until the invitation is theirs
  const { data: eng } = await sys.from('engagement').select('status').eq('id', open[0].engagement_id).maybeSingle();
  if (eng?.status !== 'active') return null;
  const done = await provisionInvitee(db, { engagementId: open[0].engagement_id, email: caller.email, name: caller.name ?? open[0].name,
    userId: caller.id });
  return done.ok ? getEmployeeContextByUserId(db, caller.id) : null;
}

/** interview/page.tsx: the welcome and consent screen, or where this person belongs instead. */
async function interviewPage({ db, sys, ctx, caller, args, env }) {
  // Port: an invited person who comes straight here, not through the round's link, claims the invitation sent to
  // their verified email (only an unclaimed one, on an open round), as the join does.
  if (!ctx && sys) ctx = await claimInviteOnArrival(db, sys, caller);
  if (!ctx) return { screen: 'no-match', email: caller.email };
  if (ctx.employee.status === 'declined') return go('goodbye');
  if (ctx.employee.status === 'completed') return go('complete');
  if (ctx.employee.status === 'started') {
    // Returning mid-conversation: resume, but only when an open resumable session exists; otherwise the welcome lets
    // the idempotent start repair the missing session rather than loop.
    const { data: open } = await db.from('session').select('id').eq('employee_id', ctx.employee.id)
      .is('ended_at', null).eq('resumable', true).limit(1);
    if (open && open.length > 0) return go('session');
  }
  return {
    screen: 'welcome',
    name: ctx.employee.name,
    clientName: ctx.engagement.client_name,
    targetMinutes: ctx.engagement.target_minutes ?? 20,
    isAdmin: isAdmin(ctx),
    seats: args.seats === 'exhausted' || args.seats === 'not-open' ? args.seats : null,
    consent: args.consent === 'required' ? 'required' : null,
    voiceEnabled: env.voice && roundVoiceEnabled(ctx.engagement),
  };
}

/** session/page.tsx: the open session and its turns, for the chat shell. */
async function sessionPage({ db, ctx, env }) {
  if (!ctx) return go('');
  if (ctx.employee.status === 'declined') return go('goodbye');
  if (ctx.employee.status === 'completed') return go('complete');
  const { data: sessions, error: sessionError } = await db.from('session').select('*')
    .eq('employee_id', ctx.employee.id).is('ended_at', null).eq('resumable', true)
    .order('started_at', { ascending: false }).limit(1);
  if (sessionError) throw new Error(`could not load session: ${sessionError.message}`);
  const session = sessions?.[0] ?? null;
  if (!session) return go('');
  const { data: turns, error: turnsError } = await db.from('turn').select('id, role, content, ts, seq, input_mode')
    .eq('session_id', session.id).order('ts', { ascending: true });
  if (turnsError) throw new Error(`could not load turns: ${turnsError.message}`);
  return { sessionId: session.id, phase: session.phase, initialTurns: turns ?? [], employeeName: ctx.employee.name,
    voiceEnabled: env.voice && roundVoiceEnabled(ctx.engagement) };
}

/** complete/lib.ts getSignOffContext + loadConsentState, and complete/page.tsx's routing. */
async function signOffPage({ db, ctx }) {
  if (!ctx) return go('');
  const { data: sessions, error } = await db.from('session').select('*').eq('employee_id', ctx.employee.id)
    .not('ended_at', 'is', null).order('ended_at', { ascending: false }).limit(1);
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  const session = sessions?.[0] ?? null;
  if (!session) {
    if (ctx.employee.status === 'declined') return go('goodbye');
    if (ctx.employee.status === 'started' || ctx.employee.status === 'completed') return go('session');
    return go('');
  }
  // The latest recorded answer for each consent kind; a kind with none pre-selects the SAFE option.
  const { data: rows, error: consentError } = await db.from('consent_event').select('kind, value, ts')
    .eq('employee_id', ctx.employee.id).in('kind', ['attribution', 'memory_opt_in']).order('ts', { ascending: false });
  if (consentError) throw new Error(`consent lookup failed: ${consentError.message}`);
  const latestAttribution = (rows ?? []).find((r) => r.kind === 'attribution');
  const latestMemory = (rows ?? []).find((r) => r.kind === 'memory_opt_in');
  return { sessionId: session.id, initialAttribution: latestAttribution?.value === true ? 'named' : 'anonymised',
    initialMemory: latestMemory?.value === true };
}

/**
 * deliverable/[engagementId]/page.tsx, client branch: a client_admin sees ONLY the released synthesis, verified for
 * render, or the honest holding screen (coverage, review status, target date; never cost). The working view is staff
 * only and lives in GSAM, so a gs_admin here gets the same client view.
 */
async function results({ db, sys, caller, args }) {
  const engagementId = typeof args.engagementId === 'string' && UUID.test(args.engagementId) ? args.engagementId : null;
  const ctx = engagementId ? await getEmployeeContextForEngagement(db, caller.id, engagementId)
    : await getEmployeeContextByUserId(db, caller.id);
  const role = ctx?.employee.portal_role;
  if (!ctx || (role !== 'client_admin' && role !== 'gs_admin')) return { screen: 'denied' };
  const id = ctx.engagement.id;
  const synthesis = await getReleasedSynthesis(sys, id);
  if (synthesis) {
    const { failed } = await verifyForRender(sys, id, synthesis);
    return { screen: 'released', clientName: ctx.engagement.client_name, releasedAt: ctx.engagement.released_at ?? null,
      synthesis, failedQuotes: [...failed.entries()].map(([k, v]) => ({ key: k, reason: v })) };
  }
  const [engMetaRes, peopleRes, synthCountRes] = await Promise.all([
    sys.from('engagement').select('seat_total, readout_at, end_date').eq('id', id).maybeSingle(),
    sys.from('employee').select('status, portal_role').eq('engagement_id', id),
    sys.from('synthesis').select('id', { count: 'exact', head: true }).eq('engagement_id', id),
  ]);
  const interviewees = (peopleRes.data ?? []).filter((p) => p.portal_role === 'employee' || p.portal_role === 'team_leader');
  const total = interviewees.length;
  const completed = interviewees.filter((p) => p.status === 'completed').length;
  const started = interviewees.filter((p) => p.status === 'started').length;
  const invited = interviewees.filter((p) => p.status === 'invited').length;
  const hasSynthesis = (synthCountRes.count ?? 0) > 0;
  const readoutRaw = (engMetaRes.data?.readout_at ?? engMetaRes.data?.end_date) || null;
  const statusLine = hasSynthesis
    ? 'Your read-out has been drafted and is with the Greatstone team for review. It appears here the moment it is released.'
    : completed + started > 0
      ? 'The conversations are under way. Once enough are complete, the Greatstone team draws the findings together and reviews them before sharing anything.'
      : total > 0
        ? 'Your team has been invited and the conversations are getting started. Progress will show here as people take part.'
        : 'The engagement is being set up. Progress will show here once your team is invited.';
  return { screen: 'holding', clientName: ctx.engagement.client_name, total, completed, started, invited,
    pct: total > 0 ? Math.round((completed / total) * 100) : 0, hasSynthesis, statusLine,
    targetDate: readoutRaw ? new Date(readoutRaw).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null };
}

// ─── actions (interview/actions.ts) ──────────────────────────────────────────

/**
 * "Start the conversation": (a) require the informed consent BEFORE anything is created, logged as participation=true;
 * (b) claim a seat (claim_seat, concurrency-safe, idempotent); (c) ensure an active resumable session; then continue.
 */
async function startConversation({ db, sys, ctx, args }) {
  if (!ctx) return go('');
  if (!args.dataConsent) return go('', '?consent=required');
  // no seat until the organisation has accepted the current data processing agreement (GRE-2794); nothing is written
  if (!(await acceptanceFor(sys, ctx.engagement.customer_id))) return go('', '?seats=not-open');
  const { error: consentError } = await db.from('consent_event').insert({ employee_id: ctx.employee.id, kind: 'participation', value: true });
  if (consentError) throw new Error(`could not record consent: ${consentError.message}`);
  const { error: seatError } = await db.rpc('claim_seat', { p_employee_id: ctx.employee.id });
  if (seatError) {
    if (seatError.message.includes('exhausted')) return go('', '?seats=exhausted');
    throw new Error(`could not claim a seat: ${seatError.message}`);
  }
  // Only admins are offered test vs real; an admin's run defaults to a test unless they pick "save".
  const isTest = isAdmin(ctx) && args.runMode !== 'save';
  const { data: existing, error: sessionLookupError } = await db.from('session').select('id')
    .eq('employee_id', ctx.employee.id).is('ended_at', null).eq('resumable', true).limit(1);
  if (sessionLookupError) throw new Error(`could not look up session: ${sessionLookupError.message}`);
  if (!existing || existing.length === 0) {
    const { data: created, error: createError } = await db.from('session').insert({
      employee_id: ctx.employee.id, phase: 'warmup', resumable: true, is_test: isTest,
      // Warm-up facts the invitation already holds, with prefilled_from_invite provenance.
      taxonomy_state: createInitialTaxonomyState({ name: ctx.employee.name, role_title: ctx.employee.role_title,
        unit_name: ctx.orgUnit?.name ?? null }),
    }).select('id, phase').single();
    if (createError) {
      // Lost a double-start race to the one-active-session index: continue to the live session.
      if (createError.code === '23505') return go('session');
      throw new Error(`could not create session: ${createError.message}`);
    }
    await enqueueOutboxEvent(sys, { payload: {
      event: 'session_start',
      engagement: { id: ctx.engagement.id, client_name: ctx.engagement.client_name },
      employee: employeePayload(ctx),
      session: { id: created.id, phase: 'warmup', completion_score: 0 },
    } });
    scheduleOutboxDrain();
  }
  return go('session');
}

/** "Save and finish later": snapshot progress to the outbox, idempotent per pause point. Never fails for nothing live. */
async function pauseSession({ db, sys, ctx, args }) {
  if (!ctx) return go('');
  const sessionId = typeof args.sessionId === 'string' && UUID.test(args.sessionId) ? args.sessionId : null;
  if (!sessionId) return { ok: true };
  const { data: sessions, error: lookupError } = await db.from('session').select('id, phase, taxonomy_state')
    .eq('id', sessionId).eq('employee_id', ctx.employee.id).is('ended_at', null).limit(1);
  if (lookupError) throw new Error(`could not look up session: ${lookupError.message}`);
  const session = sessions?.[0];
  if (!session) return { ok: true };
  const { count, error: countError } = await db.from('turn').select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
  if (countError) throw new Error(`could not count turns: ${countError.message}`);
  const turnCount = count ?? 0;
  const { data: insightRows, error: insightError } = await db.from('insight').select(INSIGHT_COLS).eq('session_id', sessionId);
  if (insightError) throw new Error(`could not load insights: ${insightError.message}`);
  const completionScore = typeof session.taxonomy_state?.completion_score === 'number' ? session.taxonomy_state.completion_score : null;
  await enqueueOutboxEvent(sys, { payload: {
    event: 'session_paused',
    engagement: { id: ctx.engagement.id, client_name: ctx.engagement.client_name },
    employee: employeePayload(ctx),
    session: { id: session.id, phase: session.phase, completion_score: completionScore, turn_count: turnCount },
    insights: insightRows ?? [],
  }, turnCount });
  scheduleOutboxDrain();
  return { ok: true };
}

/**
 * "Stop and discard everything": hard-delete the active session (turns and insights cascade; usage rows detach), log
 * a withdrawal, and set the employee back to invited so the link still works. The session is re-derived server-side.
 */
async function discardSession({ db, sys, ctx }) {
  if (!ctx) return go('');
  const { data: sessions, error: lookupError } = await db.from('session').select('id')
    .eq('employee_id', ctx.employee.id).is('ended_at', null).order('started_at', { ascending: false }).limit(1);
  if (lookupError) throw new Error(`could not find session: ${lookupError.message}`);
  const sessionId = sessions?.[0]?.id;
  if (sessionId) {
    // Nothing about a discarded conversation should reach GSAM: remove its pending outbox rows first.
    const { error: outboxError } = await sys.from('outbox').delete().like('idempotency_key', `${sessionId}:%`).eq('status', 'pending');
    if (outboxError) throw new Error(`could not clear outbox: ${outboxError.message}`);
    const { error: deleteError } = await sys.from('session').delete().eq('id', sessionId).eq('employee_id', ctx.employee.id);
    if (deleteError) throw new Error(`could not discard session: ${deleteError.message}`);
  }
  const { error: consentError } = await db.from('consent_event').insert({ employee_id: ctx.employee.id, kind: 'withdrawal', value: true });
  if (consentError) throw new Error(`could not record withdrawal: ${consentError.message}`);
  const { error: statusError } = await db.from('employee').update({ status: 'invited' }).eq('id', ctx.employee.id);
  if (statusError) throw new Error(`could not reset status: ${statusError.message}`);
  return go('discarded');
}

/** "I'd rather not take part": participation=false, declined, the kind goodbye. No one is told. */
async function declineParticipation({ db, ctx }) {
  if (!ctx) return go('');
  const { error: consentError } = await db.from('consent_event').insert({ employee_id: ctx.employee.id, kind: 'participation', value: false });
  if (consentError) throw new Error(`could not record consent: ${consentError.message}`);
  const { error: statusError } = await db.from('employee').update({ status: 'declined' }).eq('id', ctx.employee.id);
  if (statusError) throw new Error(`could not update status: ${statusError.message}`);
  return go('goodbye');
}

/** "Actually, I'd like to take part": only a declined employee moves, back to invited, to re-consent. */
async function rejoinAfterDecline({ db, ctx }) {
  if (!ctx) return go('');
  if (ctx.employee.status === 'declined') {
    const { error: consentError } = await db.from('consent_event').insert({ employee_id: ctx.employee.id, kind: 'participation', value: true });
    if (consentError) throw new Error(`could not record consent: ${consentError.message}`);
    const { error: statusError } = await db.from('employee').update({ status: 'invited' })
      .eq('id', ctx.employee.id).eq('status', 'declined'); // only reverse if still declined
    if (statusError) throw new Error(`could not update status: ${statusError.message}`);
  }
  return go('');
}

// ─── sign-off actions (complete/actions.ts) ──────────────────────────────────

async function requireEndedSession(db, ctx, sessionId) {
  if (!ctx) throw new Error('no matching employee');
  if (typeof sessionId !== 'string' || !UUID.test(sessionId)) throw new Error('no ended session to sign off');
  const { data: sessions, error } = await db.from('session').select('*').eq('id', sessionId)
    .eq('employee_id', ctx.employee.id) // ownership check, not just existence
    .not('ended_at', 'is', null) // the read-back is only for finished sessions
    .limit(1);
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  const session = sessions?.[0];
  if (!session) throw new Error('no ended session to sign off');
  return session;
}

/** "Confirm and finish": the consent pair, attribution applied both ways, memory built or hard-deleted. */
async function confirmSignOff({ db, ctx, args, log }) {
  try {
    if ((args.attribution !== 'named' && args.attribution !== 'anonymised') || typeof args.memory !== 'boolean') {
      return { ok: false, error: 'invalid sign-off choices' };
    }
    const session = await requireEndedSession(db, ctx, args.sessionId);
    await applySignOffConsent(db, { employee: ctx.employee, unitName: ctx.orgUnit?.name ?? null, sessionId: session.id,
      choice: { attribution: args.attribution, memory: args.memory } });
    return { ok: true };
  } catch (e) {
    log.error('confirmSignOff failed:', e?.message || 'error');
    return { ok: false, error: 'Could not save your choices just now. Nothing was lost — please try again.' };
  }
}

const MAX_CORRECTION_CHARS = 2000;

/** "Add or correct something": one more user turn on the ended session, through the real extraction path. */
async function submitCorrection({ db, sys, ctx, args, log }) {
  try {
    const text = typeof args.text === 'string' ? args.text.trim() : '';
    if (!text || typeof args.sessionId !== 'string') return { ok: false, error: 'nothing to add' };
    if (text.length > MAX_CORRECTION_CHARS) return { ok: false, error: 'that is a little long — a few sentences is plenty' };
    const session = await requireEndedSession(db, ctx, args.sessionId);
    const { data: lastAgentRows } = await db.from('turn').select('content').eq('session_id', session.id).eq('role', 'agent')
      .order('ts', { ascending: false }).limit(1);
    const lastAgentContent = lastAgentRows?.[0]?.content ?? null;
    const { data: inserted, error: turnError } = await db.from('turn').insert({ session_id: session.id, role: 'user', content: text })
      .select('id').single();
    if (turnError) throw new Error(`turn insert failed: ${turnError.message}`);
    const turnId = inserted.id;
    const state = normaliseTaxonomyState(session.taxonomy_state);
    const extraction = await runExtraction({ taxonomyState: state, agentQuestion: lastAgentContent, employeeMessage: text,
      onBehalf: ctx.employee.leader_track === 'on_behalf' });
    let added = 0;
    if (extraction) {
      // New insights inherit the current attribution choice (latest event).
      const { data: consentRows } = await db.from('consent_event').select('value').eq('employee_id', ctx.employee.id)
        .eq('kind', 'attribution').order('ts', { ascending: false }).limit(1);
      const latestAttribution = consentRows?.[0]?.value;
      const redacted = latestAttribution === undefined ? false : !latestAttribution;
      const toPersist = persistableInsights(extraction.insights);
      if (toPersist.length > 0) {
        const { error: insightError } = await db.from('insight').insert(toPersist.map((i) => ({
          session_id: session.id, type: i.type, label: i.label, evidence_quote: i.evidence_quote,
          time_per_week_hours: i.time_per_week_hours, confidence: i.confidence, second_hand: i.second_hand, attribution_redacted: redacted,
        })));
        if (insightError) log.warn(`correction insight insert failed: ${insightError.message}`);
        else added = toPersist.length;
      }
      const { usage: _usage, ...extractedFields } = extraction; // eslint-disable-line no-unused-vars
      await db.from('turn').update({ extracted_fields: extractedFields }).eq('id', turnId);
      // Slots ratchet; a taken correction fills corrections_taken.
      state.slots = applySlotUpdates(state.slots, extraction.slot_updates);
      state.slots = applySlotUpdates(state.slots, { sign_off: { corrections_taken: 'filled' } });
      state.completion_score = computeCompletionScore(state.slots);
      state.insights_extracted = (state.insights_extracted ?? 0) + added;
      const { error: stateError } = await db.from('session').update({ taxonomy_state: state, completion_score: state.completion_score })
        .eq('id', session.id);
      if (stateError) log.warn(`correction state persist failed: ${stateError.message}`);
      await recordUsage(db, { sessionId: session.id, engagementId: ctx.engagement.id, model: EXTRACTION_MODEL,
        inputTokens: extraction.usage.inputTokens, outputTokens: extraction.usage.outputTokens });
    }
    // Snapshot the refreshed insight set under sign_off, keyed per correction turn.
    const { count } = await db.from('turn').select('id', { count: 'exact', head: true }).eq('session_id', session.id);
    const turnCount = count ?? 0;
    const { data: insightRows } = await db.from('insight').select(INSIGHT_COLS).eq('session_id', session.id);
    await enqueueOutboxEvent(sys, { payload: {
      event: 'phase_complete',
      engagement: { id: ctx.engagement.id, client_name: ctx.engagement.client_name },
      employee: employeePayload(ctx),
      session: { id: session.id, phase: 'sign_off', completion_score: state.completion_score, turn_count: turnCount },
      insights: insightRows ?? [],
    }, correctionTurnCount: turnCount });
    scheduleOutboxDrain();
    return { ok: true, insightsAdded: added };
  } catch (e) {
    log.error('submitCorrection failed:', e?.message || 'error');
    return { ok: false, error: 'Could not take that just now. Your words were not lost — please try again.' };
  }
}

export const OPS = {
  'interview-page': interviewPage,
  'session-page': sessionPage,
  'signoff-page': signOffPage,
  results,
  start: startConversation,
  pause: pauseSession,
  discard: discardSession,
  decline: declineParticipation,
  rejoin: rejoinAfterDecline,
  'confirm-signoff': confirmSignOff,
  'submit-correction': submitCorrection,
};

/** Runs one op for a verified caller. ctx is resolved here, once, from the caller's user id. */
export async function runPortalOp(op, { db, sys, caller, args = {}, env = {}, log = console }) {
  const fn = OPS[op];
  if (!fn) return null;
  const ctx = op === 'results' ? null : await getEmployeeContextByUserId(db, caller.id);
  return fn({ db, sys, ctx, caller, args, env, log });
}
