// Port of src/lib/synthesis/brief.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client; the optional Notion write is not
// available on the site (see the Port: note at writeToNotion). Aggregation, fuzzy clustering, the
// two-voice rule and every line of markdown are the source's.
//
// Engagement synthesis brief — the handoff pack (product decision, June 2026).
//
// The app does NOT autonomously write the final, client-facing engagement read-out. That is
// partner-grade work Greatstone does with its own Claude instance. The app's job is to produce
// EXCELLENT STRUCTURED INPUT for that: complete, well-organised, honest, with the roster as context
// kept strictly separate from the evidence, and every aggregated finding traceable to a verbatim
// quote. This module builds that brief as a single markdown document.
//
// It is deterministic and (almost) free: it reads the already-cached per-interview summaries and the
// prepared, capped, turn-verified insights, and aggregates them in code. It runs the synthesis step
// first only to make sure the per-person summaries exist and are current; on an unchanged engagement
// that is cache hits plus, at most, the coordinator call. No new model call is made by the
// aggregation itself.

import { loadSynthesisData } from './data.mjs';
import { loadCache } from './cache.mjs';
import { runSynthesisStep, getLatestSynthesis } from './pipeline.mjs';
import { SYNTHESIS_MODEL } from './model.mjs';
import { isIdentityToken } from './suppression.mjs';
import {
  buildAttribution,
  canonicaliseLabels,
  normalise,
} from './invariants.mjs';
import { RULES_VERSION } from './types.mjs';

// ─── Aggregation shapes ──────────────────────────────────────────────────────

// InsightGroupRow (a taxonomy-type group as it appears in the brief): { label, voices (distinct voices
//   behind this label cluster), hours (sum of first-hand quantified hours, or null), includesSecondHand,
//   quotes (up to 3 supporting verbatim quotes with attribution) }
// PatternRow (a candidate cross-cutting pattern with honest promotion status): { title, voices,
//   firstHandVoices, includesSecondHand, status: 'promoted' | 'needs corroboration' (two-voice rule:
//   promoted needs >=2 distinct voices, >=1 first-hand), hours, quotes }

const TAXONOMY_GROUPS = [
  { key: 'pains', heading: 'Pains', types: ['pain'] },
  // 'task' insights are activities people described; most carry no hours, so grouping them all
  // under "Time costs" overstated the quantified picture.
  { key: 'tasks', heading: 'Tasks and activities', types: ['task'] },
  // The true time-cost view: only insights that actually carry a weekly hours figure, drawn from
  // across the quantifiable taxonomy types.
  {
    key: 'time-costs',
    heading: 'Time costs',
    types: ['task', 'pain', 'automation_candidate', 'tooling_gap', 'dependency'],
    filter: (i) => i.row.time_per_week_hours != null,
  },
  { key: 'automation', heading: 'Automation candidates', types: ['automation_candidate'] },
  { key: 'tooling', heading: 'Tooling gaps', types: ['tooling_gap'] },
  { key: 'dependencies', heading: 'Dependencies', types: ['dependency'] },
];

// BriefResult: { markdown, version, usage: { calls, inputTokens, outputTokens, costPence },
//   notionPageId, notionPageUrl, stats: { interviewsIncluded, rosterSize, insightGroups,
//   patternsPromoted, patternsNeedingCorroboration } }

// ─── Small helpers ───────────────────────────────────────────────────────────

