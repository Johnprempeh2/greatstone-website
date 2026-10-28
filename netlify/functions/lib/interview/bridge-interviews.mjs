// Synthesis runs in GSAM (GRE-2611, John 25 Oct). The website gives GSAM the completed interviews to synthesise and
// takes back the synthesis GSAM has released; the site's own pipeline (synthesis/) stays only as a fallback.
//
//   GET  …/rounds/{roundId}/interviews                  the interviews that may enter synthesis
//   GET  …/rounds/{roundId}/interviews/{interviewId}    one interview: user turns, insights, consent
//   POST …/rounds/{roundId}/synthesis/released          GSAM's released synthesis: stored, re-verified, released
//
// Eligibility, confidence caps, the quote gate and the voice key are the pipeline's own (loadSynthesisData), so GSAM
// sees exactly what the fallback pipeline would. A pushed synthesis is re-verified against the stored turns with the
// renderer's check (verifyForRender: every quote verbatim in an eligible insight, two distinct voices and one first-hand
// voice per theme, one verified quote per recommendation) before the release pointer moves. A push that fails it is
// refused and nothing is written, so the client can only ever see a synthesis that verifies here.
import { BridgeRequestError } from '../admin-bridge-store.mjs';
import { loadSynthesisData } from './synthesis/data.mjs';
import { verifyForRender } from './synthesis/pipeline.mjs';
import { releaseSynthesis } from './synthesis/release.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PUSH_BYTES = 1_000_000;
const bad = (what) => { throw new BridgeRequestError('bad_request', what); };
const notFound = () => { throw new BridgeRequestError('not_found', 'no such interview'); };
const must = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const iso = (v) => (v == null ? null : new Date(v).toISOString());

function interviewView(e, data) {
  const { session, employee } = e;
  const unit = data.units.find((u) => u.id === employee.unit_id);
  return {
    interviewId: session.id, employeeId: employee.id, userId: employee.user_id ?? null,
    voiceKey: employee.person_id ?? employee.id, unitId: employee.unit_id ?? null, unitName: unit?.name ?? 'Unassigned',
    roleTitle: employee.role_title ?? null, leaderTrack: employee.leader_track ?? null,
    complete: e.complete, partial: e.partial, phase: session.phase, completionScore: session.completion_score,
    startedAt: iso(session.started_at), endedAt: iso(session.ended_at), insightCount: e.insightCount, fingerprint: e.fingerprint,
  };
}

/** The interviews that may enter synthesis, with the round's counts for the methodology section. */
export async function listInterviews(db, eng) {
  const data = await loadSynthesisData(db, eng.id, false);
  const items = data.eligible.map((e) => interviewView(e, data));
  const real = data.allSessions.filter((s) => !s.is_test);
  return {
    items,
    counts: { sessions: real.length, ended: real.filter((s) => s.ended_at).length, eligible: items.length,
      complete: items.filter((i) => i.complete).length, partial: items.filter((i) => i.partial).length },
    log: data.loadLog,
  };
}

/** One eligible interview: the participant's turns, its insights (capped, with the quote gate) and its consent state. */
export async function getInterview(db, eng, interviewId) {
  if (!UUID.test(interviewId || '')) notFound();
  const data = await loadSynthesisData(db, eng.id, false);
  const e = data.eligible.find((x) => x.session.id === interviewId);
  if (!e) notFound();
  const turns = must(await db.from('turn').select('seq, role, content, ts, input_mode').eq('session_id', interviewId).order('seq'));
  const consent = must(await db.from('consent_event').select('kind, value, ts').eq('employee_id', e.employee.id).order('ts'));
  const latest = (kind) => { const c = consent.filter((x) => x.kind === kind).at(-1); return c ? c.value : null; };
  return {
    interview: interviewView(e, data),
    consent: { participation: latest('participation'), attribution: latest('attribution') },
    turns: turns.map((t) => ({ seq: Number(t.seq), role: t.role, content: t.content, ts: iso(t.ts), inputMode: t.input_mode ?? null })),
    insights: data.insights.filter((i) => i.session.id === interviewId).map((i) => ({
      id: i.row.id, type: i.row.type, label: i.row.label, evidenceQuote: i.row.evidence_quote ?? null,
      timePerWeekHours: i.row.time_per_week_hours, confidence: i.confidence, secondHand: i.secondHand,
      attributionRedacted: i.row.attribution_redacted, quoteEligible: i.quoteEligible,
    })),
  };
}

// ── push ─────────────────────────────────────────────────────────────────────────────────────────

