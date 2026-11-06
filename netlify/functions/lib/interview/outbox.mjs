// Port of SOURCE src/lib/outbox-enqueue.ts @505ba6a (plus the scheduleOutboxDrain name from
// src/lib/drain.ts). Idempotency keys, payload shape and never-throw behaviour unchanged.
// Port: table `notion_outbox` is now `outbox` (GSAM reads it through the bridge; the site never calls
// out). `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter:
// enqueueOutboxEvent(db, params). drain.ts is not ported: scheduleOutboxDrain() is a no-op so callers
// port unchanged. `import 'server-only'` removed.

/**
 * Notion outbox ENQUEUE (rows only). The drain worker
 * (src/app/api/outbox-worker, owned elsewhere) is the only code that talks
 * to Notion; this module just inserts notion_outbox rows.
 *
 * Idempotency: `${sessionId}:${event}` per the integration contract.
 * phase_complete fires once per completed phase, so its key carries the
 * phase suffix (`${sessionId}:phase_complete:${phase}`) — without it the
 * unique index would swallow every advance after the first. A sign-off
 * CORRECTION (Wave 5A: "Add or correct something" on the read-back) reuses
 * the phase_complete shape but is keyed per correction turn
 * (`${sessionId}:correction:${turnCount}`), so each correction lands once
 * and repeats with nothing new collapse. session_paused
 * can happen repeatedly across one session, so its key carries the turn
 * count at the moment of pause (`${sessionId}:session_paused:${turnCount}`):
 * pausing twice at the same point collapses to one row (nothing new to
 * say), while pausing again after more turns enqueues a fresh snapshot.
 * Duplicate keys are ignored on conflict, so re-sends after a retry are
 * harmless.
 *
 * Never blocks the user path: every failure is logged and swallowed.
 */

/** @typedef {'session_start' | 'phase_complete' | 'session_end' | 'session_paused'} OutboxEvent */
/**
 * @typedef {{ id: string, type: string, label: string, evidence_quote: string | null,
 *   time_per_week_hours: number | null, confidence: number | null, attribution_redacted: boolean,
 *   second_hand: boolean }} OutboxInsightPayload
 */
/**
 * @typedef {{ event: OutboxEvent, engagement: { id: string, client_name: string },
 *   employee: { id: string, name: string, role_title: string | null, unit_name: string | null },
 *   session: { id: string, phase: import('./types.mjs').SessionPhase, completion_score: number | null, turn_count?: number },
 *   insights?: OutboxInsightPayload[], transcript?: Array<{ role: string, content: string, ts: string }> }} OutboxPayload
 */

/**
 * Pure helper behind enqueueOutboxEvent's idempotency key.
 * Port: extracted (same expression as the source) so the key rules are unit tested.
 */
export function outboxIdempotencyKey({ payload, phase, turnCount, correctionTurnCount }) {
  return payload.event === 'phase_complete' && correctionTurnCount != null
    ? `${payload.session.id}:correction:${correctionTurnCount}`
    : payload.event === 'phase_complete'
      ? `${payload.session.id}:phase_complete:${phase ?? payload.session.phase}`
      : payload.event === 'session_paused'
        ? `${payload.session.id}:session_paused:${turnCount ?? payload.session.turn_count ?? 0}`
        : `${payload.session.id}:${payload.event}`;
}

/**
 * @param {any} db interviewDb client
 * @param {{ payload: OutboxPayload, phase?: import('./types.mjs').SessionPhase, turnCount?: number,
 *   correctionTurnCount?: number }} params
 *   phase disambiguates repeated phase_complete events; turnCount repeated session_paused events;
 *   correctionTurnCount marks a phase_complete row as a sign-off correction snapshot.
 */
export async function enqueueOutboxEvent(db, params) {
  const { payload } = params;
  const idempotencyKey = outboxIdempotencyKey(params);

  try {
    // Port: table renamed notion_outbox -> outbox. Requires db.mjs to honour ignoreDuplicates
    // (ON CONFLICT DO NOTHING), exactly as supabase-js does, so a re-send never resets a row GSAM has read.
    const { error } = await db
      .from('outbox')
      .upsert(
        {
          idempotency_key: idempotencyKey,
          engagement_id: payload.engagement.id,
          payload,
          status: 'pending',
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true }
      );
    if (error) {
      console.warn(`outbox enqueue failed (${idempotencyKey}): ${error.message}`);
    }
  } catch (e) {
    console.warn(`outbox enqueue failed (${idempotencyKey}):`, e);
  }
}

/**
 * Port: the source (src/lib/drain.ts) pinged its own outbox worker so rows reached Notion quickly. On the
 * website GSAM pulls `outbox` through the signed bridge and the site never calls out, so there is nothing
 * to schedule. Kept as a no-op so every caller ports unchanged.
 */
export function scheduleOutboxDrain() {}
