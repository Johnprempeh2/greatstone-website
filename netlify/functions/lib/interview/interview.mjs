// Port of SOURCE src/lib/interview.ts @505ba6a. Logic, constants and prompt text unchanged.
// Port: TypeScript types stripped (JSDoc kept where useful), `import 'server-only'` removed, imports
// point at the sibling .mjs files. Pure module: no data client.

/**
 * Interview engine helpers: phase machine, taxonomy_state maintenance and
 * system prompt assembly for the per-turn chat route.
 *
 * The contract for taxonomy_state is docs/taxonomy-synthesis-contract.md
 * section 3.2: slots are the per-phase coverage checklist, phase advance is
 * gated on slot fill (never on turn count; GRE-4941 adds a per-phase turn
 * limit and a repeat guard as backstops only, see stepPhase), and completion_score is the
 * weighted slot fill (warm_up 0.1, day_in_the_life 0.25, pain_mapping 0.3,
 * automation_surfacing 0.25, sign_off 0.1; filled = 1, partial = 0.5).
 */

import { createInitialTaxonomyState } from './types.mjs';
import { INTERVIEW_SYSTEM_PROMPT } from './prompts/interview-system-prompt.mjs';
import { steeringLineFor } from './budget.mjs';

/** @typedef {import('./types.mjs').TaxonomyState} TaxonomyState */
/** @typedef {import('./types.mjs').TaxonomySlots} TaxonomySlots */
/** @typedef {import('./types.mjs').TaxonomyPhase} TaxonomyPhase */

// ─── Phase vocabulary mapping (DB enum ↔ contract labels) ────────────────────

export const TAXONOMY_TO_DB_PHASE = {
  warm_up: 'warmup',
  day_in_the_life: 'day_in_life',
  pain_mapping: 'pain_mapping',
  automation_surfacing: 'automation',
  sign_off: 'sign_off',
};

/** @type {TaxonomyPhase[]} */
export const TAXONOMY_PHASE_ORDER = [
  'warm_up',
  'day_in_the_life',
  'pain_mapping',
  'automation_surfacing',
  'sign_off',
];

const PHASE_WEIGHTS = {
  warm_up: 0.1,
  day_in_the_life: 0.25,
  pain_mapping: 0.3,
  automation_surfacing: 0.25,
  sign_off: 0.1,
};

const SLOT_RANK = { empty: 0, partial: 1, filled: 2 };

/** Normalise a possibly-empty/legacy taxonomy_state into the contract shape. @returns {TaxonomyState} */
export function normaliseTaxonomyState(raw) {
  const fresh = createInitialTaxonomyState();
  if (!raw || typeof raw !== 'object' || !('slots' in raw)) return fresh;
  const state = raw;
  // Merge over the fresh shape so missing slots/fields never crash the engine.
  const slots = fresh.slots;
  for (const phase of TAXONOMY_PHASE_ORDER) {
    const incoming = state.slots?.[phase];
    if (!incoming) continue;
    const target = slots[phase];
    for (const key of Object.keys(target)) {
      const v = incoming[key];
      if (v === 'empty' || v === 'partial' || v === 'filled') target[key] = v;
    }
  }
  return {
    ...fresh,
    ...state,
    slots,
    open_threads: Array.isArray(state.open_threads) ? state.open_threads.slice(0, 5) : [],
  };
}

/** Ratchet slot statuses upward only: an extractor can never regress a slot. @returns {TaxonomySlots} */
export function applySlotUpdates(slots, updates) {
  const next = structuredClone(slots);
  for (const phase of TAXONOMY_PHASE_ORDER) {
    const phaseUpdates = updates[phase];
    if (!phaseUpdates) continue;
    for (const [slot, status] of Object.entries(phaseUpdates)) {
      if (!(slot in next[phase])) continue;
      if (SLOT_RANK[status] > SLOT_RANK[next[phase][slot]]) {
        next[phase][slot] = status;
      }
    }
  }
  return next;
}

/** Weighted slot fill per contract 3.2: filled = 1, partial = 0.5, empty = 0. */
export function computeCompletionScore(slots) {
  let score = 0;
  for (const phase of TAXONOMY_PHASE_ORDER) {
    const phaseSlots = Object.values(slots[phase]);
    const phaseFill =
      phaseSlots.reduce((s, v) => s + (v === 'filled' ? 1 : v === 'partial' ? 0.5 : 0), 0) /
      phaseSlots.length;
    score += PHASE_WEIGHTS[phase] * phaseFill;
  }
  return Math.round(score * 100) / 100;
}

