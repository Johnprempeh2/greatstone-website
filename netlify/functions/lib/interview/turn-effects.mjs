// What a participant turn does beyond the reply, shared by the typed chat and the voice think endpoint (GRE-2612).
// Moved out of interview-chat.mjs unchanged, so a wholly spoken interview records its consent answers and closes on
// sign-off exactly as a typed one does. Port: in the source only /api/chat did this; a spoken interview stayed open
// until the person typed again or the abandonment close-out ran.
import { enqueueOutboxEvent, scheduleOutboxDrain } from './outbox.mjs';

export async function loadInsightPayload(db, sessionId) {
  const { data } = await db.from('insight')
    .select('id, type, label, evidence_quote, time_per_week_hours, confidence, attribution_redacted, second_hand')
    .eq('session_id', sessionId);
  return (data ?? []).map((i) => ({
    id: i.id, type: i.type, label: i.label, evidence_quote: i.evidence_quote, time_per_week_hours: i.time_per_week_hours,
    confidence: i.confidence, attribution_redacted: i.attribution_redacted, second_hand: i.second_hand,
  }));
}

/**
 * Consent, both kinds, recorded as the participant answers Everest; the sign-off read-back pre-selects from these rows
 * and its "Confirm and finish" appends the authoritative pair.
 */
export async function recordConsentUpdates(db, { employeeId, sessionId, extraction, log = console }) {
  const attribution = extraction.consent_updates?.attribution;
  if (attribution) {
    const { error: consentError } = await db.from('consent_event').insert({
      employee_id: employeeId, kind: 'attribution', value: attribution === 'named',
    });
    if (consentError) log.warn(`consent insert failed: ${consentError.message}`);
    // Apply to the session's insight rows at once, so the session_end payload already honours it.
    const { error: redactError } = await db.from('insight')
      .update({ attribution_redacted: attribution === 'anonymised' }).eq('session_id', sessionId);
    if (redactError) log.warn(`attribution apply failed: ${redactError.message}`);
  }
  const memoryOptIn = extraction.consent_updates?.memory_opt_in;
  if (typeof memoryOptIn === 'boolean') {
    const { error: memoryConsentError } = await db.from('consent_event').insert({
      employee_id: employeeId, kind: 'memory_opt_in', value: memoryOptIn,
    });
    if (memoryConsentError) log.warn(`memory consent insert failed: ${memoryConsentError.message}`);
  }
}

/** Both consent answers recorded and the warm close sent: end the session; the UI moves to sign-off. */
export async function closeSessionAfterSignOff(db, sys, { ctx, session, state, dbPhase, employeePayload }) {
  const durationSecs = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000);
  await db.from('session').update({
    ended_at: new Date().toISOString(), resumable: false, completion_score: state.completion_score, duration_secs: durationSecs,
  }).eq('id', session.id);
  await db.from('employee').update({ status: 'completed' }).eq('id', ctx.employee.id);
  const { data: allTurns } = await db.from('turn').select('role, content, ts')
    .eq('session_id', session.id).order('seq', { ascending: true });
  await enqueueOutboxEvent(sys, {
    payload: {
      event: 'session_end',
      engagement: { id: ctx.engagement.id, client_name: ctx.engagement.client_name },
      employee: employeePayload,
      session: { id: session.id, phase: dbPhase, completion_score: state.completion_score },
      insights: await loadInsightPayload(db, session.id),
      transcript: allTurns ?? [],
    },
  });
  scheduleOutboxDrain();
}
