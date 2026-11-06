// Port of src/lib/synthesis/summariser.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client. Quote gate, identity suppression,
// confidence rule and caps unchanged.
//
// Per-interview summariser: one SYNTHESIS_MODEL call per eligible session, over the session's
// validated insight records plus its final taxonomy_state (summaries-only architecture; never the
// full transcript). Output is validated before it is cached: every quote must cite an insight and be
// a contiguous span of that insight's evidence_quote, and confidences may never exceed their source
// insight (lower wins on merge).

import { SYNTHESIS_SUMMARISER_PROMPT } from '../prompts/synthesis-prompts.mjs';
import { normalise, quoteWithinSource, wordCount } from './invariants.mjs';
import { isIdentityToken } from './suppression.mjs';
import { callSynthesisModel, SYNTHESIS_MODEL } from './model.mjs';
import { upsertCache } from './cache.mjs';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * The same substantive-quote gate data.mjs uses for quoteEligible: a quote must be at least 30
 * characters and 7 words. quoteWithinSource alone lets through verbatim fragments like "all of the
 * above" (3 words), which read as evidence but say nothing. Points whose quote fails this gate are
 * rendered WITHOUT a quote rather than with the fragment (see brief.renderSummary).
 */
function quoteSubstantial(quote) {
  return normalise(quote).length >= 30 && wordCount(quote) >= 7;
}

function cleanQuoteItems(raw, insightById, identity, subject, log, max) {
  const items = [];
  for (const entry of asArray(raw)) {
    if (items.length >= max) break;
    const it = entry ?? {};
    const insight =
      typeof it.insight_id === 'string' ? insightById.get(it.insight_id) : undefined;
    if (!insight || typeof it.quote !== 'string' || typeof it.label !== 'string') {
      log.push({
        kind: 'quote_dropped',
        subject,
        reason: `summary item "${String(it.label ?? '?')}" cites no known insight or carries no quote`,
      });
      continue;
    }
    // Suppression rule: a role title, name or tenure fact is context, never a pain or automation
    // opportunity. Drop it before it can reach the summary body or, downstream, the aggregated
    // insight groups and patterns block.
    if (isIdentityToken(it.label, identity) || isIdentityToken(it.quote, identity)) {
      log.push({
        kind: 'note',
        subject,
        reason: `suppressed identity token "${it.label}" from the summary body (a role/name/tenure fact, never an insight)`,
      });
      continue;
    }
    if (!quoteWithinSource(it.quote, insight.row.evidence_quote ?? '')) {
      log.push({
        kind: 'quote_dropped',
        subject,
        reason: `summary quote for "${it.label}" is not a contiguous span of insight ${insight.row.id}'s evidence_quote`,
      });
      continue;
    }
    const sourceConfidence = insight.confidence;
    if (sourceConfidence === null) {
      log.push({
        kind: 'quote_dropped',
        subject,
        reason: `summary item "${it.label}" cites insight ${insight.row.id} which has no confidence value`,
      });
      continue;
    }
    const claimed = Number(it.confidence);
    // Substantive-quote gate: keep the point either way, but only attach the quote when it clears the
    // 30-char / 7-word floor. A failing quote becomes empty so the renderer prints the point without a
    // fragment.
    const trimmedQuote = it.quote.trim();
    const keepQuote = quoteSubstantial(trimmedQuote);
    if (!keepQuote) {
      log.push({
        kind: 'note',
        subject,
        reason: `quote for "${it.label}" is below the 30-character / 7-word floor; the point is kept without a quote`,
      });
    }
    items.push({
      label: it.label,
      detail: typeof it.detail === 'string' ? it.detail : undefined,
      impact: typeof it.impact === 'string' ? it.impact : undefined,
      frequency: typeof it.frequency === 'string' ? it.frequency : null,
      linked_task: typeof it.linked_task === 'string' ? it.linked_task : null,
      // Time figures only ever come from the insight record, never the model
      time_per_week_hours:
        insight.row.time_per_week_hours !== null
          ? Number(insight.row.time_per_week_hours)
          : null,
      insight_id: insight.row.id,
      quote: keepQuote ? trimmedQuote : '',
      // Lower wins; the summariser can never raise a confidence it received
      confidence: Number.isFinite(claimed)
        ? Math.min(claimed, sourceConfidence)
        : sourceConfidence,
    });
  }
  return items;
}

