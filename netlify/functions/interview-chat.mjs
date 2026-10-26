// Port of src/app/api/chat/route.ts @505ba6a: the per-turn interview endpoint (GRE-2612). One short streaming
// request per turn; session state lives in the database, which is what makes resume work. The flow, as the source:
//   1. Authorise: signed-in caller (Better Auth user id) -> employee row in an active engagement; the session must be theirs.
//   2. Persist the user turn (idempotent on clientTurnId). A body without content is a kickoff or recovery.
//   3. Extraction (EXTRACTION_MODEL) on the latest exchange BEFORE the reply streams: phase advance is gated on slot
//      fill, so the reply and the phase event the UI moves its dots on reflect this turn.
//   4. Stream the reply (INTERVIEW_MODEL) as SSE: meta, delta, reset, done, error.
//   5. Persist the agent turn, record usage and enqueue outbox rows before the stream closes.
// Port: identity is the Better Auth session (lib/interview/caller.mjs); data runs as interview_worker with the
// caller's claims (participant scope), and the outbox, which participants cannot reach, through a system client.
// The development-only x-test-employee-email bypass is dropped; tests inject verify and the model client.
import Anthropic from '@anthropic-ai/sdk';
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { json, participantFromRequest, interviewEnabled } from './lib/interview/caller.mjs';
import { getEmployeeContextByUserId } from './lib/interview/employee.mjs';
import {
  advancePhase, applySlotUpdates, buildSystemPrompt, computeCompletionScore, deriveNextAction, KICKOFF_NUDGE,
  normaliseTaxonomyState, RECOVERY_NUDGE, signOffComplete, TAXONOMY_TO_DB_PHASE, turnsToMessages, updatePaceFields,
} from './lib/interview/interview.mjs';
import { runExtraction, persistableInsights, EXTRACTION_MODEL } from './lib/interview/extraction.mjs';
import { loadActiveMemoryBlob, renderMemoryBlob } from './lib/interview/memory.mjs';
import { getBudgetStatus, recordUsage } from './lib/interview/budget.mjs';
import { enqueueOutboxEvent, scheduleOutboxDrain } from './lib/interview/outbox.mjs';
import { withinRate } from './lib/interview/ratelimit.mjs';
import { closeSessionAfterSignOff, loadInsightPayload, recordConsentUpdates } from './lib/interview/turn-effects.mjs';

const INTERVIEW_MODEL = process.env.INTERVIEW_MODEL ?? 'claude-sonnet-4-6';
const MAX_REPLY_TOKENS = 400; // a few hundred tokens per turn: short, warm replies
const REPLY_TEMPERATURE = 0.7; // warm interviewing, not deterministic parsing

// Rate limits (fixed one-minute window). A human turns once every several seconds; these ceilings only ever trip a
// script or a runaway client.
const TURNS_PER_MIN_SESSION = Number(process.env.CHAT_RATE_SESSION_PER_MIN) || 20;
const TURNS_PER_MIN_EMPLOYEE = Number(process.env.CHAT_RATE_EMPLOYEE_PER_MIN) || 30;

// Hard cost backstop. Honest interviews wrap up via the ratio>=1 steering line (~150k tokens) long before this; the
// 429 only ever stops a stuck, looping or abused session from burning tokens without end.
const HARD_BUDGET_RATIO = Number(process.env.CHAT_HARD_BUDGET_RATIO) || 1.5;

// A duplicate (same client_turn_id) that loses the insert race and finds no reply yet: a turn YOUNGER than this is
// assumed in flight in a sibling request (back off, ask the client to retry); an OLDER one means the original request
// died and is safe to reprocess here.
const INFLIGHT_RECOVERY_MS = 30_000;

let anthropic = null;
const defaultClient = () => (anthropic ??= new Anthropic());

// A model error worth one more attempt: 429, 529, any 5xx, or a dropped connection, checked BEFORE the generic
// APIError branch because APIConnectionError extends APIError with an undefined status.
export function isRetriableModelError(e) {
  if (e instanceof Anthropic.APIUserAbortError) return false;
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.APIError) {
    const status = e.status;
    return status === 429 || status === 529 || (typeof status === 'number' && status >= 500);
  }
  return false;
}

const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' };

/** A one-shot SSE response for paths that need no model call (an idempotent replay, or a redundant kickoff). */
function sseResponse(events) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(sse(e)));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

const MAX_CONTENT_CHARS = 8000;