const arr = (x, k, max = 500) => (Array.isArray(x) && x.length <= max ? x : bad(k));
const obj = (x, k) => (x && typeof x === 'object' && !Array.isArray(x) ? x : bad(k));
function quotes(list, k) {
  return arr(list ?? [], k, 50).map((q, i) => {
    obj(q, `${k}[${i}]`);
    if (!UUID.test(q.insight_id || '')) bad(`${k}[${i}].insight_id`);
    if (typeof q.quote !== 'string' || !q.quote.trim() || q.quote.length > 2000) bad(`${k}[${i}].quote`);
    return q;
  });
}
function themes(list, k) {
  return arr(list, k).map((t, i) => {
    obj(t, `${k}[${i}]`);
    if (typeof t.theme_id !== 'string' || !t.theme_id) bad(`${k}[${i}].theme_id`);
    quotes(t.evidence_quotes, `${k}[${i}].evidence_quotes`);
    return t;
  });
}

/**
 * The inner objects keep the stored synthesis shape (snake_case, as synthesis/pipeline.mjs writes it), so the client
 * read-out renders a pushed synthesis exactly as one made here.
 */
export function checkPush(body) {
  const keys = ['schema', 'synthesisId', 'headlineRead', 'themes', 'hotSpots', 'recommendations', 'followUps',
    'methodology', 'modelVersion', 'rulesVersion', 'inputInsightIds'];
  obj(body, 'body');
  for (const key of Object.keys(body)) if (!keys.includes(key)) bad(`body.${key}`);
  if (body.schema !== 'gs-interview-synthesis-v1') bad('schema');
  if (JSON.stringify(body).length > MAX_PUSH_BYTES) bad('body too large');
  if (!UUID.test(body.synthesisId || '')) bad('synthesisId');
  const hotSpots = arr(body.hotSpots ?? [], 'hotSpots').map((h, i) => {
    obj(h, `hotSpots[${i}]`);
    themes(h.local_themes ?? [], `hotSpots[${i}].local_themes`);
    return { ...h, local_themes: h.local_themes ?? [] };
  });
  const recommendations = arr(body.recommendations ?? [], 'recommendations').map((r, i) => {
    obj(r, `recommendations[${i}]`);
    if (typeof r.rec_id !== 'string' || !r.rec_id) bad(`recommendations[${i}].rec_id`);
    quotes(r.evidence_quotes, `recommendations[${i}].evidence_quotes`);
    return r;
  });
  const headline = body.headlineRead == null ? null : obj(body.headlineRead, 'headlineRead');
  if (headline && (typeof headline.text !== 'string' || !Array.isArray(headline.supporting_insight_ids))) bad('headlineRead');
  const ids = arr(body.inputInsightIds ?? [], 'inputInsightIds', 20000);
  if (ids.some((x) => !UUID.test(x || ''))) bad('inputInsightIds');
  const text = (x, k) => (x == null ? null : typeof x === 'string' && x.length <= 200 ? x : bad(k));
  return {
    id: body.synthesisId, themes: themes(body.themes ?? [], 'themes'), hot_spots: hotSpots, recommendations,
    follow_ups: arr(body.followUps ?? [], 'followUps'), headline_read: headline,
    methodology: body.methodology == null ? null : obj(body.methodology, 'methodology'),
    model_version: text(body.modelVersion, 'modelVersion'), rules_version: text(body.rulesVersion, 'rulesVersion'),
    input_insight_ids: ids,
  };
}

/** Store GSAM's synthesis as the next version, re-verify it here, and release it. All or nothing (bridge savepoint). */
export async function pushReleasedSynthesis(db, ctx, eng, body) {
  const row = checkPush(body);
  const clash = must(await db.from('synthesis').select('id, engagement_id').eq('id', row.id).maybeSingle());
  if (clash) throw new BridgeRequestError('conflict', 'that synthesis id is already stored');
  const last = must(await db.from('synthesis').select('version').eq('engagement_id', eng.id).order('version', { ascending: false }).limit(1));
  const version = (last[0]?.version ?? 0) + 1;
  const stored = must(await db.from('synthesis').insert({ ...row, engagement_id: eng.id, version,
    validation_log: [{ kind: 'note', subject: 'source', reason: `made in GSAM and pushed by ${ctx.actor.slice(0, 200)}` }] })
    .select('*').single());
  const { failed } = await verifyForRender(db, eng.id, stored);
  if (failed.size) {
    const reasons = [...failed.entries()].slice(0, 20).map(([key, why]) => `${key}: ${why}`).join('; ');
    bad(`synthesis does not verify against the stored interviews (${failed.size}): ${reasons}`);
  }
  const done = await releaseSynthesis(db, eng.id, stored.id, ctx.actor);
  if (!done.ok) bad(done.message);
  return { synthesisId: stored.id, version };
}
