// Port of SOURCE src/lib/budget.ts @505ba6a. Price table, budget default and steering text unchanged.
// Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter of
// recordUsage(db, params) and getBudgetStatus(db, employeeId, engagementId). The embedded select
// `session:session_id!inner(employee_id)` is rewritten as one db.sql JOIN.

/**
 * Usage accounting and the per-employee token budget.
 *
 * Every model call (interview turn, extraction) is recorded to usage_ledger
 * with input/output tokens and a computed cost in pence. The budget itself
 * is TOKEN-based (env EMPLOYEE_TOKEN_BUDGET, default 150 000 tokens summed
 * across all of the employee's sessions in the engagement); cost_pence is
 * recorded for the engagement cost envelope, not for gating.
 *
 * The employee never sees any of this. Budget pressure surfaces only as
 * steering lines appended to the interviewer's system prompt
 * (see steeringLineFor below).
 */

// ─── Pricing ─────────────────────────────────────────────────────────────────

/**
 * Hardcoded price table, USD per million tokens, from the Anthropic price
 * list as of 2026-06-12 (claude-sonnet-4-6: $3 in / $15 out;
 * claude-haiku-4-5: $1 in / $5 out). Update here when prices or models
 * change. Unknown models fall back to Sonnet pricing — over-estimating is
 * safer than under-estimating an envelope.
 */
const PRICE_TABLE_USD_PER_MTOK = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
const FALLBACK_PRICE = PRICE_TABLE_USD_PER_MTOK['claude-sonnet-4-6'];

/**
 * Assumed USD→GBP rate, fixed in code so costs are deterministic and
 * auditable rather than drifting with FX. Revisit per engagement if the
 * envelope maths starts to matter commercially.
 */
const USD_TO_GBP = 0.79;

/**
 * Cost of one call in pence. Math.ceil so a ledger row is never recorded as
 * zero / under-reported: per-call costs are fractions of a penny, and
 * rounding down would make the whole engagement look free.
 */
export function costPence(model, inputTokens, outputTokens) {
  const price = PRICE_TABLE_USD_PER_MTOK[model] ?? FALLBACK_PRICE;
  const usd =
    (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.ceil(usd * USD_TO_GBP * 100);
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

/**
 * Record one model call to usage_ledger. Failures are logged, never thrown:
 * accounting must not break the interview path.
 *
 * @param {any} db interviewDb client
 * @param {{ sessionId: string, engagementId: string, model: string, inputTokens: number, outputTokens: number }} params
 */
export async function recordUsage(db, params) {
  const { sessionId, engagementId, model, inputTokens, outputTokens } = params;
  try {
    // Port: db is injected instead of `const db = supabaseService()`.
    const { error } = await db.from('usage_ledger').insert({
      session_id: sessionId,
      engagement_id: engagementId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_pence: costPence(model, inputTokens, outputTokens),
    });
    if (error) console.warn(`usage_ledger insert failed: ${error.message}`);
  } catch (e) {
    console.warn('usage_ledger insert failed:', e);
  }
}

// ─── Budget ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{ usedTokens: number, budgetTokens: number, ratio: number }} BudgetStatus
 * ratio = usedTokens / budgetTokens, uncapped (can exceed 1).
 */

/**
 * Per-employee token budget. Raised from 150k because that ceiling was
 * calibrated on TYPED interviews: the 14 Jul session ran 89 turns, and spoken
 * answers are two to three times longer again, so a voice interview could hit
 * the hard backstop and eject a participant mid-conversation. This is a cost
 * backstop against a runaway loop, not a length limit on a real interview, so
 * it should sit well clear of any honest conversation.
 */
function employeeTokenBudget() {
  const raw = Number(process.env.EMPLOYEE_TOKEN_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : 400_000;
}

/**
 * Sum input+output tokens across usage_ledger for all of this employee's
 * sessions within the engagement. Ledger rows whose session was deleted
 * (session_id null) no longer count against anyone — acceptable: discard
 * means the conversation never happened.
 *
 * @returns {Promise<BudgetStatus>}
 */
export async function getBudgetStatus(db, employeeId, engagementId) {
  const budgetTokens = employeeTokenBudget();

  // Port: the source used the embedded select
  // `input_tokens, output_tokens, session:session_id!inner(employee_id)` filtered on
  // `session.employee_id`; the shim has no embeds, so the same inner join is written in SQL.
  const { data, error } = await db.sql(
    `SELECT u.input_tokens, u.output_tokens
       FROM usage_ledger u
       JOIN session s ON s.id = u.session_id
      WHERE u.engagement_id = $1 AND s.employee_id = $2`,
    [engagementId, employeeId]
  );

  if (error) {
    // Fail open with zero usage: a broken ledger read must not stall the
    // interview; the worst case is a slightly late steering line.
    console.warn(`budget read failed: ${error.message}`);
    return { usedTokens: 0, budgetTokens, ratio: 0 };
  }

  const usedTokens = (data ?? []).reduce(
    (sum, row) =>
      sum + Number(row.input_tokens ?? 0) +
      Number(row.output_tokens ?? 0),
    0
  );
  return { usedTokens, budgetTokens, ratio: usedTokens / budgetTokens };
}

/**
 * The system-prompt steering line for the current budget pressure. Never
 * mentions tokens, budgets or cost — the employee must never see resource
 * language reflected back at them.
 *
 * @param {BudgetStatus} status
 * @returns {string | null}
 */
export function steeringLineFor(status) {
  if (status.ratio >= 1) {
    return (
      'PACING (private to you, never mention it): this conversation has used all of its ' +
      'allotted time. Wrap up gracefully now: do not open new topics, finish the current ' +
      'thought warmly, and move straight to the sign-off questions. Never cut the ' +
      'participant off mid-answer and never mention limits of any kind.'
    );
  }
  if (status.ratio > 0.8) {
    return (
      'PACING (private to you, never mention it): the conversation is in its final ' +
      'stretch. Start consolidating: prefer closing open threads over opening new ones, ' +
      'quantify anything important still vague, and begin moving toward sign-off. ' +
      'Never mention time pressure or limits to the participant.'
    );
  }
  return null;
}
