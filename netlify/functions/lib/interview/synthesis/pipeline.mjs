// Port of src/lib/synthesis/pipeline.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client. Stage order, batching, caching,
// validation pass, hot spots, methodology and versioning unchanged.
//
// Synthesis pipeline orchestrator (Wave 5B).
//
// One invocation = one bounded batch of model work (StepOptions.maxModelCalls, default 2), so the
// trigger never risks the function time limit: each Opus call is a bounded single request, and
// progress is persisted in synthesis_cache after every call. Re-invoking continues exactly where the
// previous batch stopped:
//
//   batch 1..n   per-interview summaries (cached by session id + fingerprint)
//   batch n+1..  unit roll-ups, leaves first (cached by unit id + fingerprint)
//   final batch  engagement coordinator -> invariant validation pass -> hot spots + methodology
//                computed in code -> NEW synthesis row (version = max + 1)
//
// Port: on the website the trigger is the background function interview-synthesis-background (15
// minute limit) via release.mjs runSynthesis, in place of the source's Vercel server action and the
// local CLI scripts/synthesis-run.mjs; both call the same step function in a loop.

import { loadSynthesisData } from './data.mjs';
import { loadCache } from './cache.mjs';
import { summariseSession } from './summariser.mjs';
import {
  buildUnitPlan,
  buildVoiceDirectory,
  runCoordinator,
  synthesiseUnit,
} from './rollup.mjs';
import {
  quoteWithinSource,
  validateFollowUps,
  validateHeadline,
  validateRecommendations,
  validateThemes,
} from './invariants.mjs';
import { computeHotSpots } from './hotspots.mjs';
import { SYNTHESIS_MODEL } from './model.mjs';
import { RULES_VERSION } from './types.mjs';

function freshUsage() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, costPence: 0 };
}

function isoDay(ts) {
  return ts.slice(0, 10);
}

