// Port of src/lib/synthesis/rollup.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client. Plan order, fingerprints, prompt
// fills and token ceilings unchanged.
//
// Hierarchical roll-up (docs/scale-notes.md): leaf org units are synthesised from their own member
// summaries; parent units receive their children's unit syntheses plus any summaries of members
// attached directly to the parent node; the engagement coordinator then reads only the top-level
// unit syntheses. Each call sees one node's worth of material, so the context per call stays flat
// regardless of engagement size.
//
// Unit syntheses are cached (kind 'unit') with a fingerprint hashed from the fingerprints of
// everything they were built from, so re-runs only re-pay for subtrees whose interviews changed.

import {
  SYNTHESIS_COORDINATOR_PROMPT,
  SYNTHESIS_UNIT_PROMPT,
  SCORING_SCALES_TEXT,
} from '../prompts/synthesis-prompts.mjs';
import { quoteWithinSource, roleDescriptor } from './invariants.mjs';
import { callSynthesisModel, SYNTHESIS_MODEL } from './model.mjs';
import { hashFingerprint, upsertCache } from './cache.mjs';

// ─── Unit plan ───────────────────────────────────────────────────────────────

// UnitPlanNode: { unit, directSessions (eligible sessions of employees attached directly to this
//   node), children (active child nodes), fingerprint (hash over child fingerprints + direct session
//   fingerprints), depth }
// UnitPlan: { ordered (active units, deepest first), roots (what the coordinator reads), unassigned
//   (eligible sessions of employees with no unit, fed straight upward) }

export function buildUnitPlan(units, eligible) {
  const byUnit = new Map();
  const unassigned = [];
  for (const e of eligible) {
    if (e.employee.unit_id) {
      const list = byUnit.get(e.employee.unit_id) ?? [];
      list.push(e);
      byUnit.set(e.employee.unit_id, list);
    } else {
      unassigned.push(e);
    }
  }

  const nodes = new Map();
  for (const unit of units) {
    nodes.set(unit.id, {
      unit,
      directSessions: byUnit.get(unit.id) ?? [],
      children: [],
      fingerprint: '',
      depth: unit.path.split('.').length,
    });
  }
  for (const node of nodes.values()) {
    if (node.unit.parent_id) {
      nodes.get(node.unit.parent_id)?.children.push(node);
    }
  }

  // A unit is active when its subtree contains at least one eligible session.
  const isActive = (node) =>
    node.directSessions.length > 0 || node.children.some(isActive);

  const active = [...nodes.values()].filter(isActive);
  for (const node of active) {
    node.children = node.children.filter(isActive);
  }
  // Bottom-up: deepest first, stable by path.
  const ordered = [...active].sort(
    (a, b) => b.depth - a.depth || a.unit.path.localeCompare(b.unit.path)
  );
  for (const node of ordered) {
    node.fingerprint = hashFingerprint([
      'unit-v1',
      ...node.children.map((c) => `${c.unit.id}:${c.fingerprint}`),
      ...node.directSessions.map((s) => `${s.session.id}:${s.fingerprint}`),
    ]);
  }
  const roots = active.filter(
    (n) => !n.unit.parent_id || !active.some((a) => a.unit.id === n.unit.parent_id)
  );
  return { ordered, roots, unassigned };
}

// ─── Voice directory (shared by unit and coordinator prompts) ────────────────

export function buildVoiceDirectory(eligible, unitNameById, redactedEmployeeIds) {
  return eligible
    .map((e) => {
      const unitName = e.employee.unit_id
        ? unitNameById.get(e.employee.unit_id) ?? 'Unassigned'
        : 'Unassigned';
      const who = redactedEmployeeIds.has(e.employee.id)
        ? roleDescriptor(e.employee, unitName)
        : `${e.employee.name} (${e.employee.role_title ?? 'team member'})`;
      const provenance =
        e.employee.leader_track === 'on_behalf' ? 'on_behalf (second-hand)' : 'first_hand';
      return `employee_ref ${e.employee.id}: ${who}, unit "${unitName}", ${provenance}${
        e.partial ? ', partial session (confidence capped 0.7)' : ''
      }`;
    })
    .join('\n');
}

// ─── Supporting-quote validation shared by unit syntheses ────────────────────

function cleanSupporting(raw, insightById, subject, log) {
  const out = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const q = entry ?? {};
    const insight =
      typeof q.insight_id === 'string' ? insightById.get(q.insight_id) : undefined;
    if (!insight || typeof q.quote !== 'string') {
      log.push({ kind: 'quote_dropped', subject, reason: 'unit-level quote cites no known insight' });
      continue;
    }
    if (!quoteWithinSource(q.quote, insight.row.evidence_quote ?? '')) {
      log.push({
        kind: 'quote_dropped',
        subject,
        reason: `unit-level quote is not a contiguous span of insight ${insight.row.id}'s evidence_quote`,
      });
      continue;
    }
    const claimed = Number(q.confidence);
    const source = insight.confidence;
    out.push({
      insight_id: insight.row.id,
      employee_ref: insight.employee.id,
      quote: q.quote.trim(),
      second_hand: insight.secondHand, // forced from the row, never trusted
      confidence:
        source === null
          ? undefined
          : Number.isFinite(claimed)
            ? Math.min(claimed, source)
            : source,
    });
  }
  return out;
}

