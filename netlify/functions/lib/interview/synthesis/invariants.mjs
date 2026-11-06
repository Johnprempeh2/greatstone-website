// Port of src/lib/synthesis/invariants.ts @505ba6a.
// Changed: types stripped. Every rule, threshold, stopword and log reason is the source's.
//
// Renderer invariants, enforced in code (Wave 5B).
//
// docs/taxonomy-synthesis-contract.md appendix, restated here because this module is the last line of
// defence. Every rule below is enforced mechanically by validateCoordinatorOutput / its helpers, and
// the deliverable page re-runs the same checks at render time:
//
//  1. No insight without an evidence_quote that string-matches its linked participant Turn.
//     (PreparedInsight.quoteEligible is pre-verified against the stored turns at load; every
//     model-selected quote must in addition be a contiguous span of that evidence_quote.)
//  2. No theme with distinct_voices below 2, re-derived independently here from the quote-backed
//     insights, never taken from the model.
//  3. No theme without at least one first-hand voice.
//  4. No printed claim without a confidence value (theme/recommendation confidence is computed per
//     contract rule 5.3.5; insights with null confidence can never back a quote).
//  5. No on_behalf material rendered without its second-hand marker (second_hand on quotes is forced
//     from the insight row, not trusted).
//  6. No quote attributed by name where attribution_redacted is true (attribution strings are built
//     here from the employee row; redacted people appear as "[role] in [unit]").
//  7. No first-hand and on-behalf hours summed into a single figure, anywhere (structural: hot spots
//     carry two separate fields and the model is never asked for hours arithmetic at all).
//  8. No escalation-type insight rendered without a logged per-item GSA decision (v1 has no decision
//     mechanism, so escalations are excluded from the synthesis input entirely, at load).
//
// Anything that fails is dropped with a logged reason (validation_log on the synthesis row), never
// rendered. Single-voice near-themes are demoted to open questions rather than discarded (contract
// 6.4 last paragraph).

// ─── Quote mechanics (contract 6.1) ──────────────────────────────────────────

export function normalise(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function wordCount(s) {
  const t = normalise(s);
  return t.length === 0 ? 0 : t.split(' ').length;
}

// ─── Fuzzy label similarity (synthesis quality fix, June 2026) ────────────────
//
// The two-voice promotion rule clusters insights by an EXACT normalised label string before counting
// distinct voices. At pilot scale that suppresses real themes: two people describing the same friction
// in different words ("chasing approvals" vs "waiting on sign-off") land in separate single-voice
// clusters and both get demoted, even though together they are a genuine 2-voice theme.
//
// canonicaliseLabels groups near-duplicate labels into clusters using a conservative token-set Jaccard
// similarity (with light stopword removal and plural/verb-suffix stemming) so corroborating voices
// merge. The threshold is deliberately high (LABEL_SIMILARITY_THRESHOLD) so unrelated pains are never
// wrongly merged: it only ever STRENGTHENS corroboration, and the >=2-distinct-voices and first-hand
// requirements downstream are untouched.

/** Conservative token-overlap threshold for treating two labels as the same. */
export const LABEL_SIMILARITY_THRESHOLD = 0.6;

// Function words that carry no topical signal; dropped before comparison so "chasing the approvals"
// and "approval chasing" align on their content words.
const LABEL_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for',
  'from', 'how', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our',
  'over', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'to', 'too', 'up', 'via', 'was', 'were', 'when', 'which',
  'while', 'who', 'with', 'you', 'your',
]);

/**
 * Lightweight stem: lowercase, strip a few common English suffixes, then collapse a trailing 'e' so
 * singular/plural and base/inflected forms converge CONSISTENTLY. Without the final step the suffix
 * rules disagree on related forms — e.g. "invoices" -> "invoic" via the -es rule, but "invoice" kept
 * its 'e' -> "invoice" — which silently broke merges of obvious word-order/plural variants ("invoice
 * keying" vs "keying invoices"). The 'ss' guard stops "process"/"address" losing a letter.
 */
