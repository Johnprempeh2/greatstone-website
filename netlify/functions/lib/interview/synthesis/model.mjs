// Port of src/lib/synthesis/model.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client; the Anthropic client is
// injectable (setSynthesisClient) so tests run with a fake and no network. SYNTHESIS_MODEL default,
// price table, retry rule and ledger discipline unchanged.
//
// Model plumbing for the synthesis pipeline: the SYNTHESIS_MODEL call wrapper (strict JSON out, one
// retry with the parse error appended) and the usage_ledger recorder.
//
// Ledger discipline: EVERY model call lands in usage_ledger (model, tokens, cost_pence,
// engagement_id; session_id null because synthesis is engagement-level). Failed attempts still count
// their tokens; accounting never under-reports. Pricing mirrors src/lib/budget.ts conventions
// (USD->GBP fixed at 0.79, Math.ceil so no call is recorded as free) with the Opus tier added.

import Anthropic from '@anthropic-ai/sdk';
import { anthropicKey } from '../keys.mjs';

export const SYNTHESIS_MODEL = process.env.SYNTHESIS_MODEL ?? 'claude-opus-4-6';

/**
 * USD per million tokens (Anthropic price list as of 2026-06-12): claude-opus-4-6 $5 in / $25 out;
 * claude-sonnet-4-6 $3/$15; claude-haiku-4-5 $1/$5. Unknown models fall back to Opus pricing:
 * over-estimating an envelope is safer than under-estimating it.
 */
const PRICE_TABLE_USD_PER_MTOK = {
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
const FALLBACK_PRICE = PRICE_TABLE_USD_PER_MTOK['claude-opus-4-6'];
const USD_TO_GBP = 0.79;

export function synthesisCostPence(model, inputTokens, outputTokens) {
  const price = PRICE_TABLE_USD_PER_MTOK[model] ?? FALLBACK_PRICE;
  const usd =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;
  return Math.ceil(usd * USD_TO_GBP * 100);
}

let anthropic = null;
function client() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: anthropicKey() });
  return anthropic;
}

// Port: test seam. Pass any object with `messages.create(params)` resolving to an Anthropic-shaped
// response ({ content: [{ type: 'text', text }], usage: { input_tokens, output_tokens } }); pass null
// to go back to the real SDK client. Production never calls this.
export function setSynthesisClient(fake) {
  anthropic = fake;
}

/**
 * Record one synthesis model call. Logged, never thrown: accounting must not break the pipeline. Also
 * folds the call into the step's running tally.
 */
export async function recordSynthesisUsage(db, engagementId, inputTokens, outputTokens, tally) {
  const costPence = synthesisCostPence(SYNTHESIS_MODEL, inputTokens, outputTokens);
  tally.calls += 1;
  tally.inputTokens += inputTokens;
  tally.outputTokens += outputTokens;
  tally.costPence += costPence;
  try {
    const { error } = await db.from('usage_ledger').insert({
      session_id: null,
      engagement_id: engagementId,
      model: SYNTHESIS_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_pence: costPence,
    });
    if (error) console.warn(`synthesis usage_ledger insert failed: ${error.message}`);
  } catch (e) {
    console.warn('synthesis usage_ledger insert failed:', e);
  }
}

function stripFences(raw) {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
}

/**
 * One synthesis model call expecting a single JSON object back. Retries once with the parse error
 * appended; throws after the second failure. Usage for both attempts is recorded against the
 * engagement before returning/throwing.
 */
export async function callSynthesisModel(params) {
  const { db, engagementId, prompt, maxTokens, tally } = params;

  // Fail loudly and clearly on an empty prompt rather than letting the API return the cryptic
  // "messages.0.content: Field required" that a dropped prompt argument would otherwise produce.
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('callSynthesisModel: prompt is empty (a caller likely omitted the prompt argument)');
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = '';

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const content =
        attempt === 0
          ? prompt
          : `${prompt}\n\nYOUR PREVIOUS OUTPUT FAILED TO PARSE: ${lastError}\nEmit the corrected JSON object only, with no commentary and no code fences.`;
      const response = await client().messages.create({
        model: SYNTHESIS_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content }],
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      try {
        const parsed = JSON.parse(stripFences(text));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('top-level value is not a JSON object');
        }
        return parsed;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.warn(`synthesis model attempt ${attempt + 1} failed to parse: ${lastError}`);
      }
    }
    throw new Error(`synthesis model output failed to parse twice: ${lastError}`);
  } finally {
    if (inputTokens > 0 || outputTokens > 0) {
      await recordSynthesisUsage(db, engagementId, inputTokens, outputTokens, tally);
    }
  }
}