function hoursLabel(h) {
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h/week`;
}

function roundHours(h) {
  return Math.round(h * 10) / 10;
}

/** Distinct-voice count from a set of prepared insights. */
function voiceCount(insights) {
  return new Set(insights.map((i) => i.voiceKey)).size;
}

function firstHandVoiceCount(insights) {
  return new Set(insights.filter((i) => !i.secondHand).map((i) => i.voiceKey)).size;
}

/** First-hand quantified hours across a set of insights, or null. */
function firstHandHours(insights) {
  const hrs = insights
    .filter((i) => !i.secondHand && i.row.time_per_week_hours !== null)
    .reduce((s, i) => s + Number(i.row.time_per_week_hours), 0);
  return hrs > 0 ? roundHours(hrs) : null;
}

/**
 * Up to `max` quote-eligible verbatim quotes from a set of insights, each with its
 * (redaction-honouring) attribution. Identity-token labels never reach here because the groups are
 * filtered before this runs.
 */
function quotesFor(insights, ctx, max) {
  const out = [];
  const seen = new Set();
  for (const i of insights) {
    if (out.length >= max) break;
    if (!i.quoteEligible || !i.row.evidence_quote) continue;
    const key = normalise(i.row.evidence_quote);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      quote: i.row.evidence_quote.trim(),
      attribution: buildAttribution(i, ctx),
      secondHand: i.secondHand,
    });
  }
  return out;
}

/**
 * Cluster insights by FUZZY label similarity rather than by an exact normalised-string match. Two
 * people describing the same friction in different words ("chasing approvals" vs "waiting on
 * sign-off") are merged into one cluster so they corroborate as a single multi-voice theme instead of
 * both being suppressed as single voices. The similarity threshold is deliberately conservative (see
 * invariants.canonicaliseLabels), so unrelated pains are never wrongly merged. Identity tokens are
 * dropped before clustering.
 *
 * Returns the clusters in stable insertion order; callers pick a display label and compute voice
 * counts from each cluster's members.
 */
function clusterByFuzzyLabel(insights) {
  // Note (unchanged from source): the employee row is passed as knownIdentity; its keys are
  // role_title/name, so the name rule applies and the own-role-title rule does not. Kept as-is.
  const kept = insights.filter((i) => !isIdentityToken(i.row.label, i.employee));
  const clusterIdByLabelKey = canonicaliseLabels(kept.map((i) => i.row.label));
  const clusters = new Map();
  for (const i of kept) {
    const clusterId = clusterIdByLabelKey.get(normalise(i.row.label));
    if (clusterId === undefined) continue; // empty/identity label
    const list = clusters.get(clusterId) ?? [];
    list.push(i);
    clusters.set(clusterId, list);
  }
  return [...clusters.values()];
}

/**
 * Cluster insights of one taxonomy group by FUZZY label similarity so the same friction described by
 * several people lands in one row with a real voice count, rather than N near-duplicate rows.
 * Identity tokens are dropped.
 */
function aggregateGroup(insights, ctx) {
  const clusterLists = clusterByFuzzyLabel(insights);
  const rows = [];
  for (const list of clusterLists) {
    // Prefer the highest-confidence member's label as the cluster's display label.
    const lead = [...list].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
    )[0];
    rows.push({
      label: lead.row.label,
      voices: voiceCount(list),
      hours: firstHandHours(list),
      includesSecondHand: list.some((i) => i.secondHand),
      quotes: quotesFor(list, ctx, 3),
    });
  }
  // Most-corroborated, then most-costly, first.
  return rows.sort(
    (a, b) => b.voices - a.voices || (b.hours ?? 0) - (a.hours ?? 0)
  );
}

/**
 * Candidate cross-cutting patterns: label clusters spanning two or more distinct voices are
 * promotable; single-voice clusters are flagged "needs corroboration" per the two-voice rule
 * (contract 6.4). Honest by construction — the app never pretends a single voice is a pattern.
 */
function candidatePatterns(insights, ctx) {
  // Only pains, tooling gaps, dependencies and automation candidates form patterns worth promoting;
  // bare task descriptions do not. Cluster by FUZZY label similarity so two voices on the same
  // underlying pain corroborate as a single multi-voice pattern instead of being split into two
  // single-voice clusters (both of which the two-voice rule would otherwise suppress).
  const patternable = insights.filter((i) =>
    ['pain', 'tooling_gap', 'dependency', 'automation_candidate'].includes(i.row.type)
  );
  const clusterLists = clusterByFuzzyLabel(patternable);
  const rows = [];
  for (const list of clusterLists) {
    const voices = voiceCount(list);
    const firstHand = firstHandVoiceCount(list);
    const lead = [...list].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    const promoted = voices >= 2 && firstHand >= 1;
    rows.push({
      title: lead.row.label,
      voices,
      firstHandVoices: firstHand,
      includesSecondHand: list.some((i) => i.secondHand),
      status: promoted ? 'promoted' : 'needs corroboration',
      hours: firstHandHours(list),
      quotes: quotesFor(list, ctx, 3),
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.status === 'promoted') - Number(a.status === 'promoted') ||
      b.voices - a.voices
  );
}

// ─── Markdown rendering ──────────────────────────────────────────────────────

function md(parts) {
  return parts.join('\n');
}

function unitOf(employee, unitNameById) {
  return employee.unit_id ? unitNameById.get(employee.unit_id) ?? 'Unassigned' : 'Unassigned';
}

function renderSummary(summary, employee, unitNameById) {
  const lines = [];
  const unit = unitOf(employee, unitNameById);
  lines.push(`#### ${employee.name}, ${summary.role || 'team member'} (${unit})`);
  if (summary.second_hand) {
    lines.push('_Second-hand account: this person spoke on behalf of their team._');
  }
  lines.push('');

  if (summary.top_pains.length > 0) {
    lines.push('**Pains and friction**');
    for (const p of summary.top_pains) {
      const hrs = p.time_per_week_hours != null ? ` (${hoursLabel(p.time_per_week_hours)})` : '';
      const detail = p.detail ? `: ${p.detail}` : '';
      lines.push(`- ${p.label}${hrs}${detail}`);
      // Quote omitted when it failed the substantive-quote gate (summariser.mjs).
      if (p.quote.trim()) lines.push(`  > "${p.quote}"`);
    }
    if (summary.time_costs_total_hours_per_week != null) {
      lines.push('');
      lines.push(
        `_Quantified time cost from this interview: ${hoursLabel(summary.time_costs_total_hours_per_week)}._`
      );
    }
    lines.push('');
  }

  if (summary.automation_candidates.length > 0) {
    lines.push('**Automation opportunities they surfaced**');
    for (const a of summary.automation_candidates) {
      const impact = a.impact ? `. So what: ${a.impact}` : '';
      lines.push(`- ${a.label}${impact}`);
      // Quote omitted when it failed the substantive-quote gate (summariser.mjs).
      if (a.quote.trim()) lines.push(`  > "${a.quote}"`);
    }
    lines.push('');
  }

  if (summary.notable_quotes.length > 0) {
    lines.push('**Notable quotes**');
    for (const q of summary.notable_quotes) lines.push(`- "${q.quote}"`);
    lines.push('');
  }

  if (summary.uncertain.length > 0) {
    lines.push('**Hinted at, not established**');
    for (const u of summary.uncertain) lines.push(`- ${u}`);
    lines.push('');
  }

  return md(lines);
}

