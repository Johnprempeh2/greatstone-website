// Port of src/app/api/voice/think/route.ts @505ba6a: the voice brain, Deepgram's bring-your-own-LLM endpoint
// (GRE-2612). Deepgram's Voice Agent owns the realtime audio and calls THIS endpoint for every reply; the interview
// engine (Claude, slots, phases, extraction, outbox) runs here as on the typed path.
// The adapter: Deepgram speaks `open_ai`, so this accepts an OpenAI Chat Completions POST and streams
// chat.completion.chunk deltas back. Claude never sees that; the translation is local.
// AUTH IS DIFFERENT FROM EVERY OTHER ENDPOINT. This one is called BY DEEPGRAM, server to server, with no cookie and
// no user, on a public URL. It authenticates with a random per-session bearer whose sha256 is on the session row,
// so a leak is scoped to one interview and dies with it. Same answer for "no such session" and "wrong token".
// We ignore Deepgram's history: our turn table is the evidentiary record, so we take the newest utterance only.
// Port: data runs with system claims, after the token check (the token, not a person, is the authority here).
// VOICE_ENABLED is the kill switch. Clause buffering is unchanged: whole clauses only, so the voice can shape them.
import Anthropic from '@anthropic-ai/sdk';
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { interviewEnabled, voiceEnabled, roundVoiceEnabled } from './lib/interview/caller.mjs';
import { getEmployeeContextById } from './lib/interview/employee.mjs';
import {
  advancePhase, applySlotUpdates, buildSystemPrompt, computeCompletionScore, deriveNextAction, KICKOFF_NUDGE,
  normaliseTaxonomyState, RECOVERY_NUDGE, signOffComplete, TAXONOMY_TO_DB_PHASE, turnsToMessages, updatePaceFields,
} from './lib/interview/interview.mjs';
import { runExtraction, persistableInsights, EXTRACTION_MODEL } from './lib/interview/extraction.mjs';
import { loadActiveMemoryBlob, renderMemoryBlob } from './lib/interview/memory.mjs';
import { getBudgetStatus, recordUsage } from './lib/interview/budget.mjs';
import { enqueueOutboxEvent, scheduleOutboxDrain } from './lib/interview/outbox.mjs';
import { ClauseBuffer } from './lib/interview/voice/clause-buffer.mjs';
import { withinRate } from './lib/interview/ratelimit.mjs';
import { closeSessionAfterSignOff, recordConsentUpdates } from './lib/interview/turn-effects.mjs';
import { bearerFrom, hashSessionToken, tokenHashMatches } from './lib/interview/voice/session-token.mjs';
import { chunkClose, chunkDone, chunkOpener, chunkText, latestUserMessage, SSE_HEADERS } from './lib/interview/voice/openai-wire.mjs';
import { VOICE_PROMPT_ADDENDUM } from './lib/interview/voice/prompt-addendum.mjs';

// Voice runs on the Haiku tier: p50 time to first token about 0.79s against 1.84s for Sonnet. Typed keeps Sonnet.
const VOICE_MODEL = process.env.VOICE_INTERVIEW_MODEL ?? 'claude-haiku-4-5';
const MAX_REPLY_TOKENS = 300; // spoken replies must be shorter than typed ones
const TURNS_PER_MIN_SESSION = Number(process.env.VOICE_TURNS_PER_MIN) || 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let anthropic = null;
const defaultClient = () => (anthropic ??= new Anthropic());
const unauthorised = () => Response.json({ error: 'unauthorised' }, { status: 401, headers: { 'cache-control': 'no-store' } });

