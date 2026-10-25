// Runs one synthesis run to the end (GRE-2612). Started only by the admin bridge after GSAM's signed POST
// rounds/{id}/synthesis committed a synthesis_run row; the shared INTERVIEW_INTERNAL_SECRET proves the caller.
// The pipeline persists progress after every model call, so if the 15 minute background limit comes near, the
// function hands the same run to a fresh invocation and that one continues from the cache.
import { timingSafeEqual } from 'node:crypto';
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { runSynthesis, getLatestSynthesis } from './lib/interview/synthesis/release.mjs';
import { startSynthesisRun } from './lib/interview/side-effects.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUDGET_MS = 12 * 60 * 1000;

function secretMatches(given, expected) {
  if (!expected || expected.length < 32 || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeSynthesisHandler({ pool = getPool, run = runSynthesis, latest = getLatestSynthesis, handOff = startSynthesisRun,
  env = process.env, now = () => Date.now(), log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST' || !secretMatches(req.headers.get('x-interview-internal'), env.INTERVIEW_INTERNAL_SECRET)) {
      return new Response(null, { status: 404 });
    }
    let job;
    try { job = await req.json(); } catch { return new Response(null, { status: 400 }); }
    if (!UUID.test(job?.runId || '') || !UUID.test(job?.engagementId || '')) return new Response(null, { status: 400 });
    const p = pool();
    if (!p) return new Response(null, { status: 503 });
    const db = interviewDb('system', { pool: p });
    const { data: row } = await db.from('synthesis_run').select('status').eq('id', job.runId).eq('engagement_id', job.engagementId).maybeSingle();
    if (row?.status !== 'running') return new Response(null, { status: 409 });
    const started = now();
    const finish = (status, extra = {}) => db.from('synthesis_run').update({ status, finished_at: new Date().toISOString(), ...extra })
      .eq('id', job.runId).eq('status', 'running');
    try {
      for (;;) {
        const step = await run(db, job.engagementId, { maxModelCalls: 4 });
        if (!step.ok) { await finish('failed', { error: step.message.slice(0, 500) }); return new Response(null, { status: 200 }); }
        if (step.done) break;
        if (now() - started > BUDGET_MS) {
          await handOff({ runId: job.runId, engagementId: job.engagementId, origin: new URL(req.url).origin }, env);
          return new Response(null, { status: 200 });
        }
      }
      const synthesis = await latest(db, job.engagementId);
      await finish('done', { synthesis_id: synthesis?.id ?? null });
    } catch (error) {
      log(`interview-synthesis: run failed (${error?.code || error?.name || 'error'})`);
      await finish('failed', { error: 'The run stopped. Progress is saved; start synthesis again to continue.' });
    }
    return new Response(null, { status: 200 });
  };
}

export default makeSynthesisHandler();