/**
 * Per-phase exit gate: a phase is complete when none of its checklist slots
 * is still empty and the phase's own fill fraction reaches 0.75 — i.e. every
 * line of the checklist has signal and most are properly answered. This is
 * the contract's "phase advance gated on slot fill", made concrete.
 */
export function phaseIsComplete(slots, phase) {
  const phaseSlots = Object.values(slots[phase]);
  if (phaseSlots.some((s) => s === 'empty')) return false;
  const fill =
    phaseSlots.reduce((s, v) => s + (v === 'filled' ? 1 : 0.5), 0) / phaseSlots.length;
  return fill >= 0.75;
}

/**
 * Advance the phase pointer past every completed phase (a single rich answer
 * can complete more than one). Returns the new phase; equal to `current`
 * when nothing advanced. Never advances past sign_off.
 */
export function advancePhase(slots, current) {
  let idx = TAXONOMY_PHASE_ORDER.indexOf(current);
  while (
    idx < TAXONOMY_PHASE_ORDER.length - 1 &&
    phaseIsComplete(slots, TAXONOMY_PHASE_ORDER[idx])
  ) {
    idx += 1;
  }
  return TAXONOMY_PHASE_ORDER[idx];
}

// ─── Stuck-phase backstops (GRE-4941) ────────────────────────────────────────
// The GRE-2617 dry run (row R5) stayed in warm-up for 13 typed turns and asked one question 7 times: the warm-up
// gate needs every slot non-empty, the extractor seldom fills the harness slots in a typed chat, and nothing else
// moved the pointer on. Slot fill still decides the normal advance; these only stop a phase from looping.

/** A round's length in minutes (engagement.target_minutes, column default 20). */
export function targetMinutesOf(engagement) {
  const n = Number(engagement?.target_minutes);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 20;
}

// Participant turns per phase at a 20-minute round. Warm-up is the same in every round; the others scale with length.
const PHASE_TURN_LIMITS_AT_20 = { warm_up: 3, day_in_the_life: 6, pain_mapping: 8, automation_surfacing: 4 };

/** The most participant turns a phase may take before the pointer moves on. sign_off has no limit. */
export function phaseTurnLimit(phase, targetMinutes = 20) {
  const base = PHASE_TURN_LIMITS_AT_20[phase];
  if (!base) return Infinity;
  if (phase === 'warm_up') return base;
  return Math.max(2, Math.round((base * targetMinutes) / 20));
}

/** How many times the interviewer may ask one question in one interview. */
export const MAX_QUESTION_ASKS = 2;

/** The last question in an agent turn (the sentence that ends in "?"), or null when the turn asks nothing. */
export function lastQuestionOf(text) {
  const sentences = String(text ?? '').match(/[^.!?\n]*\?/g);
  return sentences ? sentences[sentences.length - 1].trim() : null;
}

const questionWords = (q) => new Set(q.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((w) => w.length > 2));

/** Two questions are the same when most of their words match (Jaccard >= 0.75), so a light rewording still counts. */
export function sameQuestion(a, b) {
  const wa = questionWords(a);
  const wb = questionWords(b);
  if (wa.size === 0 || wb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared) >= 0.75;
}

/** Every distinct question the interviewer has asked, in first-asked order, with how often it was asked. */
export function askedQuestions(turns) {
  const asked = [];
  for (const t of turns) {
    if (t.role !== 'agent') continue;
    const q = lastQuestionOf(t.content);
    if (!q) continue;
    const seen = asked.find((a) => sameQuestion(a.text, q));
    if (seen) seen.count += 1;
    else asked.push({ text: q, count: 1 });
  }
  return asked;
}

/** How many times the interviewer has asked the question in its latest turn (0 when that turn asked none). */
export function latestQuestionAsks(turns) {
  const lastAgent = [...turns].reverse().find((t) => t.role === 'agent');
  const q = lastAgent ? lastQuestionOf(lastAgent.content) : null;
  if (!q) return 0;
  return askedQuestions(turns).find((a) => sameQuestion(a.text, q))?.count ?? 0;
}

/**
 * Slots only the harness can know. A participant who answers in the chat (or out loud) has confirmed the mode and is
 * engaging, so these fill on their first answer instead of waiting on the extractor, which seldom set them.
 */
export function markParticipantEngaged(slots) {
  return applySlotUpdates(slots, { warm_up: { mode_confirmed: 'filled', rapport_established: 'filled' } });
}

/**
 * The phase step for one participant turn, after its slot updates: slot fill first (advancePhase), then the two
 * backstops, each moving one phase on: the phase used up its turn limit, or the interviewer's latest question has
 * already been asked MAX_QUESTION_ASKS times. Counts the turn in state.phase_turns and resets it on a change.
 * Returns true when the phase changed.
 *
 * @param {TaxonomyState} state
 * @param {{ turns: Array<{ role: string, content: string }>, targetMinutes?: number }} params
 */