function stemToken(token) {
  let t = token;
  if (t.length > 4 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ies')) t = `${t.slice(0, -3)}y`;
  else if (t.length > 3 && t.endsWith('es')) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('ed')) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  if (t.length > 3 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

/** Content tokens of a label: normalised, punctuation-stripped, de-stopworded, stemmed. */
function labelTokens(label) {
  const words = normalise(label)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !LABEL_STOPWORDS.has(w))
    .map(stemToken)
    .filter((w) => w.length > 0);
  return new Set(words);
}

/**
 * Token-set Jaccard similarity between two labels, in [0, 1]. Returns 0 when either label has no
 * content tokens (so empties never merge into a cluster).
 */
export function labelSimilarity(a, b) {
  const ta = labelTokens(a);
  const tb = labelTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Cluster a set of labels into canonical groups by conservative similarity. Single-link
 * agglomeration: a label joins the first existing cluster whose representative it is similar enough
 * to (>= threshold); otherwise it seeds a new cluster. Order-stable for a given input order, which
 * keeps the chosen canonical key deterministic.
 *
 * Returns a Map from each ORIGINAL normalised label key to a stable cluster id. Callers that already
 * key insights by normalise(label) can look up the cluster id for each insight and group on that
 * instead, merging near-duplicates.
 */
export function canonicaliseLabels(labels, threshold = LABEL_SIMILARITY_THRESHOLD) {
  const clusterByKey = new Map();
  const representatives = [];
  for (const label of labels) {
    const key = normalise(label);
    if (key.length === 0 || clusterByKey.has(key)) continue;
    let assigned = null;
    for (const rep of representatives) {
      // The Jaccard threshold alone is the guard against fabricated corroboration: with threshold
      // >= 0.6, two DIFFERENT labels can only reach it on a single shared token if BOTH are identical
      // single-token labels (1/(1+1-1) = 1.0) — i.e. genuinely the same concept, safe to merge. Any
      // distinct multi-token pair sharing just one word scores <= 0.5 and is rejected. So no extra
      // shared-token count is needed (an earlier >=2 rule only ever blocked safe single-token merges
      // like "reporting" vs "the reporting").
      if (labelSimilarity(label, rep.label) >= threshold) {
        assigned = rep.id;
        break;
      }
    }
    if (assigned === null) {
      assigned = `cluster-${representatives.length}`;
      representatives.push({ id: assigned, label });
    }
    clusterByKey.set(key, assigned);
  }
  return clusterByKey;
}

const ELISION = '[...]';

/** Quote text with elision marker and bracketed interpolations removed. */
function matchableSegments(quote) {
  return quote
    .split(ELISION)
    .map((seg) => normalise(seg.replace(/\[[^\]]*\]/g, ' ')))
    .filter((seg) => seg.length > 0);
}

/**
 * Contiguous-span check: every segment (after removing the single allowed [...] elision and any
 * bracketed referent interpolations) must appear in the source, in order, whitespace-normalised.
 */
export function quoteWithinSource(quote, source) {
  const haystack = normalise(source);
  if (haystack.length === 0) return false;
  const segments = matchableSegments(quote);
  if (segments.length === 0) return false;
  // One elision only: more than two segments means more than one [...].
  if (segments.length > 2) return false;
  let from = 0;
  for (const seg of segments) {
    const idx = haystack.indexOf(seg, from);
    if (idx === -1) return false;
    from = idx + seg.length;
  }
  return true;
}

/** Minimum 30 characters and 7 words; maximum 60 words (contract 6.1). */
export function quoteLengthOk(quote) {
  const stripped = matchableSegments(quote).join(' ');
  if (stripped.length < 30 || wordCount(stripped) < 7) {
    return { ok: false, reason: 'below the 30-character / 7-word minimum' };
  }
  if (wordCount(stripped) > 60) {
    return { ok: false, reason: 'above the 60-word maximum' };
  }
  return { ok: true };
}

// ─── Confidence (contract 5.3.5 / 5.3.6) ─────────────────────────────────────

export function computeGroupConfidence(params) {
  const { confidences, distinctVoices, includesSecondHand, firstHandVoices } = params;
  const mean = confidences.reduce((s, c) => s + c, 0) / confidences.length;
  const bonus = Math.min(0.15, 0.05 * Math.max(0, distinctVoices - 2));
  let c = mean + bonus;
  c = Math.min(c, Math.max(...confidences));
  if (includesSecondHand && firstHandVoices < 2) c = Math.min(c, 0.75);
  return Math.round(c * 100) / 100;
}

/** @returns {'well evidenced' | 'evidenced' | 'indicative'} */
export function bandFor(confidence) {
  if (confidence >= 0.75) return 'well evidenced';
  if (confidence >= 0.5) return 'evidenced';
  return 'indicative';
}

// ─── Attribution (contract 6.3, invariants 5 and 6) ──────────────────────────

// ValidationContext: { insightById: Map<id, PreparedInsight>, employeesById: Map<id, EmployeeRow>,
//   unitNameById: Map<id, string>, redactedEmployeeIds: Set<id> (employees with any
//   attribution_redacted insight: never named) }.

export function roleDescriptor(employee, unitName) {
  const role = employee.role_title?.trim() || 'team member';
  return `A ${role.toLowerCase()} in ${unitName}`;
}

export function buildAttribution(insight, ctx) {
  const redacted =
    insight.row.attribution_redacted ||
    ctx.redactedEmployeeIds.has(insight.employee.id);
  const base = redacted
    ? roleDescriptor(insight.employee, insight.unitName)
    : `${insight.employee.name}, ${insight.employee.role_title ?? 'team member'} (${insight.unitName})`;
  return insight.secondHand
    ? `${base}, via team leader on behalf of ${insight.unitName}`
    : base;
}

// ─── Quote validation ────────────────────────────────────────────────────────

function clamp(s, max) {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Validate one model-supplied quote against the evidence chain. Returns the backing insight on
 * success; logs and returns null on any failure.
 */
function validateQuote(raw, ctx, log, subject) {
  const q = raw ?? {};
  if (typeof q.insight_id !== 'string' || typeof q.quote !== 'string') {
    log.push({ kind: 'quote_dropped', subject, reason: 'quote missing insight_id or text' });
    return null;
  }
  const insight = ctx.insightById.get(q.insight_id);
  if (!insight) {
    log.push({
      kind: 'quote_dropped',
      subject,
      reason: `cites unknown insight ${q.insight_id}`,
    });
    return null;
  }
  if (insight.confidence === null) {
    log.push({
      kind: 'quote_dropped',
      subject,
      reason: `insight ${q.insight_id} carries no confidence value (invariant 4)`,
    });
    return null;
  }
  if (!insight.quoteEligible) {
    log.push({
      kind: 'quote_dropped',
      subject,
      reason: `insight ${q.insight_id} evidence_quote fails contract 6.1 (too short, or not verbatim in any participant turn)`,
    });
    return null;
  }
  const length = quoteLengthOk(q.quote);
  if (!length.ok) {
    log.push({ kind: 'quote_dropped', subject, reason: `quote ${length.reason}` });
    return null;
  }
  if (!quoteWithinSource(q.quote, insight.row.evidence_quote ?? '')) {
    log.push({
      kind: 'quote_dropped',
      subject,
      reason: `quote is not a contiguous span of insight ${q.insight_id}'s evidence_quote`,
    });
    return null;
  }
  return { insight, quote: q.quote.trim() };
}

function toEvidenceQuotes(backed, ctx) {
  return backed.map(({ insight, quote }) => ({
    insight_id: insight.row.id,
    quote,
    attribution: buildAttribution(insight, ctx),
    // Forced from the insight row, never trusted from the model (invariant 5)
    second_hand: insight.secondHand,
  }));
}

function voiceStats(insights) {
  const voices = new Set(insights.map((i) => i.voiceKey));
  const firstHandVoices = new Set(
    insights.filter((i) => !i.secondHand).map((i) => i.voiceKey)
  );
  const units = new Set(insights.map((i) => i.unitId ?? 'unassigned'));
  return {
    voices: voices.size,
    firstHandVoices: firstHandVoices.size,
    units: units.size,
    includesSecondHand: insights.some((i) => i.secondHand),
  };
}

function dedupeByInsight(backed) {
  const seen = new Set();
  return backed.filter(({ insight }) => {
    if (seen.has(insight.row.id)) return false;
    seen.add(insight.row.id);
    return true;
  });
}

// ─── Themes (promotion rule, contract 6.4) ───────────────────────────────────

export function validateThemes(rawThemes, ctx, log) {
  const themes = [];
  const list = Array.isArray(rawThemes) ? rawThemes : [];
  let n = 0;
  for (const raw of list) {
    n += 1;
    const t = raw ?? {};
    const title = clamp(t.title, 90) || `Theme ${n}`;
    const subject = `theme "${title}"`;

    const backed = dedupeByInsight(
      (Array.isArray(t.evidence_quotes) ? t.evidence_quotes : [])
        .map((q) => validateQuote(q, ctx, log, subject))
        .filter((b) => b !== null)
    );
    const support = backed.map((b) => b.insight);
    const stats = voiceStats(support);

    if (backed.length === 0) {
      log.push({ kind: 'theme_dropped', subject, reason: 'no verifiable evidence quotes survived validation' });
      continue;
    }
    if (stats.voices < 2) {
      // Near-theme: one real voice. Demoted to an open question, never rendered as a finding
      // (contract 6.4 last paragraph).
      log.push({
        kind: 'theme_demoted',
        subject,
        reason: 'only one distinct voice behind it; the two-voice promotion rule suppresses it',
      });
      log.push({
        kind: 'open_question',
        subject,
        reason: `Only one voice currently supports "${title}". More conversations would confirm or kill it.`,
      });
      continue;
    }
    if (stats.firstHandVoices < 1) {
      log.push({
        kind: 'theme_dropped',
        subject,
        reason: 'no first-hand voice behind it (on-behalf accounts alone cannot promote a theme)',
      });
      continue;
    }
    if (backed.length < 2) {
      log.push({ kind: 'theme_dropped', subject, reason: 'fewer than two verifiable quotes survived validation' });
      continue;
    }

    const confidence = computeGroupConfidence({
      confidences: support.map((i) => i.confidence),
      distinctVoices: stats.voices,
      includesSecondHand: stats.includesSecondHand,
      firstHandVoices: stats.firstHandVoices,
    });

    themes.push({
      theme_id: typeof t.theme_id === 'string' && t.theme_id ? t.theme_id : `theme-${n}`,
      title,
      statement: clamp(t.statement, 500),
      scope: stats.units >= 2 ? 'cross_team' : 'team_local',
      supporting_insight_ids: support.map((i) => i.row.id),
      distinct_voices: stats.voices,
      includes_second_hand: stats.includesSecondHand,
      confidence,
      evidence_quotes: toEvidenceQuotes(backed, ctx),
    });
  }
  return themes;
}

// ─── Recommendations (automation candidates board) ───────────────────────────

export function validateRecommendations(rawRecs, ctx, log) {
  const recs = [];
  const list = Array.isArray(rawRecs) ? rawRecs : [];
  let n = 0;
  for (const raw of list) {
    n += 1;
    const r = raw ?? {};
    const title = clamp(r.title, 90) || `Recommendation ${n}`;
    const subject = `recommendation "${title}"`;

    const impact = Number(r.impact);
    const feasibility = Number(r.feasibility);
    if (
      !Number.isInteger(impact) || impact < 1 || impact > 5 ||
      !Number.isInteger(feasibility) || feasibility < 1 || feasibility > 5
    ) {
      log.push({ kind: 'recommendation_dropped', subject, reason: 'impact/feasibility not integers in 1 to 5' });
      continue;
    }

    const backed = dedupeByInsight(
      (Array.isArray(r.evidence_quotes) ? r.evidence_quotes : [])
        .map((q) => validateQuote(q, ctx, log, subject))
        .filter((b) => b !== null)
    );
    if (backed.length === 0) {
      log.push({ kind: 'recommendation_dropped', subject, reason: 'no verifiable evidence quote survived validation' });
      continue;
    }
    const support = backed.map((b) => b.insight);
    const stats = voiceStats(support);

    // First-hand quantified hours only; on-behalf hours never blend in (invariant 7). Null when
    // nothing first-hand is quantified.
    const firstHandHours = support
      .filter((i) => !i.secondHand && i.row.time_per_week_hours !== null)
      .reduce((s, i) => s + Number(i.row.time_per_week_hours), 0);

    recs.push({
      rec_id: typeof r.rec_id === 'string' && r.rec_id ? r.rec_id : `rec-${n}`,
      title,
      summary: clamp(r.summary, 400),
      impact,
      feasibility,
      estimated_hours_per_week:
        firstHandHours > 0 ? Math.round(firstHandHours * 10) / 10 : null,
      confidence: computeGroupConfidence({
        confidences: support.map((i) => i.confidence),
        distinctVoices: stats.voices,
        includesSecondHand: stats.includesSecondHand,
        firstHandVoices: stats.firstHandVoices,
      }),
      supporting_insight_ids: support.map((i) => i.row.id),
      evidence_quotes: toEvidenceQuotes(backed, ctx),
      affected_teams: [...new Set(support.map((i) => i.unitName))],
    });
  }
  return recs;
}

// ─── Follow-ups and headline ─────────────────────────────────────────────────

export function validateFollowUps(rawFollowUps, ctx, log) {
  const followUps = [];
  for (const raw of Array.isArray(rawFollowUps) ? rawFollowUps : []) {
    const f = raw ?? {};
    const employeeRef = typeof f.employee_ref === 'string' ? f.employee_ref :
      typeof f.employee_id === 'string' ? f.employee_id : '';
    const employee = ctx.employeesById.get(employeeRef);
    const question = clamp(f.question, 300);
    if (!employee || !question) {
      log.push({
        kind: 'follow_up_dropped',
        subject: `follow-up for "${employeeRef || 'unknown'}"`,
        reason: !employee ? 'names no known participant' : 'carries no question',
      });
      continue;
    }
    const unitName = employee.unit_id
      ? ctx.unitNameById.get(employee.unit_id) ?? 'their team'
      : 'this engagement';
    const redacted = ctx.redactedEmployeeIds.has(employee.id);
    followUps.push({
      employee_id: employee.id,
      display_name: redacted ? roleDescriptor(employee, unitName) : employee.name,
      question,
      reason: clamp(f.reason, 300),
      related_insight_ids: (Array.isArray(f.related_insight_ids) ? f.related_insight_ids : [])
        .filter((id) => typeof id === 'string' && ctx.insightById.has(id)),
    });
  }
  return followUps;
}

export function validateHeadline(rawHeadline, ctx, log) {
  const h = rawHeadline ?? {};
  const text = clamp(h.text, 700);
  const ids = (Array.isArray(h.supporting_insight_ids) ? h.supporting_insight_ids : [])
    .filter((id) => typeof id === 'string' && ctx.insightById.has(id));
  if (!text || ids.length < 3) {
    log.push({
      kind: 'headline_dropped',
      subject: 'headline read',
      reason: !text
        ? 'no headline text produced'
        : `only ${ids.length} verifiable supporting insights (3 required); the deliverable renders the sparse state instead`,
    });
    return null;
  }
  return { text, supporting_insight_ids: ids };
}