function validateSummary(raw, elig, insightsForSession, log) {
  const insightById = new Map(insightsForSession.map((i) => [i.row.id, i]));
  const subject = `summary for session ${elig.session.id}`;
  const identity = { roleTitle: elig.employee.role_title, name: elig.employee.name };
  const secondHand =
    elig.employee.leader_track === 'on_behalf' ||
    insightsForSession.some((i) => i.secondHand);

  const notable = [];
  for (const entry of asArray(raw.notable_quotes)) {
    if (notable.length >= 5) break;
    const it = entry ?? {};
    const insight =
      typeof it.insight_id === 'string' ? insightById.get(it.insight_id) : undefined;
    if (typeof it.quote === 'string' && isIdentityToken(it.quote, identity)) {
      log.push({
        kind: 'note',
        subject,
        reason: 'suppressed an identity quote from notable_quotes (a role/name/tenure fact)',
      });
      continue;
    }
    if (
      insight &&
      typeof it.quote === 'string' &&
      quoteWithinSource(it.quote, insight.row.evidence_quote ?? '') &&
      quoteSubstantial(it.quote.trim())
    ) {
      notable.push({ insight_id: insight.row.id, quote: it.quote.trim() });
    } else {
      log.push({
        kind: 'quote_dropped',
        subject,
        reason:
          typeof it.quote === 'string' && insight && !quoteSubstantial(it.quote.trim())
            ? 'notable quote below the 30-character / 7-word floor (a fragment, not evidence)'
            : 'notable quote failed verbatim verification',
      });
    }
  }

  // Recompute the quantified total from the surviving items; the model's arithmetic is never trusted.
  const pains = cleanQuoteItems(raw.top_pains, insightById, identity, subject, log, 8);
  const quantified = pains
    .map((p) => p.time_per_week_hours)
    .filter((h) => h !== null);
  const total = quantified.length
    ? Math.round(quantified.reduce((s, h) => s + h, 0) * 10) / 10
    : null;

  const signal = Number(raw.follow_up_signal);

  return {
    employee_ref: elig.employee.id,
    role: typeof raw.role === 'string' ? raw.role : elig.employee.role_title ?? 'team member',
    second_hand: secondHand,
    top_pains: pains,
    time_costs_total_hours_per_week: total,
    automation_candidates: cleanQuoteItems(raw.automation_candidates, insightById, identity, subject, log, 6),
    notable_quotes: notable,
    referrals: asArray(raw.referrals)
      .map((r) => r ?? {})
      .filter((r) => typeof r.name_or_role === 'string')
      .map((r) => ({
        name_or_role: r.name_or_role,
        why: typeof r.why === 'string' ? r.why : '',
      })),
    uncertain: asArray(raw.uncertain).filter((u) => typeof u === 'string').slice(0, 8),
    follow_up_signal: Number.isFinite(signal) ? Math.min(1, Math.max(0, signal)) : 0.5,
  };
}

export async function summariseSession(params) {
  const { db, engagementId, elig, insightsForSession, unitName, tally, log } = params;

  const insightsJson = JSON.stringify(
    {
      participant_id: elig.employee.id,
      insights: insightsForSession.map((i) => ({
        id: i.row.id,
        type: i.row.type,
        label: i.row.label,
        evidence_quote: i.row.evidence_quote,
        time_per_week_hours: i.row.time_per_week_hours,
        confidence: i.confidence,
        second_hand: i.secondHand,
      })),
    },
    null,
    1
  );

  const anonymised = insightsForSession.some((i) => i.row.attribution_redacted);
  const prompt = SYNTHESIS_SUMMARISER_PROMPT.replace(
    '{{ROLE}}',
    elig.employee.role_title ?? 'team member'
  )
    .replace('{{UNIT}}', unitName)
    .replace('{{ON_BEHALF}}', String(elig.employee.leader_track === 'on_behalf'))
    .replace('{{ATTRIBUTION}}', anonymised ? 'anonymised' : 'named')
    .replace('{{INSIGHTS}}', insightsJson)
    .replace('{{TAXONOMY_STATE}}', JSON.stringify(elig.session.taxonomy_state ?? {}));

  const raw = await callSynthesisModel({
    db,
    engagementId,
    prompt,
    // Room for a maximally rich summary (up to 8 pains with multi-sentence detail + 5 notable
    // quotes) without truncating the JSON.
    maxTokens: 4500,
    tally,
  });
  const summary = validateSummary(raw, elig, insightsForSession, log);
  await upsertCache(
    db,
    engagementId,
    'session',
    elig.session.id,
    elig.fingerprint,
    summary,
    SYNTHESIS_MODEL
  );
  return summary;
}