function renderGroup(heading, rows) {
  if (rows.length === 0) {
    return md([`### ${heading}`, '', '_Nothing in this category yet from the interviews held._', '']);
  }
  const lines = [`### ${heading}`, ''];
  for (const r of rows) {
    const bits = [`**${r.label}**`, `${r.voices} voice${r.voices === 1 ? '' : 's'}`];
    if (r.hours != null) bits.push(`~${hoursLabel(r.hours)} first-hand`);
    if (r.includesSecondHand) bits.push('includes second-hand');
    lines.push(`- ${bits.join(' · ')}`);
    for (const q of r.quotes) {
      const sh = q.secondHand ? ', second-hand' : '';
      lines.push(`  > "${q.quote}" (${q.attribution}${sh})`);
    }
  }
  lines.push('');
  return md(lines);
}

function renderPatterns(rows) {
  const lines = ['## Candidate cross-cutting patterns', ''];
  lines.push(
    'Each candidate is flagged with its voice count and an honest promotion status. ' +
      'A pattern is **promoted** only when at least two distinct people raised it independently, ' +
      'with at least one first-hand voice (the two-voice rule). Everything else is **needs ' +
      'corroboration**: a real signal that one more conversation would confirm or kill it. ' +
      'The partner decides what to elevate; the app does not pretend a single voice is a pattern.'
  );
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No candidate patterns surfaced yet._');
    lines.push('');
    return md(lines);
  }
  for (const r of rows) {
    const tag = r.status === 'promoted' ? '`PROMOTED`' : '`NEEDS CORROBORATION`';
    const bits = [
      `${r.voices} voice${r.voices === 1 ? '' : 's'}`,
      `${r.firstHandVoices} first-hand`,
    ];
    if (r.hours != null) bits.push(`~${hoursLabel(r.hours)}`);
    if (r.includesSecondHand) bits.push('includes second-hand');
    lines.push(`### ${tag} ${r.title}`);
    lines.push(`${bits.join(' · ')}`);
    for (const q of r.quotes) {
      const sh = q.secondHand ? ', second-hand' : '';
      lines.push(`> "${q.quote}" (${q.attribution}${sh})`);
    }
    lines.push('');
  }
  return md(lines);
}

const PARTNER_PROMPT_BLOCK = md([
  '## For the partner: where to take this further',
  '',
  'This brief is structured input, not the client artefact. Using the evidence above, draft the',
  'client read-out with your own judgement:',
  '',
  '- **Headline read**: the one pattern that matters most, stated plainly and honestly about coverage.',
  '- **Hot-spot heatmap**: units ranked by first-hand hours lost; keep first-hand and on-behalf figures separate.',
  '- **Automation board**: score each candidate on impact x feasibility and sequence them.',
  '- **Named follow-ups**: who to talk to next and the exact question to ask.',
  '',
  'Apply judgement; do not invent beyond the evidence. Where a pattern is marked "needs',
  'corroboration", treat it as a lead to confirm, not a finding. Every quote here is verbatim and',
  'traceable; keep it that way in the deliverable.',
]);