/** @returns {Promise<StepResult>} see types.mjs */
export async function runSynthesisStep(db, engagementId, opts = {}) {
  const maxModelCalls = opts.maxModelCalls ?? 2;
  const tally = freshUsage();
  const budgetLeft = () => maxModelCalls - tally.calls;

  const data = await loadSynthesisData(db, engagementId, opts.relaxEligibility ?? false);
  const { engagement, units, employees, eligible, insights } = data;
  const log = [...data.loadLog];

  if (eligible.length === 0) {
    return {
      done: true,
      phase: 'no_input',
      message:
        'No synthesis-eligible sessions yet: a session qualifies once it has ended having completed pain mapping.',
      summariesTotal: 0,
      summariesReady: 0,
      unitsTotal: 0,
      unitsReady: 0,
      usage: tally,
    };
  }

  const unitNameById = new Map(units.map((u) => [u.id, u.name]));
  const insightById = new Map(insights.map((i) => [i.row.id, i]));
  const insightsBySession = new Map();
  for (const i of insights) {
    const list = insightsBySession.get(i.session.id) ?? [];
    list.push(i);
    insightsBySession.set(i.session.id, list);
  }
  const redactedEmployeeIds = new Set(
    insights.filter((i) => i.row.attribution_redacted).map((i) => i.employee.id)
  );
  const voices = buildVoiceDirectory(eligible, unitNameById, redactedEmployeeIds);

  // ── Stage 1: per-interview summaries (cached, resumable) ───────────────────
  const sessionCache = await loadCache(db, engagementId, 'session');
  const summaries = new Map();
  let summariesReady = 0;
  for (const elig of eligible) {
    const cached = sessionCache.get(elig.session.id);
    if (cached && cached.fingerprint === elig.fingerprint) {
      summaries.set(elig.session.id, cached.payload);
      summariesReady += 1;
    }
  }
  for (const elig of eligible) {
    if (summaries.has(elig.session.id)) continue;
    if (budgetLeft() <= 0) {
      return {
        done: false,
        phase: 'summaries',
        message: `Summarised ${summariesReady} of ${eligible.length} interviews; run again to continue.`,
        summariesTotal: eligible.length,
        summariesReady,
        unitsTotal: 0,
        unitsReady: 0,
        usage: tally,
      };
    }
    const sessionInsights = insightsBySession.get(elig.session.id) ?? [];
    const unitName = elig.employee.unit_id
      ? unitNameById.get(elig.employee.unit_id) ?? 'Unassigned'
      : 'Unassigned';
    const summary = await summariseSession({
      db,
      engagementId,
      elig,
      insightsForSession: sessionInsights,
      unitName,
      tally,
      log,
    });
    summaries.set(elig.session.id, summary);
    summariesReady += 1;
  }

  // ── Stage 2: hierarchical unit roll-up (leaves first, cached) ──────────────
  const plan = buildUnitPlan(units, eligible);
  const unitCache = await loadCache(db, engagementId, 'unit');
  const unitSyntheses = new Map();
  let unitsReady = 0;
  for (const node of plan.ordered) {
    const cached = unitCache.get(node.unit.id);
    if (cached && cached.fingerprint === node.fingerprint) {
      unitSyntheses.set(node.unit.id, cached.payload);
      unitsReady += 1;
      continue;
    }
    if (budgetLeft() <= 0) {
      return {
        done: false,
        phase: 'units',
        message: `Rolled up ${unitsReady} of ${plan.ordered.length} units; run again to continue.`,
        summariesTotal: eligible.length,
        summariesReady,
        unitsTotal: plan.ordered.length,
        unitsReady,
        usage: tally,
      };
    }
    const synthesis = await synthesiseUnit({
      db,
      engagement,
      node,
      childSyntheses: node.children
        .map((c) => unitSyntheses.get(c.unit.id))
        .filter((s) => s !== undefined),
      memberSummaries: node.directSessions
        .map((s) => summaries.get(s.session.id))
        .filter((s) => s !== undefined),
      voices,
      insightById,
      tally,
      log,
    });
    unitSyntheses.set(node.unit.id, synthesis);
    unitsReady += 1;
  }

  // ── Stage 3: engagement coordinator + validation + write ──────────────────
  if (budgetLeft() <= 0) {
    return {
      done: false,
      phase: 'final',
      message: 'Summaries and unit roll-ups are ready; run again for the final synthesis.',
      summariesTotal: eligible.length,
      summariesReady,
      unitsTotal: plan.ordered.length,
      unitsReady,
      usage: tally,
    };
  }

  const raw = await runCoordinator({
    db,
    engagement,
    topSyntheses: plan.roots
      .map((r) => unitSyntheses.get(r.unit.id))
      .filter((s) => s !== undefined),
    unassignedSummaries: plan.unassigned
      .map((s) => summaries.get(s.session.id))
      .filter((s) => s !== undefined),
    voices,
    tally,
  });

  const ctx = {
    insightById,
    employeesById: new Map(employees.map((e) => [e.id, e])),
    unitNameById,
    redactedEmployeeIds,
  };

  const headline = validateHeadline(raw.headline_read, ctx, log);
  const themes = validateThemes(raw.themes, ctx, log);
  const recommendations = validateRecommendations(raw.recommendations, ctx, log);
  const followUps = validateFollowUps(raw.follow_ups, ctx, log);

  // Open questions the model surfaced (single-voice patterns, second-hand claims awaiting
  // confirmation) plus the per-unit ones, kept honest.
  for (const q of Array.isArray(raw.to_confirm_in_readout) ? raw.to_confirm_in_readout : []) {
    if (typeof q === 'string' && q.trim()) {
      log.push({ kind: 'open_question', subject: 'coordinator', reason: q.trim() });
    }
  }
  for (const synthesis of unitSyntheses.values()) {
    for (const q of synthesis.open_questions) {
      log.push({
        kind: 'open_question',
        subject: `unit "${synthesis.unit_name ?? synthesis.unit_id}"`,
        reason: q,
      });
    }
  }

  // Same-team themes render under their unit's hot spot, never in the cross-cutting section
  // (contract open choice 8).
  const hotSpots = computeHotSpots({ units, employees, eligible, insights });
  for (const theme of themes) {
    if (theme.scope !== 'team_local') continue;
    const support = theme.supporting_insight_ids
      .map((id) => insightById.get(id))
      .find((i) => i !== undefined);
    const spot = support ? hotSpots.find((h) => h.unit_id === support.unitId) : undefined;
    if (spot) spot.local_themes.push(theme);
  }

  const windowStart = eligible.map((e) => e.session.started_at).sort()[0];
  const windowEnd = eligible
    .map((e) => e.session.ended_at ?? e.session.started_at)
    .sort()
    .at(-1);
  const methodology = {
    sessions_complete: eligible.filter((e) => e.complete).length,
    sessions_partial: eligible.filter((e) => e.partial).length,
    on_behalf_sessions: eligible.filter((e) => e.employee.leader_track === 'on_behalf').length,
    insights_used: insights.length,
    interview_window: `${isoDay(windowStart)} to ${isoDay(windowEnd)}`,
    interview_model: process.env.INTERVIEW_MODEL ?? 'claude-sonnet-4-6',
    synthesis_model: SYNTHESIS_MODEL,
    rules_version: RULES_VERSION,
    eligibility_note: data.relaxed
      ? 'Includes in-flight sessions admitted by a development-time eligibility override; their findings are confidence-capped at 0.7 and counted as partial.'
      : null,
  };

  const { data: versionRow, error: versionError } = await db
    .from('synthesis')
    .select('version')
    .eq('engagement_id', engagementId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw new Error(`synthesis version lookup failed: ${versionError.message}`);
  const version = (versionRow?.version ?? 0) + 1;

  const { data: inserted, error: insertError } = await db
    .from('synthesis')
    .insert({
      engagement_id: engagementId,
      version,
      themes,
      hot_spots: hotSpots,
      recommendations,
      follow_ups: followUps,
      headline_read: headline,
      methodology,
      validation_log: log,
      model_version: SYNTHESIS_MODEL,
      rules_version: RULES_VERSION,
      input_insight_ids: insights.map((i) => i.row.id),
    })
    .select('id')
    .single();
  if (insertError) throw new Error(`synthesis insert failed: ${insertError.message}`);

  const dropped = log.filter(
    (l) => l.kind === 'theme_dropped' || l.kind === 'theme_demoted'
  ).length;

  return {
    done: true,
    phase: 'written',
    message: `Synthesis v${version} written: ${themes.length} theme(s) promoted, ${dropped} dropped or demoted, ${recommendations.length} recommendation(s).`,
    summariesTotal: eligible.length,
    summariesReady,
    unitsTotal: plan.ordered.length,
    unitsReady,
    usage: tally,
    synthesisId: inserted.id,
    version,
    report: {
      themesPromoted: themes.length,
      themesDroppedOrDemoted: dropped,
      recommendations: recommendations.length,
      followUps: followUps.length,
      hotSpots: hotSpots.length,
      validationLog: log,
    },
  };
}

/** Latest synthesis row for an engagement, or null when none exists yet. Staff (GSAM) view only. */
export async function getLatestSynthesis(db, engagementId) {
  const { data, error } = await db
    .from('synthesis')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`synthesis lookup failed: ${error.message}`);
  return data ?? null;
}

