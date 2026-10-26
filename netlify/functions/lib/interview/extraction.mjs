// Port of SOURCE src/lib/extraction.ts @505ba6a. Validation rules, retry, token caps and model default
// unchanged. Port: TypeScript types stripped, `import 'server-only'` removed. Additive test seams, marked
// below: parseAndValidate / quoteIsVerbatim / isIdentityOnlyLabel are exported, and
// setExtractionClient() lets tests swap the Anthropic client. No signature of a source export changed.

/**
 * Per-turn extraction: runs EXTRACTION_MODEL (default claude-haiku-4-5)
 * against the latest exchange with docs/prompts/extraction-prompt.md
 * (runtime copy in src/lib/prompts/extraction-prompt.ts), validates the
 * strict JSON, ratchets taxonomy_state slots, and returns insight rows ready
 * to insert.
 *
 * Validation per the docs prompt's runtime section: output must parse and
 * fit the schema; every evidence_quote must be a verbatim substring of the
 * employee message (else the insight is DROPPED with a logged warning, never
 * patched); confidences must sit in [0,1] and anything below 0.3 is dropped.
 * On a malformed response we retry once with the validation error appended;
 * on second failure the turn is skipped rather than corrupting state.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  EXTRACTION_PROMPT,
  EXTRACTION_SLOT_ADDENDUM,
} from './prompts/extraction-prompt.mjs';

export const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL ?? 'claude-haiku-4-5';

// ─── Output shape ────────────────────────────────────────────────────────────

/**
 * @typedef {{ type: 'task' | 'pain' | 'automation_candidate' | 'tooling_gap' | 'dependency' | 'time_cost' | 'referral',
 *   label: string, evidence_quote: string, implication: string | null, time_per_week_hours: number | null,
 *   confidence: number, second_hand: boolean }} ExtractionInsight
 */
/**
 * @typedef {{ taxonomy_updates: { role: string | null, tasks_add: any[], pains_add: any[],
 *   automation_candidates_add: any[], time_costs_add: any[] }, insights: ExtractionInsight[],
 *   special_category_detected: boolean, consent_updates: { attribution: 'named' | 'anonymised' | null,
 *   memory_opt_in: boolean | null }, slot_updates: Record<string, Record<string, string>>,
 *   usage: { inputTokens: number, outputTokens: number } }} ExtractionResult
 */

/**
 * Insight types the DB enum supports. The extraction prompt may also emit
 * 'tooling_gap', 'dependency', 'time_cost' and 'referral'; those carry signal
 * for taxonomy_state and synthesis but have no insight_type enum value in
 * 0001_init.sql, so they are not persisted as Insight rows in Wave 2 (the data
 * still lands in extracted_fields on the turn). The synthesis contract's
 * six-type enum (section 2.1) is the target once the migration grows; until
 * then these pass through to the turn audit. Revisit if the enum grows.
 */
const PERSISTABLE_INSIGHT_TYPES = new Set([
  'task',
  'pain',
  'automation_candidate',
  'escalation',
]);

/** @param {ExtractionInsight[]} insights */
export function persistableInsights(insights) {
  return insights.filter((i) => PERSISTABLE_INSIGHT_TYPES.has(i.type));
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_SLOT_STATUSES = new Set(['empty', 'partial', 'filled']);
const VALID_PHASES = new Set([
  'warm_up',
  'day_in_the_life',
  'pain_mapping',
  'automation_surfacing',
  'sign_off',
]);

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Whitespace-tolerant verbatim check (mirrors the renderer's rule in the
 * contract, section 6.1): the quote must appear contiguously in the employee
 * message after collapsing runs of whitespace.
 */
// Port: exported (was module-private) so the verbatim rule is unit tested directly.
export function quoteIsVerbatim(quote, employeeMessage) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(employeeMessage).includes(norm(quote));
}

/**
 * Defensive backstop for extraction-prompt rules 2a/2b (an insight is a
 * substantive finding, never an identity or context label). The "DX lead as
 * keyword" bug was a role title leaking into the insights array as a label.
 * The prompt now forbids this; this guard catches anything that slips through
 * so a job title, a person's name or a bare team/tool name can never become an
 * insight label. It is deliberately narrow: it fires only when the WHOLE label
 * is an identity/context fragment with no finding-word attached, so a real
 * finding that merely contains a role or tool name (e.g. "Manual re-keying of
 * invoices into Sage") is never touched.
 */
const IDENTITY_LABEL_RE =
  /^(?:the\s+|a\s+|an\s+|our\s+|my\s+)?(?:[a-z]+\s+){0,3}(?:lead|leader|manager|director|officer|analyst|engineer|developer|administrator|admin|assistant|associate|clerk|coordinator|controller|executive|head|specialist|consultant|advisor|adviser|technician|operative|operator|supervisor|representative|rep|agent|architect|designer|owner|partner|intern|team|department|dept|division|unit|squad|pod|function|role|title)s?$/i;

// Port: exported (was module-private) for unit tests.
export function isIdentityOnlyLabel(label) {
  const trimmed = label.trim();
  // Very short labels that are just a name or a token (e.g. "DX lead",
  // "Priya", "platform team") carry no finding. Real findings are phrases.
  if (trimmed.length === 0) return true;
  return IDENTITY_LABEL_RE.test(trimmed);
}