export function stepPhase(state, { turns, targetMinutes = 20 }) {
  const before = state.phase;
  state.phase_turns = (state.phase_turns ?? 0) + 1;
  let next = advancePhase(state.slots, state.phase);
  if (next === before && before !== 'sign_off') {
    const outOfTurns = state.phase_turns >= phaseTurnLimit(before, targetMinutes);
    const repeating = latestQuestionAsks(turns) >= MAX_QUESTION_ASKS;
    if (outOfTurns || repeating) next = TAXONOMY_PHASE_ORDER[TAXONOMY_PHASE_ORDER.indexOf(before) + 1];
  }
  if (next === before) return false;
  state.phase = next;
  state.phase_turns = 0;
  return true;
}

/**
 * The sign-off consent gate: the interview is over once the agent has asked
 * — and the participant has answered — both consent questions. Detected via
 * the sign-off slots, which extraction fills from consent_updates.
 * Deliberately NOT gated on the phase pointer: a brisk interview can answer
 * both consents while earlier checklists still have partial slots, and the
 * recorded consents are the ground truth that the interview is over.
 */
export function signOffComplete(state) {
  return (
    state.slots.sign_off.attribution_preference === 'filled' &&
    state.slots.sign_off.memory_opt_in_asked === 'filled'
  );
}

/** Heuristic next_action for the state object (contract enum). */
export function deriveNextAction(state) {
  if (signOffComplete(state)) return 'close';
  if (state.phase === 'sign_off') {
    if (state.slots.sign_off.attribution_preference !== 'filled') return 'read_back';
    return 'ask_memory_opt_in';
  }
  if (state.phase === 'pain_mapping' && state.slots.pain_mapping.time_costs_quantified !== 'filled')
    return 'quantify_time';
  if (state.phase === 'automation_surfacing' && state.slots.automation_surfacing.candidates_proposed === 'empty')
    return 'propose_candidate';
  if (phaseIsComplete(state.slots, state.phase)) return 'advance_phase';
  return state.phase === 'warm_up' ? 'ask_open' : 'probe_deeper';
}

/** Pace against the round's length (GRE-4941; the source fixed 25 and 10 minutes, right for a 20-minute round). */
export function updatePaceFields(state, startedAt, targetMinutes = 20) {
  const elapsedMinutes = Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 60_000);
  state.elapsed_minutes = Math.round(elapsedMinutes * 10) / 10;
  state.pace_flag =
    elapsedMinutes > targetMinutes * 1.25 && state.completion_score < 0.7
      ? 'running_long'
      : elapsedMinutes < targetMinutes / 2 && state.completion_score > 0.8
        ? 'running_short'
        : 'on_pace';
}

// ─── System prompt assembly ──────────────────────────────────────────────────

function renderContextPack(engagement, pack, orgUnit, roleTitle, employeeEmail = null, employeeId = null, employeeUserId = null) {
  const lines = [`Company: ${engagement.client_name}`];

  if (pack?.content && typeof pack.content === 'object') {
    const c = pack.content;
    // Engagement-wide sections, rendered in a stable order if present.
    for (const key of [
      'company_background',
      'org_summary',
      'systems',
      'scope',
      'glossary',
      'do_not_discuss',
      'working_pattern',
    ]) {
      if (c[key] !== undefined && c[key] !== null) {
        lines.push(`${key}: ${typeof c[key] === 'string' ? c[key] : JSON.stringify(c[key])}`);
      }
    }
    // Priority questions the client specifically asked to be covered. Given
    // extra weight so the interviewer treats them as must-ask, woven in
    // naturally rather than read out as a checklist.
    if (c.priority_questions !== undefined && c.priority_questions !== null && String(c.priority_questions).trim()) {
      lines.push(
        `MUST-ASK QUESTIONS (the client specifically asked that these be covered with everyone; weave them in naturally over the conversation, never read them out as a list): ${
          typeof c.priority_questions === 'string' ? c.priority_questions : JSON.stringify(c.priority_questions)
        }`
      );
    }
    // Per-unit section resolution: content.units keyed by org_unit id (or
    // name as a fallback). A unit without its own section inherits nothing
    // here — the engagement-wide content above already applies.
    const units = c.units;
    if (orgUnit && units && typeof units === 'object') {
      const section = units[orgUnit.id] ?? units[orgUnit.name];
      if (section) {
        lines.push(
          `Department section for the interviewee's unit (${orgUnit.name}): ${
            typeof section === 'string' ? section : JSON.stringify(section)
          }`
        );
      }
    }
    // Port: new on the website (GRE-2612). In a per-person round (small organisations) GSAM writes questions for
    // each person in content.people, keyed by the website user id (or an employee id, or before the person has an
    // account the lower-case email), and they are rendered like a unit section. The user id wins, then the employee id.
    const people = c.people;
    if ((employeeUserId || employeeId || employeeEmail) && people && typeof people === 'object') {
      const section = (employeeUserId && people[employeeUserId]) ?? (employeeId && people[employeeId])
        ?? (employeeEmail ? people[String(employeeEmail).toLowerCase()] : undefined);
      if (section) {
        lines.push(
          `Section for this interviewee: ${typeof section === 'string' ? section : JSON.stringify(section)}`
        );
      }
    }
  }

  if (orgUnit) {
    lines.push(`The interviewee sits in the ${orgUnit.kind} "${orgUnit.name}".`);
  }
  if (roleTitle) {
    lines.push(`Their role title on the invitation list is "${roleTitle}".`);
  }
  return lines.join('\n');
}

