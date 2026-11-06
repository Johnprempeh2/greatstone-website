// Port of src/app/(portal)/admin/release-actions.ts and src/app/(portal)/admin/synthesis-actions.ts
// @505ba6a, plus the released-only read from src/app/(portal)/deliverable/[engagementId]/page.tsx.
// Changed: the auth and UI halves are removed and the server actions become pure functions taking
// `db` (interviewDb('system')) first. Every data check, message and audit event of the source stays.
//
// Port: who may call these is decided by the caller, not here. The source resolved the caller's
// email and required portal_role gs_admin on the engagement (requireGsAdmin). On the website the
// only callers are the signed GSAM bridge (GRE-2611) and the synthesis background function, which
// authenticate GSAM before calling; the client portal only ever calls getReleasedSynthesis. The actor
// email the source took from the session is now the `releasedBy` argument.
// Port: revalidatePath calls dropped (no Next.js cache on the site).
//
// Deliverable release gate (June 2026), source header kept:
// Decision (John): a client must NOT see discovery results until the Greatstone admin team approves
// them. The deliverable shows the LATEST synthesis as an internal working view to Greatstone, but a
// client_admin only ever sees the explicitly RELEASED version. Release is a pointer on the engagement
// row: released_synthesis_id (+ released_at, released_by).
//
// Synthesis trigger (Wave 5B), source header kept:
// A full synthesis run is a chain of Opus calls, so runSynthesis performs ONE bounded batch per call
// (at most SYNTHESIS_CALLS_PER_BATCH model calls, default 2) and persists progress in synthesis_cache
// after every call. The caller keeps calling until done: true. Re-running after any failure continues
// rather than restarts (per-interview summaries and unit roll-ups are cached by fingerprint).

import { runSynthesisStep, getLatestSynthesis } from './pipeline.mjs';
import { buildSynthesisBrief } from './brief.mjs';

export { getLatestSynthesis };

const SYNTHESIS_CALLS_PER_BATCH = Number(process.env.SYNTHESIS_CALLS_PER_BATCH) || 2;

// Port: the source imported logAudit from '@/lib/audit' (which used supabaseService() itself). Here it
// comes from the parallel port '../audit.mjs', loaded lazily so this module (and its tests) load
// before that file lands, and injectable through opts.logAudit for tests. The website port takes `db`
// first (logAudit(db, entry)); a one-argument logAudit(entry) is also accepted. As in the source,
// auditing never breaks the action it records.
async function audit(db, entry, opts) {
  try {
    const logAudit = opts?.logAudit ?? (await import('../audit.mjs')).logAudit;
    if (logAudit.length >= 2) await logAudit(db, entry);
    else await logAudit(entry);
  } catch (e) {
    console.error('[audit] insert threw:', entry.action, e);
  }
}

// Port: replaces the source's "sign in as a Greatstone admin" check: an actor must be named.
function actorMissing(releasedBy) {
  return typeof releasedBy !== 'string' || releasedBy.trim().length === 0;
}

// ─── Synthesis trigger (synthesis-actions.ts generateSynthesis) ──────────────

/**
 * Run one batch of the synthesis pipeline for an engagement.
 * @returns {Promise<{ ok: boolean, done: boolean, message: string, progress?: string, version?: number }>}
 */
export async function runSynthesis(db, engagementId, opts = {}) {
  try {
    // Port: opts.maxModelCalls lets the background function (15 min limit) take a larger batch;
    // the default is the source's SYNTHESIS_CALLS_PER_BATCH. relaxEligibility is deliberately not
    // accepted: the source never wires it to the production trigger.
    const result = await runSynthesisStep(db, engagementId, {
      maxModelCalls: opts.maxModelCalls ?? SYNTHESIS_CALLS_PER_BATCH,
    });

    const progress =
      result.phase === 'summaries'
        ? `summaries ${result.summariesReady}/${result.summariesTotal}`
        : result.phase === 'units'
          ? `unit roll-ups ${result.unitsReady}/${result.unitsTotal}`
          : result.phase === 'final'
            ? 'final synthesis'
            : undefined;

    return {
      ok: true,
      done: result.done,
      message: result.message,
      progress,
      version: result.version,
    };
  } catch (e) {
    console.error('generateSynthesis failed:', e);
    return {
      ok: false,
      done: true,
      message:
        'The synthesis run hit a problem and stopped. Progress so far is saved; generating again will continue from where it left off.',
    };
  }
}

/** Source name, kept. */
export const generateSynthesis = runSynthesis;

/**
 * Generate the engagement synthesis brief: the structured handoff pack. Returns the markdown.
 * Port: no Notion write on the site (GSAM reads the brief through the bridge), so writeToNotion is
 * false and the "Notion page could not be written" suffix of the source message is dropped.
 */