// Port: exported (was module-private) for unit tests.
/** @returns {Omit<ExtractionResult, 'usage'>} */
export function parseAndValidate(raw, employeeMessage) {
  // The prompt forbids fences, but strip them defensively rather than fail.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);

  const tu = parsed.taxonomy_updates ?? {};
  const taxonomy_updates = {
    role: typeof tu.role === 'string' ? tu.role : null,
    tasks_add: asArray(tu.tasks_add),
    pains_add: asArray(tu.pains_add),
    automation_candidates_add: asArray(tu.automation_candidates_add),
    time_costs_add: asArray(tu.time_costs_add),
  };

  const insights = [];
  for (const item of asArray(parsed.insights)) {
    const confidence = Number(item.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`insight confidence out of range: ${String(item.confidence)}`);
    }
    if (confidence < 0.3) continue; // below the floor: silently absent, per rules
    if (typeof item.label !== 'string' || typeof item.evidence_quote !== 'string') {
      throw new Error('insight missing label or evidence_quote');
    }
    if (isIdentityOnlyLabel(item.label)) {
      // Backstop for prompt rules 2a/2b: a role title, name or bare team/tool
      // name is context metadata, never an insight. Drop, never relabel — this
      // is the source-level fix for the "DX lead as keyword" bug.
      console.warn(
        `extraction: dropped insight "${item.label}" — identity/context label, ` +
          'not a substantive finding (rules 2a/2b)'
      );
      continue;
    }
    if (!quoteIsVerbatim(item.evidence_quote, employeeMessage)) {
      // Drop, never patch: an unverifiable quote cannot become evidence.
      console.warn(
        `extraction: dropped insight "${item.label}" — evidence_quote is not a ` +
          'verbatim substring of the employee message'
      );
      continue;
    }
    insights.push({
      type: item.type ?? 'task',
      label: item.label,
      evidence_quote: item.evidence_quote,
      implication: typeof item.implication === 'string' ? item.implication : null,
      time_per_week_hours:
        typeof item.time_per_week_hours === 'number' ? item.time_per_week_hours : null,
      confidence,
      second_hand: item.second_hand === true,
    });
  }

  const cu = parsed.consent_updates ?? {};
  const consent_updates = {
    attribution:
      ['named', 'anonymised', 'anonymous', 'none'].includes(cu.attribution) ? cu.attribution : null,
    memory_opt_in: typeof cu.memory_opt_in === 'boolean' ? cu.memory_opt_in : null,
  };

  const slot_updates = {};
  const su = parsed.slot_updates ?? {};
  for (const [phase, slots] of Object.entries(su)) {
    if (!VALID_PHASES.has(phase) || !slots || typeof slots !== 'object') continue;
    const cleanedSlots = {};
    for (const [slot, status] of Object.entries(slots)) {
      if (typeof status === 'string' && VALID_SLOT_STATUSES.has(status)) {
        cleanedSlots[slot] = status;
      }
    }
    if (Object.keys(cleanedSlots).length > 0) {
      slot_updates[phase] = cleanedSlots;
    }
  }

  return {
    taxonomy_updates,
    insights,
    special_category_detected: parsed.special_category_detected === true,
    consent_updates,
    slot_updates,
  };
}

// ─── The extraction call ─────────────────────────────────────────────────────

let anthropic = null;
function client() {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// Port: test seam. Pass a fake `{ messages: { create } }` (or null to reset to the real SDK client).
export function setExtractionClient(fake) {
  anthropic = fake;
}

/**
 * Output cap for one extraction, scaled to the length of the answer being
 * parsed. A long answer legitimately yields more insights plus more slot
 * updates, and if the JSON truncates mid-string BOTH attempts fail and the
 * turn silently produces nothing at all. Generous by design: unused output
 * tokens are not billed, a truncated extraction costs the whole turn.
 */
function extractionMaxTokens(employeeMessage) {
  const len = (employeeMessage ?? '').length;
  if (len > 2000) return 12_000;
  if (len > 600) return 8_000;
  return 4_000;
}

/**
 * Run extraction over the latest exchange. Returns null when the model
 * output failed validation twice (the turn is skipped, state untouched).
 * Usage totals cover both attempts so the ledger never under-counts.
 *
 * @param {{ taxonomyState: unknown, agentQuestion: string | null, employeeMessage: string, onBehalf?: boolean }} params
 * @returns {Promise<ExtractionResult | null>}
 */
export async function runExtraction(params) {
  const { taxonomyState, agentQuestion, employeeMessage, onBehalf = false } = params;

  const exchange =
    (agentQuestion ? `INTERVIEWER: ${agentQuestion}\n\n` : '') +
    `EMPLOYEE: ${employeeMessage}`;

  const prompt =
    EXTRACTION_PROMPT.replace(
      '{{CURRENT_TAXONOMY_STATE}}',
      JSON.stringify(taxonomyState ?? {}, null, 0)
    )
      .replace('{{LATEST_EXCHANGE}}', exchange)
      .replace('{{ON_BEHALF}}', String(onBehalf)) + EXTRACTION_SLOT_ADDENDUM;

  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYOUR PREVIOUS OUTPUT FAILED VALIDATION: ${lastError}\nEmit the corrected JSON object only.`;
    try {
      const response = await client().messages.create({
        model: EXTRACTION_MODEL,
        // A dense answer can yield a dozen insights plus slot updates; a
        // tight cap truncates the JSON mid-string and burns the retry too.
        // Scale the cap with the answer, because the failure mode here is
        // silent and backwards: the RICHER the answer, the more likely the
        // JSON truncates, both attempts fail, runExtraction returns null, and
        // the turn yields ZERO insights with no phase advance. Spoken answers
        // are two to three times longer than typed ones, so a fixed 3000 would
        // have made the best answers the ones most likely to vanish.
        max_tokens: extractionMaxTokens(employeeMessage),
        temperature: 0, // a parser, not a thinker
        messages: [{ role: 'user', content }],
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const validated = parseAndValidate(text, employeeMessage);
      return { ...validated, usage: { inputTokens, outputTokens } };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`extraction attempt ${attempt + 1} failed: ${lastError}`);
    }
  }

  console.warn('extraction: both attempts failed; skipping this turn');
  return null;
}