/**
 * Render the {{KNOWN_FACTS}} block from the interviewee's own employee row
 * (their sign-up / invitation record — never anyone else's data). Name is
 * always present; role title and department only when the row carries them.
 * The prompt's KNOWN FACTS rules key off exactly what is listed here: a fact
 * rendered is never asked for, a fact omitted is fair to ask about.
 *
 * @param {{ name: string, roleTitle: string | null, orgUnit: object | null }} params
 */
export function renderKnownFacts(params) {
  const lines = [`Name: ${params.name}`];
  if (params.roleTitle?.trim()) {
    lines.push(`Role title on file: ${params.roleTitle.trim()}`);
  }
  if (params.orgUnit) {
    lines.push(`Department on file: ${params.orgUnit.name}`);
  }
  return lines.join('\n');
}

// Each phase's share of the round, from the source prompt's times (2, 6, 9, 5 and 2 of about 24 minutes).
const PHASE_SHARES = { warm_up: 0.08, day_in_the_life: 0.25, pain_mapping: 0.37, automation_surfacing: 0.21, sign_off: 0.08 };

const aboutMinutes = (n) => (n <= 1 ? 'about a minute' : `about ${n} minutes`);

/** The duration variables in the prompt, all from the round's length (GRE-4941). */
export function durationVariables(targetMinutes = 20) {
  const vars = { '{{TARGET_MINUTES}}': String(targetMinutes) };
  for (const phase of TAXONOMY_PHASE_ORDER) {
    vars[`{{${phase.toUpperCase()}_MINUTES}}`] = aboutMinutes(Math.max(1, Math.round(targetMinutes * PHASE_SHARES[phase])));
  }
  return vars;
}

/**
 * Build the full system prompt for one interview turn: canonical prompt with
 * template variables injected, plus the runtime state block (which slots
 * still need attention) and any budget steering line. Volatile runtime state
 * goes at the END so the long canonical prefix stays byte-stable for prompt
 * caching. The memory block, like the context pack, is per-session constant
 * (the blob only ever changes at a sign-off, after the session has ended),
 * so substituting it into the prefix preserves that stability.
 *
 * @param {{ engagement: object, contextPack: { content: object, version: number } | null, orgUnit: object | null,
 *   employeeName: string, roleTitle: string | null, state: TaxonomyState,
 *   budget: import('./budget.mjs').BudgetStatus, memoryBlock?: string | null, closing?: boolean,
 *   turns?: Array<{ role: string, content: string }> }} params
 * @returns {{ stable: string, volatile: string }}
 */