export function makeChatHandler({ pool = getPool, verify, model = defaultClient, env = process.env, log = console } = {}) {
  return async (req) => {
    if (!interviewEnabled(env)) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    // ── Authorisation (explicit, before any data) ──
    let caller;
    try { caller = await participantFromRequest(req, verify); } catch { caller = null; }
    if (!caller) return json({ error: 'Not signed in' }, 401);
    if (caller.unverified) return json({ error: 'Please verify your email first' }, 403);
    const p = pool();
    if (!p) return json({ error: 'Interview unavailable' }, 503);
    const db = interviewDb(caller, { pool: p });
    const sys = interviewDb('system', { pool: p });

    const ctx = await getEmployeeContextByUserId(db, caller.id).catch(() => null);
    if (!ctx) return json({ error: 'No matching employee' }, 403);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const sessionId = body?.sessionId;
    if (!sessionId || typeof sessionId !== 'string') return json({ error: 'sessionId required' }, 400);
    // Port: a malformed id would fail its uuid cast in Postgres; answer as "not found" instead of a 500
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return json({ error: 'Session not found' }, 404);
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    // Port: new. One message of a conversation, not a document: anything longer is refused before it is stored.
    if (content.length > MAX_CONTENT_CHARS) return json({ error: 'That message is too long. Please send it in shorter parts.' }, 413);
    // Client-supplied idempotency key for this user turn: a resend after a network stutter carries the same key, so
    // the duplicate collapses onto the original turn instead of being recorded (and re-extracted) twice.
    const clientTurnId = typeof body.clientTurnId === 'string' && body.clientTurnId ? body.clientTurnId.slice(0, 100) : null;

    const { data: sessions, error: sessionError } = await db.from('session').select('*')
      .eq('id', sessionId)
      .eq('employee_id', ctx.employee.id) // ownership check, not just existence
      .limit(1);
    if (sessionError) return json({ error: 'Session lookup failed' }, 500);
    const session = sessions?.[0];
    if (!session) return json({ error: 'Session not found' }, 404);
    if (session.ended_at) return json({ error: 'Session already complete', complete: true }, 409);

    // ── Rate limit (before any extraction or model work) ──
    const [okSession, okEmployee] = await Promise.all([
      withinRate(db, `chat:s:${sessionId}`, 60, Number(env.CHAT_RATE_SESSION_PER_MIN) || TURNS_PER_MIN_SESSION),
      withinRate(db, `chat:e:${ctx.employee.id}`, 60, Number(env.CHAT_RATE_EMPLOYEE_PER_MIN) || TURNS_PER_MIN_EMPLOYEE),
    ]);
    if (!okSession || !okEmployee) {
      return json({ error: 'That came through very fast — give it a few seconds and try again.' }, 429);
    }

    // ── Hard cost backstop, computed once and reused for the steering line ──
    const budget = await getBudgetStatus(db, ctx.employee.id, ctx.engagement.id);
    if (budget.ratio >= (Number(env.CHAT_HARD_BUDGET_RATIO) || HARD_BUDGET_RATIO)) {
      return json({
        error: 'This conversation has reached its length limit. Your responses are saved — thank you. Please contact the team if there is more you want to add.',
        complete: true,
      }, 429);
    }

    const { data: turnRows, error: turnsError } = await db.from('turn').select('*')
      .eq('session_id', sessionId).order('seq', { ascending: true });
    if (turnsError) return json({ error: 'Transcript load failed' }, 500);
    const turns = turnRows ?? [];
    const lastAgentTurn = [...turns].reverse().find((t) => t.role === 'agent') ?? null;

    // A contentless request is a kickoff (no turns yet) or a crash-recovery (last turn is the user's). If the last
    // turn is already the agent's, replay it rather than spend a model call on a redundant kickoff.
    if (!content) {
      const last = turns[turns.length - 1];
      if (last && last.role === 'agent') {
        return sseResponse([
          { type: 'meta', phase: session.phase, phaseChanged: false, userTurnId: null },
          { type: 'delta', text: last.content },
          { type: 'done', agentTurnId: last.id, phase: session.phase, complete: false },
        ]);
      }
    }

    // ── Persist the user turn (idempotent on client_turn_id) ── Only the request that INSERTS the turn extracts it
    // and replies; a duplicate either replays the finished reply or backs off.
    let userTurn = null;
    if (content) {
      const insertRes = await db.from('turn')
        .insert({ session_id: sessionId, role: 'user', content, client_turn_id: clientTurnId })
        .select('*').single();
      if (insertRes.error) {
        if (insertRes.error.code === '23505' && clientTurnId) {
          const { data: existingRows } = await db.from('turn').select('*')
            .eq('session_id', sessionId).eq('client_turn_id', clientTurnId).limit(1);
          const existing = existingRows?.[0];
          if (!existing) return json({ error: 'Could not save your message' }, 500);
          // Already a later agent turn => the whole turn completed before; replay it with no model call.
          const { data: laterAgent } = await db.from('turn').select('*')
            .eq('session_id', sessionId).eq('role', 'agent').gt('seq', existing.seq)
            .order('seq', { ascending: true }).limit(1);
          const reply = laterAgent?.[0];
          if (reply) {
            return sseResponse([
              { type: 'meta', phase: session.phase, phaseChanged: false, userTurnId: existing.id },
              { type: 'delta', text: reply.content },
              { type: 'done', agentTurnId: reply.id, phase: session.phase, complete: false },
            ]);
          }
          // No reply yet. A FRESH unprocessed turn means a sibling request is handling it: back off. Only an OLD
          // orphan (original request died) is reprocessed here.
          const ageMs = Date.now() - new Date(existing.ts).getTime();
          if (ageMs < INFLIGHT_RECOVERY_MS) return json({ retry: true }, 409);
          userTurn = existing;
        } else {
          return json({ error: 'Could not save your message' }, 500);
        }
      } else {
        userTurn = insertRes.data;
      }
      if (userTurn && !turns.some((t) => t.id === userTurn.id)) turns.push(userTurn);
    }

    // ── State hydration ──
    const state = normaliseTaxonomyState(session.taxonomy_state);
    updatePaceFields(state, session.started_at);

    // Context pack: the engagement snapshots a specific (id, version) pair.
    let contextPack = null;
    if (ctx.engagement.context_pack_id) {
      const { data: packs } = await db.from('context_pack').select('content, version').eq('id', ctx.engagement.context_pack_id).limit(1);
      contextPack = packs?.[0] ?? null;
    }

    // Memory blob: an opted-in, unexpired blob from a previous engagement drives the memory-hydrated opening.
    let memoryBlock = null;
    if (ctx.employee.person_id) {
      const blob = await loadActiveMemoryBlob(db, ctx.employee.person_id, ctx.engagement.customer_id);
      if (blob) memoryBlock = renderMemoryBlob(blob, { participantName: ctx.employee.name });
    }

    // ── Extraction + phase machine (pre-stream) ──
    let phaseChanged = false;
    const previousPhase = state.phase;
    if (content) {
      const extraction = await runExtraction({
        taxonomyState: state,
        agentQuestion: lastAgentTurn?.content ?? null,
        employeeMessage: content,
        onBehalf: ctx.employee.leader_track === 'on_behalf',
      });
      if (extraction) {
        // Slots ratchet upward; completion_score per contract 3.2.
        state.slots = applySlotUpdates(state.slots, extraction.slot_updates);
        state.completion_score = computeCompletionScore(state.slots);
        // Insight rows: evidence already validated verbatim in runExtraction.
        const toPersist = persistableInsights(extraction.insights);
        if (toPersist.length > 0) {
          const { error: insightError } = await db.from('insight').insert(toPersist.map((i) => ({
            session_id: sessionId, type: i.type, label: i.label, evidence_quote: i.evidence_quote,
            time_per_week_hours: i.time_per_week_hours, confidence: i.confidence, second_hand: i.second_hand,
          })));
          if (insightError) log.warn(`insight insert failed: ${insightError.message}`);
          state.insights_extracted = (state.insights_extracted ?? 0) + toPersist.length;
        }
        // The full extraction output lands on the turn for audit/synthesis.
        if (userTurn) {
          const { usage: _usage, ...extractedFields } = extraction; // eslint-disable-line no-unused-vars
          await db.from('turn').update({ extracted_fields: extractedFields }).eq('id', userTurn.id);
        }
        await recordConsentUpdates(db, { employeeId: ctx.employee.id, sessionId, extraction, log });
        await recordUsage(db, {
          sessionId, engagementId: ctx.engagement.id, model: EXTRACTION_MODEL,
          inputTokens: extraction.usage.inputTokens, outputTokens: extraction.usage.outputTokens,
        });
      }
      // Phase machine: gated on slot fill per the contract, never turn count.
      const newPhase = advancePhase(state.slots, state.phase);
      if (newPhase !== state.phase) {
        state.phase = newPhase;
        phaseChanged = true;
      }
      state.next_action = deriveNextAction(state);
    }

    const closing = signOffComplete(state);
    if (closing && state.phase !== 'sign_off') {
      // Both consents recorded ahead of the pointer: the interview IS in sign-off.
      state.phase = 'sign_off';
      phaseChanged = true;
    }
    const dbPhase = TAXONOMY_TO_DB_PHASE[state.phase];

    // Persist state (and phase) before streaming, so a dropped connection never loses extraction work.
    {
      const { error: stateError } = await db.from('session').update({ taxonomy_state: state, phase: dbPhase }).eq('id', sessionId);
      if (stateError) log.warn(`taxonomy_state persist failed: ${stateError.message}`);
    }

    const employeePayload = { id: ctx.employee.id, name: ctx.employee.name, role_title: ctx.employee.role_title,
      unit_name: ctx.orgUnit?.name ?? null };
    if (phaseChanged) {
      await enqueueOutboxEvent(sys, {
        payload: {
          event: 'phase_complete',
          engagement: { id: ctx.engagement.id, client_name: ctx.engagement.client_name },
          employee: employeePayload,
          session: { id: sessionId, phase: dbPhase, completion_score: state.completion_score },
          insights: await loadInsightPayload(db, sessionId),
        },
        phase: TAXONOMY_TO_DB_PHASE[previousPhase],
      });
      scheduleOutboxDrain();
    }

    // ── Build the model request ──
    const { stable, volatile } = buildSystemPrompt({
      engagement: ctx.engagement, contextPack, orgUnit: ctx.orgUnit, employeeName: ctx.employee.name,
      employeeEmail: ctx.employee.email, employeeId: ctx.employee.id, employeeUserId: ctx.employee.user_id, roleTitle: ctx.employee.role_title, state, budget, memoryBlock, closing,
    });
    // Prompt caching: the stable prefix is one ephemeral cache breakpoint (byte-identical every turn); the volatile
    // runtime state sits after it, uncached.
    const system = [
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: volatile },
    ];
    const messages = turnsToMessages(turns);
    if (messages.length === 0) messages.push({ role: 'user', content: KICKOFF_NUDGE });
    else if (messages[messages.length - 1].role === 'assistant') messages.push({ role: 'user', content: RECOVERY_NUDGE });
    // A second cache breakpoint on the final message extends the cached prefix to the conversation so far.
    const apiMessages = messages.map((m, i) => (i === messages.length - 1
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : { role: m.role, content: m.content }));

    // ── Stream the reply ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event) => controller.enqueue(encoder.encode(sse(event)));
        try {
          send({ type: 'meta', phase: dbPhase, phaseChanged, userTurnId: userTurn?.id ?? null });
          // Retry once within THIS request if a retriable overload/5xx lands after the stream opened; the client is
          // told to discard the partial via 'reset' so two attempts never concatenate.
          let reply = '';
          let finalMessage = null;
          const MAX_STREAM_ATTEMPTS = 2;
          for (let attempt = 1; ; attempt++) {
            try {
              reply = '';
              const modelStream = model().messages.stream({
                model: env.INTERVIEW_MODEL ?? INTERVIEW_MODEL, max_tokens: MAX_REPLY_TOKENS, temperature: REPLY_TEMPERATURE,
                system, messages: apiMessages,
              });
              for await (const event of modelStream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                  reply += event.delta.text;
                  send({ type: 'delta', text: event.delta.text });
                }
              }
              finalMessage = await modelStream.finalMessage();
              break;
            } catch (streamErr) {
              if (attempt < MAX_STREAM_ATTEMPTS && isRetriableModelError(streamErr)) {
                log.warn(`interview stream attempt ${attempt} hit a retriable error; retrying`);
                send({ type: 'reset' });
                await new Promise((r) => setTimeout(r, 600 * attempt));
                continue;
              }
              throw streamErr;
            }
          }

          // Persist the agent turn before the stream closes.
          const { data: agentTurn, error: agentError } = await db.from('turn')
            .insert({ session_id: sessionId, role: 'agent', content: reply }).select('id').single();
          if (agentError) log.warn(`agent turn persist failed: ${agentError.message}`);
          await recordUsage(db, {
            sessionId, engagementId: ctx.engagement.id, model: env.INTERVIEW_MODEL ?? INTERVIEW_MODEL,
            inputTokens: finalMessage?.usage.input_tokens ?? 0, outputTokens: finalMessage?.usage.output_tokens ?? 0,
          });

          if (closing) await closeSessionAfterSignOff(db, sys, { ctx, session, state, dbPhase, employeePayload });
          send({ type: 'done', agentTurnId: agentTurn?.id ?? null, phase: dbPhase, complete: closing });
        } catch (e) {
          log.error('chat stream failed:', e?.name || 'error');
          send({ type: 'error', message: 'Something went wrong on our side. Nothing you said was lost — please try again.' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  };
}

export default makeChatHandler();
export const config = { path: '/api/interview/chat' };