export async function generateSynthesisBrief(db, engagementId) {
  try {
    const result = await buildSynthesisBrief(db, engagementId, { writeToNotion: false });
    return {
      ok: true,
      message: `Synthesis brief v${result.version} ready: ${result.stats.interviewsIncluded} interview(s), ${result.stats.patternsPromoted} promoted pattern(s), ${result.stats.patternsNeedingCorroboration} needing corroboration.`,
      markdown: result.markdown,
      version: result.version,
      notionPageUrl: null,
      notionPageId: null,
    };
  } catch (e) {
    console.error('generateSynthesisBrief failed:', e);
    return {
      ok: false,
      message:
        'The brief run hit a problem and stopped. Progress so far is saved; generating again will continue from where it left off.',
    };
  }
}

// ─── Release gate (release-actions.ts) ───────────────────────────────────────

/**
 * Release a specific synthesis version to the client: set engagement.released_synthesis_id,
 * released_at (now) and released_by (actor email). Verifies the synthesis row belongs to the
 * engagement before pointing at it, so a stray id can never expose another client's work.
 * @returns {Promise<{ ok: boolean, message: string, releasedSynthesisId?: string | null }>}
 */
export async function releaseSynthesis(db, engagementId, synthesisId, releasedBy, opts = {}) {
  try {
    if (actorMissing(releasedBy)) {
      return { ok: false, message: 'Name the Greatstone admin releasing this deliverable.' };
    }

    // The synthesis row must exist AND belong to this engagement.
    const { data: synthRow, error: synthError } = await db
      .from('synthesis')
      .select('id, version, engagement_id')
      .eq('id', synthesisId)
      .maybeSingle();
    if (synthError) {
      throw new Error(`synthesis lookup failed: ${synthError.message}`);
    }
    if (!synthRow || synthRow.engagement_id !== engagementId) {
      return {
        ok: false,
        message: 'That synthesis version does not belong to this engagement.',
      };
    }

    const { error: updateError } = await db
      .from('engagement')
      .update({
        released_synthesis_id: synthesisId,
        released_at: new Date().toISOString(),
        released_by: releasedBy,
      })
      .eq('id', engagementId);
    if (updateError) {
      throw new Error(`release update failed: ${updateError.message}`);
    }

    await audit(db, {
      engagementId,
      actorEmail: releasedBy,
      actorName: null,
      action: 'synthesis.released',
      summary: `Released synthesis v${synthRow.version} to the client`,
      targetId: synthesisId,
    }, opts);

    return {
      ok: true,
      message: `Synthesis v${synthRow.version} released to the client.`,
      releasedSynthesisId: synthesisId,
    };
  } catch (e) {
    console.error('releaseSynthesis failed:', e);
    return {
      ok: false,
      message: 'The release could not be completed. Nothing was changed; try again.',
    };
  }
}

/**
 * Withdraw the released deliverable: null released_synthesis_id, released_at and released_by. The
 * client returns to the holding screen until something is released again.
 */
export async function withdrawRelease(db, engagementId, releasedBy, opts = {}) {
  try {
    if (actorMissing(releasedBy)) {
      return { ok: false, message: 'Name the Greatstone admin withdrawing this deliverable.' };
    }

    const { error: updateError } = await db
      .from('engagement')
      .update({
        released_synthesis_id: null,
        released_at: null,
        released_by: null,
      })
      .eq('id', engagementId);
    if (updateError) {
      throw new Error(`unrelease update failed: ${updateError.message}`);
    }

    await audit(db, {
      engagementId,
      actorEmail: releasedBy,
      actorName: null,
      action: 'synthesis.unreleased',
      summary: 'Withdrew the released deliverable',
    }, opts);

    return {
      ok: true,
      message: 'Deliverable withdrawn. The client now sees the holding screen.',
      releasedSynthesisId: null,
    };
  } catch (e) {
    console.error('unreleaseSynthesis failed:', e);
    return {
      ok: false,
      message: 'The withdrawal could not be completed. Nothing was changed; try again.',
    };
  }
}

/** Source name, kept. */
export const unreleaseSynthesis = withdrawRelease;

// ─── Client-facing read (deliverable/[engagementId]/page.tsx, client_admin branch) ──

/**
 * The client release gate: ONLY the synthesis explicitly released for this engagement, or null when
 * nothing is released. Never falls back to the latest row. The synthesis is matched on both its id
 * and the engagement id, so a pointer can never surface another engagement's work.
 * Port: an error on the engagement read is thrown (the page ignored it and showed the holding
 * screen); the caller decides how to present it. Callers rendering it should also apply
 * verifyForRender (pipeline.mjs) as the page did.
 */
export async function getReleasedSynthesis(db, engagementId) {
  const { data: engagementRow, error: engagementError } = await db
    .from('engagement')
    .select('id, released_synthesis_id')
    .eq('id', engagementId)
    .maybeSingle();
  if (engagementError) {
    throw new Error(`engagement lookup failed: ${engagementError.message}`);
  }
  const releasedSynthesisId = engagementRow?.released_synthesis_id ?? null;
  if (!engagementRow || !releasedSynthesisId) return null;

  const { data: releasedRow, error: releasedError } = await db
    .from('synthesis')
    .select('*')
    .eq('id', releasedSynthesisId)
    .eq('engagement_id', engagementId)
    .maybeSingle();
  if (releasedError) {
    throw new Error(`released synthesis lookup failed: ${releasedError.message}`);
  }
  return releasedRow ?? null;
}