export function buildSystemPrompt(params) {
  const {
    engagement,
    contextPack,
    orgUnit,
    employeeName,
    employeeEmail,
    employeeId,
    employeeUserId,
    roleTitle,
    state,
    budget,
    memoryBlock,
    closing,
    turns = [],
  } = params;
  const targetMinutes = targetMinutesOf(engagement);

  // Stable, cacheable prefix: the full instruction template with the
  // engagement context pack, this participant's known facts and any memory
  // filled in. It is byte-identical across every turn of one interview, so it
  // is the natural Anthropic prompt-cache breakpoint (marked in the chat
  // route). Everything that changes turn to turn goes in `volatile` below,
  // AFTER the breakpoint, or the cache would miss every turn. The round's
  // length is fixed for the session, so the durations belong here.
  let template = INTERVIEW_SYSTEM_PROMPT;
  for (const [name, value] of Object.entries(durationVariables(targetMinutes))) template = template.replaceAll(name, value);
  const stable = template.replace(
    '{{ENGAGEMENT_CONTEXT_PACK}}',
    renderContextPack(engagement, contextPack, orgUnit, roleTitle, employeeEmail, employeeId, employeeUserId)
  ).replace(
    '{{KNOWN_FACTS}}',
    renderKnownFacts({ name: employeeName, roleTitle, orgUnit })
  ).replace(
    '{{MEMORY_BLOB}}',
    memoryBlock || '(none — no memory for this participant; use the cold opening)'
  );

  // Runtime state block: which checklist slots still need attention. The
  // interviewer reads this; it never prints it (per the docs implementation
  // note, taxonomy_state is machine state, not conversation content).
  const gaps = [];
  const phaseSlots = state.slots[state.phase];
  for (const [slot, status] of Object.entries(phaseSlots)) {
    if (status !== 'filled') gaps.push(`${slot} (${status})`);
  }
  let volatile = `\n\n# RUNTIME STATE (private to you — never mention or print any of this)\n`;
  volatile += `Current phase: ${state.phase}. Elapsed: about ${Math.round(state.elapsed_minutes)} of ${targetMinutes} minutes. Pace: ${state.pace_flag ?? 'on_pace'}.\n`;
  volatile += gaps.length
    ? `Unfilled slots in this phase: ${gaps.join(', ')}. Choose your next question to fill the highest-value gap.\n`
    : `This phase's checklist is filled; move the conversation into the next phase naturally.\n`;
  // Repeat guard (GRE-4941): a question asked MAX_QUESTION_ASKS times is never asked again, in any wording.
  const exhausted = askedQuestions(turns).filter((a) => a.count >= MAX_QUESTION_ASKS);
  if (exhausted.length > 0) {
    volatile += `You have already asked these questions ${MAX_QUESTION_ASKS} times. Never ask them again, in any wording; ` +
      `take what you have and move to new ground: ${exhausted.map((a) => `"${a.text}"`).join('; ')}.\n`;
  }
  if (state.open_threads && state.open_threads.length > 0) {
    volatile += `Open threads worth returning to: ${state.open_threads.join('; ')}.\n`;
  }

  const steering = steeringLineFor(budget);
  if (steering) volatile += `\n${steering}\n`;

  if (closing) {
    volatile +=
      '\nBoth consent answers are now recorded. This is your FINAL message: close warmly ' +
      'and briefly per the sign-off script — thank them, say what happens next, and end. ' +
      'Ask no further questions.\n';
  }

  volatile +=
    '\nKeep every reply short: a brief, warm acknowledgement and ONE question, a few ' +
    'sentences at most. This is a chat, not a letter.';

  return { stable, volatile };
}

/**
 * Map persisted turns into Anthropic messages. When the transcript is empty
 * (fresh session) or ends with an agent turn that needs no reply yet, the
 * caller appends a kickoff nudge instead.
 */
/**
 * How much transcript we carry into each turn, measured in characters rather
 * than turn COUNT. A count is the wrong unit: the 14 Jul interview ran 89
 * turns, so a 40-turn cap silently dropped the first half of the conversation
 * and the interviewer lost what it had already been told. Spoken answers are
 * two to three times longer again, so the count would bite harder still.
 *
 * ~4 chars per token, so 60k chars is roughly 15k tokens of history: generous
 * against a 200k context, and bounded so a very long session cannot creep up
 * on the request size.
 */
const HISTORY_CHAR_BUDGET = Number(process.env.HISTORY_CHAR_BUDGET) || 60_000;

/** @returns {Array<{ role: 'user' | 'assistant', content: string }>} */
export function turnsToMessages(turns) {
  // Keep the most RECENT turns that fit the budget, walking backwards so the
  // live end of the conversation is never the part that gets dropped.
  let used = 0;
  let cut = turns.length;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    used += (turns[i].content ?? '').length;
    if (used > HISTORY_CHAR_BUDGET) break;
    cut = i;
  }
  const recent = turns.slice(cut);
  const messages = [];
  for (const t of recent) {
    const role = t.role === 'agent' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${t.content}`; // merge consecutive same-role turns
    } else {
      messages.push({ role, content: t.content });
    }
  }
  // Anthropic requires the first message to be from the user.
  if (messages.length > 0 && messages[0].role === 'assistant') {
    messages.unshift({ role: 'user', content: '(The participant has just opened the chat.)' });
  }
  return messages;
}

export const KICKOFF_NUDGE =
  '(The participant has just opened the chat and is ready to begin. Send your opening message now.)';

export const RECOVERY_NUDGE =
  '(Your previous reply did not reach the participant — continue the conversation from their last message above.)';