// RenderVerification: { failed: Map<theme_id | rec_id, reason> } — themes hidden at render time when
// re-verification fails (invariant 2); the renderer must not print these.

/**
 * The renderer's independent re-derivation (renderer invariants 1 and 2): re-load the supporting
 * insights with their turns, re-check every quote and re-count distinct voices from scratch. Any
 * theme or recommendation that no longer verifies is refused at render time, regardless of what the
 * stored row claims.
 */
export async function verifyForRender(db, engagementId, row) {
  const data = await loadSynthesisData(db, engagementId, true);
  const insightById = new Map(data.insights.map((i) => [i.row.id, i]));
  const failed = new Map();

  const verifyQuotes = (quotes) =>
    quotes.filter((q) => {
      const insight = insightById.get(q.insight_id);
      return (
        insight !== undefined &&
        insight.quoteEligible &&
        quoteWithinSource(q.quote, insight.row.evidence_quote ?? '')
      );
    });

  const allThemes = [
    ...row.themes,
    ...(row.hot_spots ?? []).flatMap((h) => h.local_themes ?? []),
  ];
  for (const theme of allThemes) {
    const valid = verifyQuotes(theme.evidence_quotes);
    const voices = new Set(
      valid.map((q) => insightById.get(q.insight_id)?.voiceKey).filter(Boolean)
    );
    const firstHand = valid.some((q) => !insightById.get(q.insight_id)?.secondHand);
    if (valid.length < 2 || voices.size < 2 || !firstHand) {
      failed.set(
        theme.theme_id,
        voices.size < 2
          ? 're-derived voice count below 2'
          : !firstHand
            ? 'no first-hand voice on re-verification'
            : 'evidence quotes no longer verify against the stored turns'
      );
    }
  }
  for (const rec of row.recommendations ?? []) {
    const valid = verifyQuotes(rec.evidence_quotes);
    if (valid.length < 1) {
      failed.set(rec.rec_id, 'no evidence quote verifies against the stored turns');
    }
  }
  return { failed };
}