function validateUnitSynthesis(raw, unit, insightById, log) {
  const subject = `unit "${unit.name}"`;
  const themes = (Array.isArray(raw.candidate_themes) ? raw.candidate_themes : [])
    .map((t) => t ?? {})
    .map((t) => ({
      title: typeof t.title === 'string' ? t.title : 'Untitled',
      statement: typeof t.statement === 'string' ? t.statement : '',
      supporting: cleanSupporting(t.supporting, insightById, subject, log),
    }))
    .filter((t) => t.supporting.length > 0);

  const candidates = (Array.isArray(raw.automation_candidates) ? raw.automation_candidates : [])
    .map((c) => c ?? {})
    .map((c) => ({
      title: typeof c.title === 'string' ? c.title : 'Untitled',
      summary: typeof c.summary === 'string' ? c.summary : '',
      impact: Number(c.impact),
      feasibility: Number(c.feasibility),
      supporting: cleanSupporting(c.supporting, insightById, subject, log),
    }))
    .filter((c) => c.supporting.length > 0);

  return {
    unit_id: unit.id,
    unit_name: unit.name,
    candidate_themes: themes,
    automation_candidates: candidates,
    follow_ups: (Array.isArray(raw.follow_ups) ? raw.follow_ups : [])
      .map((f) => f ?? {})
      .filter((f) => typeof f.employee_ref === 'string' && typeof f.question === 'string')
      .map((f) => ({
        employee_ref: f.employee_ref,
        question: f.question,
        reason: typeof f.reason === 'string' ? f.reason : '',
        related_insight_ids: (Array.isArray(f.related_insight_ids) ? f.related_insight_ids : [])
          .filter((id) => typeof id === 'string'),
      })),
    open_questions: (Array.isArray(raw.open_questions) ? raw.open_questions : [])
      .filter((q) => typeof q === 'string'),
  };
}

export async function synthesiseUnit(params) {
  const { db, engagement, node, childSyntheses, memberSummaries, voices, insightById, tally, log } = params;

  const prompt = SYNTHESIS_UNIT_PROMPT.replace(/\{\{UNIT_NAME\}\}/g, node.unit.name)
    .replace('{{VOICES}}', voices)
    .replace(
      '{{CHILD_SYNTHESES}}',
      childSyntheses.length ? JSON.stringify(childSyntheses, null, 1) : '(none)'
    )
    .replace(
      '{{MEMBER_SUMMARIES}}',
      memberSummaries.length
        ? `unit id: ${node.unit.id}\n${JSON.stringify(memberSummaries, null, 1)}`
        : `unit id: ${node.unit.id}\n(none)`
    );

  const raw = await callSynthesisModel({
    db,
    engagementId: engagement.id,
    prompt,
    // Headroom for the deeper per-interview summaries (up to 8 pains + 5 quotes each): a unit of
    // several members would otherwise truncate the JSON mid-string and fail the parse. Output cost is
    // per token generated, so a larger ceiling is free unless the output genuinely needs it.
    maxTokens: 8000,
    tally,
  });
  const synthesis = validateUnitSynthesis(raw, node.unit, insightById, log);
  await upsertCache(
    db,
    engagement.id,
    'unit',
    node.unit.id,
    node.fingerprint,
    synthesis,
    SYNTHESIS_MODEL
  );
  return synthesis;
}

// ─── Engagement coordinator ──────────────────────────────────────────────────

export async function runCoordinator(params) {
  const { db, engagement, topSyntheses, unassignedSummaries, voices, tally } = params;

  const prompt = SYNTHESIS_COORDINATOR_PROMPT.replace('{{CLIENT_NAME}}', engagement.client_name)
    .replace('{{VOICES}}', voices)
    .replace('{{UNIT_SYNTHESES}}', JSON.stringify(topSyntheses, null, 1))
    .replace(
      '{{UNASSIGNED_SUMMARIES}}',
      unassignedSummaries.length ? JSON.stringify(unassignedSummaries, null, 1) : '(none)'
    )
    .replace('{{SCORING_SCALES}}', SCORING_SCALES_TEXT);

  return callSynthesisModel({
    db,
    engagementId: engagement.id,
    prompt,
    // The coordinator aggregates every unit synthesis plus unassigned summaries, so it needs the most
    // headroom of all to avoid a truncated JSON parse failure on a larger engagement.
    maxTokens: 10000,
    tally,
  });
}