// ─── Brief builder ───────────────────────────────────────────────────────────

export async function buildSynthesisBrief(db, engagementId, opts = {}) {
  // Port: the site never calls Notion or GSAM (docs/INTERVIEW-ENGINE.md: GSAM reads through the
  // bridge), and the source's writeBriefToNotion (src/lib/notion-brief.ts) is not ported. A
  // writeToNotion request is refused here, before any model spend, rather than silently ignored.
  if (opts.writeToNotion) {
    throw new Error('buildSynthesisBrief: writeToNotion is not available on the website; GSAM reads the brief through the bridge');
  }

  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, costPence: 0 };

  // Make sure the per-interview summaries exist and are current. On an unchanged engagement this is
  // cache hits; it never re-pays for unchanged interviews. We let it run to completion so cached
  // summaries are fresh.
  let guard = 0;
  let step = await runSynthesisStep(db, engagementId, {
    maxModelCalls: opts.stepOptions?.maxModelCalls ?? 1000,
    relaxEligibility: opts.stepOptions?.relaxEligibility ?? false,
  });
  usage.calls += step.usage.calls;
  usage.inputTokens += step.usage.inputTokens;
  usage.outputTokens += step.usage.outputTokens;
  usage.costPence += step.usage.costPence;
  while (!step.done && guard < 200) {
    guard += 1;
    step = await runSynthesisStep(db, engagementId, {
      maxModelCalls: opts.stepOptions?.maxModelCalls ?? 1000,
      relaxEligibility: opts.stepOptions?.relaxEligibility ?? false,
    });
    usage.calls += step.usage.calls;
    usage.inputTokens += step.usage.inputTokens;
    usage.outputTokens += step.usage.outputTokens;
    usage.costPence += step.usage.costPence;
  }

  const data = await loadSynthesisData(
    db,
    engagementId,
    opts.stepOptions?.relaxEligibility ?? false
  );
  const { engagement, units, employees, eligible, insights } = data;
  const unitNameById = new Map(units.map((u) => [u.id, u.name]));
  const redactedEmployeeIds = new Set(
    insights.filter((i) => i.row.attribution_redacted).map((i) => i.employee.id)
  );
  const ctx = {
    insightById: new Map(insights.map((i) => [i.row.id, i])),
    employeesById: new Map(employees.map((e) => [e.id, e])),
    unitNameById,
    redactedEmployeeIds,
  };

  // Cached per-interview summaries (the improved, identity-suppressed ones).
  const sessionCache = await loadCache(db, engagementId, 'session');
  const summariesByEmployee = new Map();
  for (const elig of eligible) {
    const cached = sessionCache.get(elig.session.id);
    if (cached && cached.fingerprint === elig.fingerprint) {
      summariesByEmployee.set(elig.employee.id, {
        summary: cached.payload,
        employee: elig.employee,
      });
    }
  }

  // Latest synthesis row, for the coverage/methodology stats and open questions.
  const latest = await getLatestSynthesis(db, engagementId);
  const methodology = latest?.methodology ?? null;
  const completionRates = eligible.map((e) => e.session.completion_score).filter((s) => s !== null);
  const avgCompletion =
    completionRates.length > 0
      ? Math.round((completionRates.reduce((s, c) => s + c, 0) / completionRates.length) * 100)
      : null;

  // Coverage stats.
  const rosterSize = employees.length;
  const completed = employees.filter((e) => e.status === 'completed').length;
  const interviewsIncluded = eligible.length;
  const partials = eligible.filter((e) => e.partial).length;

  // Aggregations grouped by taxonomy type.
  const groupBlocks = [];
  let groupCount = 0;
  for (const g of TAXONOMY_GROUPS) {
    const rows = aggregateGroup(
      insights.filter(
        (i) => g.types.includes(i.row.type) && (g.filter ? g.filter(i) : true)
      ),
      ctx
    );
    groupCount += rows.length;
    groupBlocks.push(renderGroup(g.heading, rows));
  }

  const patterns = candidatePatterns(insights, ctx);
  const patternsPromoted = patterns.filter((p) => p.status === 'promoted').length;
  const patternsNeeding = patterns.filter((p) => p.status === 'needs corroboration').length;

  // Dedupe open questions by normalised reason: the same question is pushed from both the
  // coordinator and each unit roll-up, so without this the brief renders the same line several times.
  // First occurrence wins (preserves order).
  const openQuestions = [];
  {
    const seenQuestions = new Set();
    for (const l of latest?.validation_log ?? []) {
      if (l.kind !== 'open_question') continue;
      const key = normalise(l.reason);
      if (key.length === 0 || seenQuestions.has(key)) continue;
      seenQuestions.add(key);
      openQuestions.push(l.reason);
    }
  }

  // Brief version: next number after any existing brief page count is tracked via the synthesis row
  // version, so the brief carries the same v{n} the run wrote, keeping the two artefacts aligned.
  const version = latest?.version ?? step.version ?? 1;

  const generated = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // ── Assemble the markdown ──────────────────────────────────────────────────
  const doc = [];
  doc.push(`# Engagement synthesis brief · v${version}`);
  doc.push(`**${engagement.client_name}** · generated ${generated}`);
  doc.push('');
  doc.push(
    '> This is a structured handoff pack, not the client deliverable. It is input for a Greatstone ' +
      'partner (working with their own Claude instance) to write the final read-out. The app aggregates ' +
      'and structures; the partner synthesises the insight.'
  );
  doc.push('');

  doc.push('## Engagement and coverage');
  doc.push('');
  doc.push(`- Interviews included in this brief: **${interviewsIncluded}** (of ${rosterSize} on the roster, ${completed} marked completed)`);
  doc.push(`- Partial sessions included: **${partials}** (completed pain mapping, never read back; findings capped at 0.7 confidence)`);
  if (avgCompletion != null) doc.push(`- Mean interview completion score: **${avgCompletion}%**`);
  doc.push(
    `- Partial-session policy: a session enters this brief once it has ended having completed pain mapping; ` +
      `its findings are confidence-capped and counted as partial, never as a settled finding.`
  );
  doc.push(`- Rules version: **${methodology?.rules_version ?? RULES_VERSION}**`);
  doc.push(
    `- Clustering: near-duplicate labels are merged by conservative fuzzy similarity before voice counting, ` +
      `so two people describing the same friction in different words corroborate as one multi-voice theme. ` +
      `The two-voice and first-hand promotion rules are unchanged.`
  );
  doc.push(`- Interview model: ${methodology?.interview_model ?? process.env.INTERVIEW_MODEL ?? 'n/a'} · synthesis model: ${methodology?.synthesis_model ?? SYNTHESIS_MODEL}`);
  if (methodology?.eligibility_note) doc.push(`- Note: ${methodology.eligibility_note}`);
  doc.push('');

  // Roster as CONTEXT, clearly separated from insights.
  doc.push('## Roster (context only, not insights)');
  doc.push('');
  doc.push(
    'Names, roles and units are metadata about who was interviewed. A role title is never a finding ' +
      'or a theme keyword anywhere in this brief.'
  );
  doc.push('');
  doc.push('| Name | Role | Unit | Status |');
  doc.push('| --- | --- | --- | --- |');
  for (const e of employees) {
    doc.push(
      `| ${e.name} | ${e.role_title ?? '-'} | ${unitOf(e, unitNameById)} | ${e.status} |`
    );
  }
  doc.push('');

  // Per-person summaries.
  doc.push('## Per-interview summaries');
  doc.push('');
  if (summariesByEmployee.size === 0) {
    doc.push('_No completed interviews are summarised yet._');
    doc.push('');
  } else {
    for (const { summary, employee } of summariesByEmployee.values()) {
      doc.push(renderSummary(summary, employee, unitNameById));
    }
  }

  // Aggregated insights by taxonomy type.
  doc.push('## Aggregated insights by type');
  doc.push('');
  doc.push(
    'Findings clustered across interviews, with the distinct-voice count, quantified first-hand ' +
      'hours where present, and the supporting verbatim quotes. Role and identity tokens are excluded.'
  );
  doc.push('');
  for (const block of groupBlocks) doc.push(block);

  // Candidate cross-cutting patterns.
  doc.push(renderPatterns(patterns));

  // Open questions.
  doc.push('## Open questions');
  doc.push('');
  if (openQuestions.length === 0) {
    doc.push('_None flagged by the latest run._');
  } else {
    for (const q of openQuestions) doc.push(`- ${q}`);
  }
  doc.push('');

  // Partner prompt block.
  doc.push(PARTNER_PROMPT_BLOCK);
  doc.push('');

  const markdown = md(doc);

  // Optionally write to Notion.
  // Port: not available on the site (refused at the top of buildSynthesisBrief); always null.
  const notionPageId = null;
  const notionPageUrl = null;

  return {
    markdown,
    version,
    usage,
    notionPageId,
    notionPageUrl,
    stats: {
      interviewsIncluded,
      rosterSize,
      insightGroups: groupCount,
      patternsPromoted,
      patternsNeedingCorroboration: patternsNeeding,
    },
  };
}