/** A refusal Deepgram can still speak, so a failure is never dead air. */
function spokenError(message) {
  const id = `chatcmpl-err-${Date.now()}`;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(chunkOpener(id, VOICE_MODEL));
      c.enqueue(chunkText(id, VOICE_MODEL, message));
      c.enqueue(chunkClose(id, VOICE_MODEL));
      c.enqueue(chunkDone());
      c.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export function makeVoiceThinkHandler({ pool = getPool, model = defaultClient, env = process.env, log = console } = {}) {
  return async (req) => {
    if (!interviewEnabled(env) || !voiceEnabled(env)) return Response.json({ error: 'not found' }, { status: 404 });
    if (req.method !== 'POST') return unauthorised();
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session') ?? '';
    const presented = bearerFrom(req.headers.get('authorization'));
    // A session id that is not even a UUID cannot belong to anyone: rejected here, identically to every other
    // rejection, so scanners on this public URL never register as server errors.
    if (!sessionId || !presented || !UUID.test(sessionId)) return unauthorised();
    const p = pool();
    if (!p) return spokenError('Sorry, something went wrong on our side.');
    const db = interviewDb('system', { pool: p });

    // ── Auth: the token must hash to the one stored on THIS session ──
    const { data: sessions, error: sessionError } = await db.from('session').select('*').eq('id', sessionId).limit(1);
    if (sessionError) return Response.json({ error: 'session lookup failed' }, { status: 500 });
    const session = sessions?.[0];
    if (!session || !tokenHashMatches(hashSessionToken(presented), session.voice_token_hash)) return unauthorised();
    if (session.ended_at) return spokenError('This conversation has already been completed. Thank you.');

    const ctx = await getEmployeeContextById(db, session.employee_id).catch(() => null);
    if (!ctx) return spokenError('This conversation is no longer active.');
    if (!roundVoiceEnabled(ctx.engagement)) return spokenError('Voice is switched off for now. Please carry on by typing; everything you said is saved.');
    if (!(await withinRate(db, `voice:s:${sessionId}`, 60, TURNS_PER_MIN_SESSION))) return spokenError('Just a moment.');

    const budget = await getBudgetStatus(db, ctx.employee.id, ctx.engagement.id);
    if (budget.ratio >= (Number(env.CHAT_HARD_BUDGET_RATIO) || 1.5)) {
      return spokenError('We have reached the limit for this conversation. Everything you said is saved. Thank you.');
    }

    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'bad request' }, { status: 400 }); }
    // one spoken turn; far longer than any utterance, so nothing real is cut
    const content = (latestUserMessage(body) ?? '').slice(0, 8000);

    // ── Load our transcript (the source of truth, not Deepgram's history) ──
    const { data: turnRows, error: turnsError } = await db.from('turn').select('*')
      .eq('session_id', sessionId).order('seq', { ascending: true });
    if (turnsError) return spokenError('Sorry, something went wrong on our side.');
    const turns = turnRows ?? [];
    const lastAgentTurn = [...turns].reverse().find((t) => t.role === 'agent') ?? null;

    // ── Persist the spoken turn ──
    if (content) {
      const insertRes = await db.from('turn').insert({ session_id: sessionId, role: 'user', content, input_mode: 'voice' })
        .select('*').single();
      if (insertRes.error) return spokenError('Sorry, I did not catch that. Could you say it again?');
      turns.push(insertRes.data);
    }

    // ── State hydration (identical to the typed path) ──
    const state = normaliseTaxonomyState(session.taxonomy_state);
    updatePaceFields(state, session.started_at);
    let contextPack = null;
    if (ctx.engagement.context_pack_id) {
      const { data: packs } = await db.from('context_pack').select('content, version').eq('id', ctx.engagement.context_pack_id).limit(1);
      contextPack = packs?.[0] ?? null;
    }
    let memoryBlock = null;
    if (ctx.employee.person_id) {
      const blob = await loadActiveMemoryBlob(db, ctx.employee.person_id, ctx.engagement.customer_id);
      if (blob) memoryBlock = renderMemoryBlob(blob, { participantName: ctx.employee.name });
    }

    // ── Extraction + phase machine (pre-reply) ──
    const previousPhase = state.phase;
    let phaseChanged = false;
    if (content) {
      const extraction = await runExtraction({
        taxonomyState: state, agentQuestion: lastAgentTurn?.content ?? null, employeeMessage: content,
        onBehalf: ctx.employee.leader_track === 'on_behalf',
      });
      if (extraction) {
        state.slots = applySlotUpdates(state.slots, extraction.slot_updates);
        state.completion_score = computeCompletionScore(state.slots);
        const toPersist = persistableInsights(extraction.insights);
        if (toPersist.length > 0) {
          const { error: insightError } = await db.from('insight').insert(toPersist.map((i) => ({
            session_id: sessionId, type: i.type, label: i.label, evidence_quote: i.evidence_quote,
            time_per_week_hours: i.time_per_week_hours, confidence: i.confidence, second_hand: i.second_hand,
          })));
          if (insightError) log.warn(`insight insert failed: ${insightError.message}`);
          state.insights_extracted = (state.insights_extracted ?? 0) + toPersist.length;
        }
        // spoken consent answers are recorded as typed ones are
        await recordConsentUpdates(db, { employeeId: ctx.employee.id, sessionId, extraction, log });
        await recordUsage(db, {
          sessionId, engagementId: ctx.engagement.id, model: EXTRACTION_MODEL,
          inputTokens: extraction.usage.inputTokens, outputTokens: extraction.usage.outputTokens,
        }).catch(() => {});
      }
      const newPhase = advancePhase(state.slots, state.phase);
      phaseChanged = newPhase !== state.phase;
      state.phase = newPhase;
      state.next_action = deriveNextAction(state);
    }
    const closing = signOffComplete(state);
    if (closing && state.phase !== 'sign_off') {
      // as on the typed path: both consents recorded ahead of the pointer means the interview IS in sign-off
      state.phase = 'sign_off';
      phaseChanged = true;
    }

    // ── The voice addendum goes in the VOLATILE half: the stable prefix is the cache breakpoint. ──
    const { stable, volatile } = buildSystemPrompt({
      engagement: ctx.engagement, contextPack, orgUnit: ctx.orgUnit, employeeName: ctx.employee.name,
      employeeEmail: ctx.employee.email, employeeId: ctx.employee.id, roleTitle: ctx.employee.role_title, state, budget, memoryBlock, closing,
    });
    const system = [
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `${volatile}\n\n${VOICE_PROMPT_ADDENDUM}` },
    ];
    const messages = turnsToMessages(turns);
    if (messages.length === 0) messages.push({ role: 'user', content: KICKOFF_NUDGE });
    else if (messages[messages.length - 1].role === 'assistant') messages.push({ role: 'user', content: RECOVERY_NUDGE });
    const apiMessages = messages.map((m, i) => (i === messages.length - 1
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : { role: m.role, content: m.content }));

    // ── Stream Claude out as OpenAI deltas ──
    const voiceModel = env.VOICE_INTERVIEW_MODEL ?? VOICE_MODEL;
    const id = `chatcmpl-${sessionId.slice(0, 8)}-${Date.now()}`;
    const stream = new ReadableStream({
      async start(controller) {
        let full = '';
        let inTok = 0;
        let outTok = 0;
        // Tokens are held just long enough to release a whole clause: synthesis plans intonation across a phrase.
        const clauses = new ClauseBuffer();
        try {
          controller.enqueue(chunkOpener(id, voiceModel));
          const ms = await model().messages.stream({
            model: voiceModel, max_tokens: MAX_REPLY_TOKENS, temperature: 0.7, system, messages: apiMessages,
          });
          for await (const event of ms) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
              full += event.delta.text;
              for (const clause of clauses.push(event.delta.text)) controller.enqueue(chunkText(id, voiceModel, `${clause} `));
            }
          }
          const finalMsg = await ms.finalMessage();
          inTok = finalMsg.usage?.input_tokens ?? 0;
          outTok = finalMsg.usage?.output_tokens ?? 0;
        } catch (err) {
          log.error('voice think stream failed:', err?.name || 'error');
          if (!full) controller.enqueue(chunkText(id, voiceModel, 'Sorry, could you say that again?'));
        } finally {
          // Whatever is held must be spoken, including on the error path; the last sentence always lands here.
          const tail = clauses.drain();
          if (tail) controller.enqueue(chunkText(id, voiceModel, tail));
          // ALWAYS terminate, or the turn hangs and the participant hears silence.
          controller.enqueue(chunkClose(id, voiceModel));
          controller.enqueue(chunkDone());
        }
        // ── Persistence BEFORE the stream closes, deliberately: the function may be frozen once it closes. ──
        try {
          if (full.trim()) {
            await db.from('turn').insert({ session_id: sessionId, role: 'agent', content: full, input_mode: 'voice' });
            await recordUsage(db, { sessionId, engagementId: ctx.engagement.id, model: voiceModel, inputTokens: inTok, outputTokens: outTok })
              .catch(() => {});
            await db.from('session').update({
              taxonomy_state: state, phase: TAXONOMY_TO_DB_PHASE[state.phase], completion_score: state.completion_score,
            }).eq('id', sessionId);
            if (phaseChanged) {
              // phase_complete describes the phase just FINISHED, as on the typed path.
              await enqueueOutboxEvent(db, {
                payload: {
                  event: 'phase_complete',
                  engagement: { id: ctx.engagement.id, client_name: ctx.engagement.client_name },
                  employee: { id: ctx.employee.id, name: ctx.employee.name, role_title: ctx.employee.role_title,
                    unit_name: ctx.orgUnit?.name ?? null },
                  session: { id: sessionId, phase: TAXONOMY_TO_DB_PHASE[state.phase], completion_score: state.completion_score ?? 0 },
                },
                phase: TAXONOMY_TO_DB_PHASE[previousPhase],
              });
              scheduleOutboxDrain();
            }
            // Port: a wholly spoken interview closes itself on sign-off, as a typed one does (turn-effects.mjs)
            if (closing) {
              await closeSessionAfterSignOff(db, db, { ctx, session, state, dbPhase: TAXONOMY_TO_DB_PHASE[state.phase],
                employeePayload: { id: ctx.employee.id, name: ctx.employee.name, role_title: ctx.employee.role_title,
                  unit_name: ctx.orgUnit?.name ?? null } });
            }
          }
        } catch (e) {
          log.error('voice think persistence failed:', e?.name || 'error');
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  };
}

export default makeVoiceThinkHandler();
export const config = { path: '/api/interview/voice/think' };
