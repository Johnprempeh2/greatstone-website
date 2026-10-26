// Unit tests for the ported interview engine library (netlify/functions/lib/interview). Pure logic is
// tested directly; modules that query get a tiny fake db with the interviewDb surface.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createInitialTaxonomyState } from '../functions/lib/interview/types.mjs';
import {
  TAXONOMY_TO_DB_PHASE, TAXONOMY_PHASE_ORDER, normaliseTaxonomyState, applySlotUpdates, computeCompletionScore,
  phaseIsComplete, advancePhase, signOffComplete, deriveNextAction, updatePaceFields, renderKnownFacts,
  buildSystemPrompt, turnsToMessages, KICKOFF_NUDGE, RECOVERY_NUDGE,
} from '../functions/lib/interview/interview.mjs';
import { costPence, recordUsage, getBudgetStatus, steeringLineFor } from '../functions/lib/interview/budget.mjs';
import { withinRate } from '../functions/lib/interview/ratelimit.mjs';
import {
  EXTRACTION_MODEL, quoteIsVerbatim, isIdentityOnlyLabel, parseAndValidate, persistableInsights, runExtraction,
  setExtractionClient,
} from '../functions/lib/interview/extraction.mjs';
import {
  MEMORY_RETENTION_MONTHS, buildMemoryBlob, mergeMemoryBlob, renderMemoryBlob, loadActiveMemoryBlob,
  ensurePersonForEmployee, applySignOffConsent,
} from '../functions/lib/interview/memory.mjs';
import { getLeaderCoverage } from '../functions/lib/interview/coverage.mjs';
import {
  getEmployeeContextByUserId, getEmployeeContextById, getEmployeeContextForEngagement, isGreatstoneAdmin,
  getActiveEngagement, getAdminContextForEngagement,
} from '../functions/lib/interview/employee.mjs';
import { EMAIL_SHAPE, escapeIlike, ensureSignInAccount, ensurePersonForUser, provisionInvitee } from '../functions/lib/interview/provision.mjs';
import { logAudit, getEngagementActivity } from '../functions/lib/interview/audit.mjs';
import { outboxIdempotencyKey, enqueueOutboxEvent, scheduleOutboxDrain } from '../functions/lib/interview/outbox.mjs';
import { DEFAULT_LINK_DAYS, hashLoginToken } from '../functions/lib/interview/login-link.mjs';
import { INTERVIEW_SYSTEM_PROMPT } from '../functions/lib/interview/prompts/interview-system-prompt.mjs';
import { EXTRACTION_PROMPT, EXTRACTION_SLOT_ADDENDUM } from '../functions/lib/interview/prompts/extraction-prompt.mjs';

// ─── Fake interviewDb ────────────────────────────────────────────────────────
// `handler(q)` receives each finished query ({ table, op, cols, filters, payload, opts, mode, limit } or
// { rpc, args } or { sql, params }) and returns a partial { data, error }.
function fakeDb(handler = () => ({})) {
  const calls = [];
  const settle = async (q) => { calls.push(q); return { data: null, error: null, ...(await handler(q)) }; };
  const from = (table) => {
    const q = { table, op: 'select', cols: null, filters: [], payload: null, opts: null, mode: null, limit: null };
    const b = {
      select(c) { if (q.op === 'select') q.cols = c; else q.returning = c; return b; },
      insert(p) { q.op = 'insert'; q.payload = p; return b; },
      update(p) { q.op = 'update'; q.payload = p; return b; },
      upsert(p, o) { q.op = 'upsert'; q.payload = p; q.opts = o; return b; },
      delete() { q.op = 'delete'; return b; },
      order(c, o) { q.order = [c, o]; return b; },
      limit(n) { q.limit = n; return b; },
      single() { q.mode = 'single'; return b; },
      maybeSingle() { q.mode = 'maybe'; return b; },
      then(res, rej) { return settle(q).then(res, rej); },
    };
    for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']) {
      b[op] = (c, v) => { q.filters.push([op, c, v]); return b; };
    }
    return b;
  };
  return {
    calls, from,
    rpc: (fn, args) => settle({ rpc: fn, args }),
    sql: (text, params) => settle({ sql: text, params }),
  };
}
const quiet = (t) => { t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'error', () => {}); };
const allSlots = (status) => {
  const s = createInitialTaxonomyState().slots;
  for (const p of Object.keys(s)) for (const k of Object.keys(s[p])) s[p][k] = status;
  return s;
};

// ─── types ───────────────────────────────────────────────────────────────────

test('createInitialTaxonomyState starts empty and prefills role_confirmed only when a role title is on file', () => {
  const s = createInitialTaxonomyState();
  assert.equal(s.phase, 'warm_up');
  assert.equal(s.next_action, 'ask_open');
  assert.equal(s.completion_score, 0);
  assert.ok(Object.values(s.slots).every((p) => Object.values(p).every((v) => v === 'empty')));
  assert.equal(s.prefilled_from_invite, undefined);
  const p = createInitialTaxonomyState({ name: 'Sam', role_title: 'Accounts assistant', unit_name: 'Finance' });
  assert.equal(p.slots.warm_up.role_confirmed, 'partial');
  assert.deepEqual(p.prefilled_from_invite, { source: 'invite', name: 'Sam', role_title: 'Accounts assistant', unit_name: 'Finance' });
  assert.equal(createInitialTaxonomyState({ name: 'Sam', role_title: '  ', unit_name: null }).slots.warm_up.role_confirmed, 'empty');
});

// ─── interview phase machine ─────────────────────────────────────────────────

test('phase vocabularies map contract labels to DB enum values', () => {
  assert.deepEqual(TAXONOMY_PHASE_ORDER, ['warm_up', 'day_in_the_life', 'pain_mapping', 'automation_surfacing', 'sign_off']);
  assert.deepEqual(TAXONOMY_TO_DB_PHASE, { warm_up: 'warmup', day_in_the_life: 'day_in_life', pain_mapping: 'pain_mapping', automation_surfacing: 'automation', sign_off: 'sign_off' });
});

test('normaliseTaxonomyState repairs legacy or empty state without trusting bad values', () => {
  assert.deepEqual(normaliseTaxonomyState(null), createInitialTaxonomyState());
  assert.deepEqual(normaliseTaxonomyState({}), createInitialTaxonomyState());
  const n = normaliseTaxonomyState({
    phase: 'pain_mapping', completion_score: 0.4,
    slots: { warm_up: { role_confirmed: 'filled', tenure_and_team: 'bogus', made_up: 'filled' } },
    open_threads: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  });
  assert.equal(n.phase, 'pain_mapping');
  assert.equal(n.slots.warm_up.role_confirmed, 'filled');
  assert.equal(n.slots.warm_up.tenure_and_team, 'empty');
  assert.equal('made_up' in n.slots.warm_up, false);
  assert.deepEqual(Object.keys(n.slots.sign_off), ['insights_read_back', 'corrections_taken', 'attribution_preference', 'memory_opt_in_asked']);
  assert.equal(n.open_threads.length, 5);
  assert.deepEqual(normaliseTaxonomyState({ slots: {}, open_threads: 'x' }).open_threads, []);
});

test('applySlotUpdates only ratchets upward, ignores unknown slots and does not mutate its input', () => {
  const slots = createInitialTaxonomyState().slots;
  slots.warm_up.role_confirmed = 'filled';
  const next = applySlotUpdates(slots, {
    warm_up: { role_confirmed: 'partial', tenure_and_team: 'partial', invented: 'filled' },
    pain_mapping: { top_pains_named: 'filled' },
  });
  assert.equal(next.warm_up.role_confirmed, 'filled');
  assert.equal(next.warm_up.tenure_and_team, 'partial');
  assert.equal(next.pain_mapping.top_pains_named, 'filled');
  assert.equal('invented' in next.warm_up, false);
  assert.equal(slots.warm_up.tenure_and_team, 'empty');
  assert.equal(applySlotUpdates(next, { warm_up: { tenure_and_team: 'empty' } }).warm_up.tenure_and_team, 'partial');
});

test('computeCompletionScore is the weighted slot fill, rounded to 2 dp', () => {
  assert.equal(computeCompletionScore(allSlots('empty')), 0);
  assert.equal(computeCompletionScore(allSlots('filled')), 1);
  assert.equal(computeCompletionScore(allSlots('partial')), 0.5);
  const s = allSlots('empty');
  for (const k of Object.keys(s.warm_up)) s.warm_up[k] = 'filled';
  assert.equal(computeCompletionScore(s), 0.1);
  for (const k of Object.keys(s.pain_mapping)) s.pain_mapping[k] = 'partial';
  assert.equal(computeCompletionScore(s), 0.25);
});

test('phaseIsComplete needs no empty slot and fill >= 0.75', () => {
  const s = allSlots('filled');
  s.warm_up.mode_confirmed = 'empty';
  assert.equal(phaseIsComplete(s, 'warm_up'), false);
  s.warm_up.mode_confirmed = 'partial';
  assert.equal(phaseIsComplete(s, 'warm_up'), true); // 3.5 / 4
  s.warm_up.rapport_established = 'partial';
  assert.equal(phaseIsComplete(s, 'warm_up'), true); // 3 / 4 = 0.75
  s.warm_up.tenure_and_team = 'partial';
  assert.equal(phaseIsComplete(s, 'warm_up'), false); // 2.5 / 4
});

test('advancePhase skips every completed phase but never passes sign_off', () => {
  const s = allSlots('empty');
  assert.equal(advancePhase(s, 'warm_up'), 'warm_up');
  for (const p of ['warm_up', 'day_in_the_life']) for (const k of Object.keys(s[p])) s[p][k] = 'filled';
  assert.equal(advancePhase(s, 'warm_up'), 'pain_mapping');
  assert.equal(advancePhase(allSlots('filled'), 'warm_up'), 'sign_off');
  assert.equal(advancePhase(allSlots('filled'), 'sign_off'), 'sign_off');
});

test('signOffComplete and deriveNextAction follow the contract enum', () => {
  const st = createInitialTaxonomyState();
  assert.equal(deriveNextAction(st), 'ask_open');
  st.phase = 'day_in_the_life';
  assert.equal(deriveNextAction(st), 'probe_deeper');
  for (const k of Object.keys(st.slots.day_in_the_life)) st.slots.day_in_the_life[k] = 'filled';
  assert.equal(deriveNextAction(st), 'advance_phase');
  st.phase = 'pain_mapping';
  assert.equal(deriveNextAction(st), 'quantify_time');
  st.phase = 'automation_surfacing';
  assert.equal(deriveNextAction(st), 'propose_candidate');
  st.phase = 'sign_off';
  assert.equal(deriveNextAction(st), 'read_back');
  st.slots.sign_off.attribution_preference = 'filled';
  assert.equal(signOffComplete(st), false);
  assert.equal(deriveNextAction(st), 'ask_memory_opt_in');
  st.slots.sign_off.memory_opt_in_asked = 'filled';
  assert.equal(signOffComplete(st), true);
  st.phase = 'warm_up'; // consents are the ground truth, not the phase pointer
  assert.equal(deriveNextAction(st), 'close');
});

test('updatePaceFields sets elapsed minutes and the pace flag', () => {
  const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();
  const st = createInitialTaxonomyState();
  updatePaceFields(st, ago(30));
  assert.equal(st.pace_flag, 'running_long');
  assert.ok(Math.abs(st.elapsed_minutes - 30) < 0.2);
  st.completion_score = 0.9;
  updatePaceFields(st, ago(5));
  assert.equal(st.pace_flag, 'running_short');
  updatePaceFields(st, ago(15));
  assert.equal(st.pace_flag, 'on_pace');
  updatePaceFields(st, new Date(Date.now() + 60_000).toISOString());
  assert.equal(st.elapsed_minutes, 0);
});

test('renderKnownFacts lists only what is on file', () => {
  assert.equal(renderKnownFacts({ name: 'Sam', roleTitle: null, orgUnit: null }), 'Name: Sam');
  assert.equal(renderKnownFacts({ name: 'Sam', roleTitle: ' Clerk ', orgUnit: { name: 'Finance' } }),
    'Name: Sam\nRole title on file: Clerk\nDepartment on file: Finance');
});

test('buildSystemPrompt fills the stable prefix and keeps runtime state in the volatile tail', () => {
  const engagement = { id: 'e1', client_name: 'Example Co' };
  const orgUnit = { id: 'u1', name: 'Finance', kind: 'department' };
  const contextPack = { version: 1, content: { systems: ['Sage'], scope: 'Back office', priority_questions: 'How is month end?', units: { u1: 'Runs payables' } } };
  const state = createInitialTaxonomyState();
  state.open_threads = ['invoice keying'];
  const base = { engagement, contextPack, orgUnit, employeeName: 'Sam', roleTitle: 'Clerk', state, budget: { usedTokens: 0, budgetTokens: 1, ratio: 0 } };
  const { stable, volatile } = buildSystemPrompt(base);
  assert.ok(!stable.includes('{{'));
  assert.ok(stable.startsWith(INTERVIEW_SYSTEM_PROMPT.slice(0, 200)));
  assert.ok(stable.includes('Company: Example Co'));
  assert.ok(stable.includes('systems: ["Sage"]'));
  assert.ok(stable.includes('MUST-ASK QUESTIONS'));
  assert.ok(stable.includes("Department section for the interviewee's unit (Finance): Runs payables"));
  assert.ok(stable.includes('The interviewee sits in the department "Finance".'));
  assert.ok(stable.includes('Role title on file: Clerk'));
  assert.ok(stable.includes('(none — no memory for this participant; use the cold opening)'));
  assert.ok(volatile.includes('Current phase: warm_up.'));
  assert.ok(volatile.includes('role_confirmed (empty)'));
  assert.ok(volatile.includes('Open threads worth returning to: invoice keying.'));
  assert.ok(!volatile.includes('PACING'));
  assert.ok(!volatile.includes('FINAL message'));
  assert.ok(volatile.endsWith('This is a chat, not a letter.'));
  // Stable prefix is byte-identical regardless of volatile inputs (prompt cache).
  const later = buildSystemPrompt({ ...base, state: { ...state, phase: 'pain_mapping' }, budget: { ratio: 1 }, closing: true });
  assert.equal(later.stable, stable);
  assert.ok(later.volatile.includes('PACING'));
  assert.ok(later.volatile.includes('This is your FINAL message'));
  assert.ok(buildSystemPrompt({ ...base, memoryBlock: 'MEMORY HERE' }).stable.includes('MEMORY HERE'));
});

test('buildSystemPrompt finds a person section by employee id first, then by email', () => {
  const content = { people: { 'e-123': 'Ask Sam about the board pack.', 'sam@example.test': 'Old note by email.' } };
  const base = { engagement: { id: 'e1', client_name: 'Example Co' }, contextPack: { version: 1, content }, orgUnit: null,
    employeeName: 'Sam', state: createInitialTaxonomyState(), budget: { ratio: 0 } };
  assert.ok(buildSystemPrompt({ ...base, employeeId: 'e-123', employeeEmail: 'Sam@example.test' }).stable
    .includes('Section for this interviewee: Ask Sam about the board pack.'));
  assert.ok(buildSystemPrompt({ ...base, employeeId: 'e-999', employeeEmail: 'Sam@example.test' }).stable
    .includes('Section for this interviewee: Old note by email.'));
  assert.ok(!buildSystemPrompt({ ...base, employeeId: 'e-999', employeeEmail: 'x@example.test' }).stable.includes('Section for this interviewee'));
});

test('turnsToMessages merges same-role turns, leads with a user turn and keeps the most recent history', () => {
  const t = (role, content) => ({ role, content });
  assert.deepEqual(turnsToMessages([]), []);
  assert.deepEqual(turnsToMessages([t('agent', 'Hi'), t('user', 'a'), t('user', 'b')]), [
    { role: 'user', content: '(The participant has just opened the chat.)' },
    { role: 'assistant', content: 'Hi' },
    { role: 'user', content: 'a\n\nb' },
  ]);
  // 60k-char budget: walking back, 'latest' + one 31k turn fit; the next 31k turn and 'oldest' do not.
  const big = 'x'.repeat(31_000);
  const out = turnsToMessages([t('user', 'oldest'), t('agent', big), t('user', big), t('agent', 'latest')]);
  assert.deepEqual(out, [{ role: 'user', content: big }, { role: 'assistant', content: 'latest' }]);
  const fits = 'x'.repeat(25_000);
  assert.equal(turnsToMessages([t('user', 'oldest'), t('agent', fits), t('user', fits), t('agent', 'latest')]).length, 4);
  assert.ok(KICKOFF_NUDGE.includes('Send your opening message now'));
  assert.ok(RECOVERY_NUDGE.includes('did not reach the participant'));
});

// ─── budget ──────────────────────────────────────────────────────────────────

test('costPence uses the price table, rounds up and falls back to Sonnet pricing', () => {
  assert.equal(costPence('claude-sonnet-4-6', 1_000_000, 0), 237);
  assert.equal(costPence('claude-haiku-4-5', 1_000_000, 1_000_000), 474);
  assert.equal(costPence('unknown-model', 1000, 500), 1);
  assert.equal(costPence('claude-haiku-4-5', 0, 0), 0);
  assert.equal(costPence('unknown-model', 100_000, 10_000), costPence('claude-sonnet-4-6', 100_000, 10_000));
});

test('steeringLineFor is silent until 80 %, then consolidates, then wraps up', () => {
  assert.equal(steeringLineFor({ ratio: 0.8 }), null);
  assert.match(steeringLineFor({ ratio: 0.81 }), /final stretch/);
  assert.match(steeringLineFor({ ratio: 1 }), /used all of its allotted time/);
  for (const r of [0.81, 1, 2]) assert.doesNotMatch(steeringLineFor({ ratio: r }), /token|budget|cost/i);
});

test('recordUsage writes one ledger row and never throws', async (t) => {
  quiet(t);
  const db = fakeDb();
  await recordUsage(db, { sessionId: 's1', engagementId: 'e1', model: 'claude-haiku-4-5', inputTokens: 1_000_000, outputTokens: 0 });
  assert.equal(db.calls[0].table, 'usage_ledger');
  assert.deepEqual(db.calls[0].payload, { session_id: 's1', engagement_id: 'e1', model: 'claude-haiku-4-5', input_tokens: 1_000_000, output_tokens: 0, cost_pence: 79 });
  await recordUsage(fakeDb(() => ({ error: { message: 'down' } })), { sessionId: 's', engagementId: 'e', model: 'm', inputTokens: 1, outputTokens: 1 });
  await recordUsage(fakeDb(() => { throw new Error('boom'); }), { sessionId: 's', engagementId: 'e', model: 'm', inputTokens: 1, outputTokens: 1 });
});

test('getBudgetStatus sums the employee ledger through a session join and fails open', async (t) => {
  quiet(t);
  const db = fakeDb(() => ({ data: [{ input_tokens: 100, output_tokens: '50' }, { input_tokens: null, output_tokens: 50 }] }));
  const status = await getBudgetStatus(db, 'emp1', 'eng1');
  assert.deepEqual(status, { usedTokens: 200, budgetTokens: 400_000, ratio: 200 / 400_000 });
  assert.match(db.calls[0].sql, /JOIN session s ON s\.id = u\.session_id/);
  assert.deepEqual(db.calls[0].params, ['eng1', 'emp1']);
  assert.deepEqual(await getBudgetStatus(fakeDb(() => ({ error: { message: 'x' } })), 'a', 'b'), { usedTokens: 0, budgetTokens: 400_000, ratio: 0 });
  process.env.EMPLOYEE_TOKEN_BUDGET = '1000';
  try { assert.equal((await getBudgetStatus(db, 'emp1', 'eng1')).ratio, 0.2); } finally { delete process.env.EMPLOYEE_TOKEN_BUDGET; }
});

// ─── ratelimit ───────────────────────────────────────────────────────────────

test('withinRate calls bump_rate and fails open', async (t) => {
  quiet(t);
  const db = fakeDb(() => ({ data: true }));
  assert.equal(await withinRate(db, 'chat:s1', 60, 10), true);
  assert.deepEqual(db.calls[0], { rpc: 'bump_rate', args: { p_key: 'chat:s1', p_window_secs: 60, p_limit: 10 } });
  assert.equal(await withinRate(fakeDb(() => ({ data: false })), 'k', 60, 1), false);
  assert.equal(await withinRate(fakeDb(() => ({ data: null })), 'k', 60, 1), true);
  assert.equal(await withinRate(fakeDb(() => ({ error: { message: 'x' } })), 'k', 60, 1), true);
  assert.equal(await withinRate(fakeDb(() => { throw new Error('x'); }), 'k', 60, 1), true);
});

// ─── extraction ──────────────────────────────────────────────────────────────

const MSG = 'Every Monday I spend   about three hours re-keying invoices into Sage, it drives me mad.';
const insight = (over = {}) => ({ type: 'pain', label: 'Manual re-keying of invoices into Sage', evidence_quote: 'I spend about three hours re-keying invoices', implication: null, time_per_week_hours: 3, confidence: 0.9, second_hand: false, ...over });

test('quoteIsVerbatim tolerates whitespace and case, nothing else', () => {
  assert.equal(quoteIsVerbatim('i SPEND about three\nhours', MSG), true);
  assert.equal(quoteIsVerbatim('I spend three hours', MSG), false);
  assert.equal(quoteIsVerbatim('re-keying invoices in to Sage', MSG), false);
});

test('isIdentityOnlyLabel drops role, team and title labels but keeps real findings', () => {
  for (const l of ['DX lead', 'platform team', 'the finance team', 'Accounts assistant', '   ']) assert.equal(isIdentityOnlyLabel(l), true, l);
  for (const l of ['Manual re-keying of invoices into Sage', 'Waiting on approvals from the finance team every week']) assert.equal(isIdentityOnlyLabel(l), false, l);
});

test('parseAndValidate drops unverifiable, low-confidence and identity insights, and cleans the rest', (t) => {
  quiet(t);
  const raw = '```json\n' + JSON.stringify({
    taxonomy_updates: { role: 'Clerk', tasks_add: [{ label: 'invoices', frequency: 'weekly' }], pains_add: 'nope' },
    insights: [
      insight(),
      insight({ label: 'Paraphrased', evidence_quote: 'I spend three hours keying invoices' }),
      insight({ label: 'Hedge', confidence: 0.2 }),
      insight({ label: 'DX lead' }),
      insight({ type: undefined, label: 'Untyped finding about invoices', implication: 'Blocks month end', time_per_week_hours: '3', second_hand: 'yes' }),
    ],
    special_category_detected: true,
    consent_updates: { attribution: 'public', memory_opt_in: true },
    slot_updates: { warm_up: { role_confirmed: 'filled', tenure_and_team: 'done' }, made_up: { x: 'filled' }, sign_off: { attribution_preference: 7 } },
  }) + '\n```';
  const r = parseAndValidate(raw, MSG);
  assert.deepEqual(r.taxonomy_updates, { role: 'Clerk', tasks_add: [{ label: 'invoices', frequency: 'weekly' }], pains_add: [], automation_candidates_add: [], time_costs_add: [] });
  assert.deepEqual(r.insights.map((i) => i.label), ['Manual re-keying of invoices into Sage', 'Untyped finding about invoices']);
  assert.deepEqual(r.insights[1], { type: 'task', label: 'Untyped finding about invoices', evidence_quote: insight().evidence_quote, implication: 'Blocks month end', time_per_week_hours: null, confidence: 0.9, second_hand: false });
  assert.equal(r.special_category_detected, true);
  assert.deepEqual(r.consent_updates, { attribution: null, memory_opt_in: true });
  assert.deepEqual(r.slot_updates, { warm_up: { role_confirmed: 'filled' } });
  assert.throws(() => parseAndValidate(JSON.stringify({ insights: [insight({ confidence: 1.2 })] }), MSG), /confidence out of range/);
  assert.throws(() => parseAndValidate(JSON.stringify({ insights: [insight({ evidence_quote: 5 })] }), MSG), /missing label or evidence_quote/);
  assert.throws(() => parseAndValidate('not json', MSG));
});

test('persistableInsights keeps only DB insight_type values', () => {
  const types = ['task', 'pain', 'automation_candidate', 'escalation', 'tooling_gap', 'dependency', 'time_cost', 'referral'];
  assert.deepEqual(persistableInsights(types.map((type) => ({ type }))).map((i) => i.type), types.slice(0, 4));
});

test('runExtraction retries once with the validation error, sums usage, and skips after two failures', async (t) => {
  quiet(t);
  assert.equal(EXTRACTION_MODEL, process.env.EXTRACTION_MODEL ?? 'claude-haiku-4-5');
  const requests = [];
  const replies = ['{broken', JSON.stringify({ insights: [insight()], slot_updates: { warm_up: { role_confirmed: 'partial' } } })];
  setExtractionClient({ messages: { create: async (req) => {
    requests.push(req);
    return { usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: replies.shift() }] };
  } } });
  try {
    const r = await runExtraction({ taxonomyState: { phase: 'warm_up' }, agentQuestion: 'How is Monday?', employeeMessage: MSG });
    assert.deepEqual(r.usage, { inputTokens: 20, outputTokens: 10 });
    assert.equal(r.insights.length, 1);
    assert.equal(requests.length, 2);
    const first = requests[0].messages[0].content;
    assert.ok(first.includes('INTERVIEWER: How is Monday?\n\nEMPLOYEE: ' + MSG));
    assert.ok(first.includes('ON_BEHALF MODE: false'));
    assert.ok(first.includes('{"phase":"warm_up"}'));
    assert.ok(first.endsWith(EXTRACTION_SLOT_ADDENDUM));
    assert.ok(!first.includes('{{'));
    assert.ok(requests[1].messages[0].content.includes('YOUR PREVIOUS OUTPUT FAILED VALIDATION:'));
    assert.equal(requests[0].temperature, 0);
    assert.equal(requests[0].max_tokens, 4000);
    assert.equal(requests[0].model, EXTRACTION_MODEL);

    requests.length = 0;
    setExtractionClient({ messages: { create: async (req) => { requests.push(req); return { usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'nope' }] }; } } });
    assert.equal(await runExtraction({ taxonomyState: null, agentQuestion: null, employeeMessage: 'x'.repeat(2001), onBehalf: true }), null);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].max_tokens, 12_000);
    assert.ok(requests[0].messages[0].content.includes('ON_BEHALF MODE: true'));
    assert.ok(requests[0].messages[0].content.includes('LATEST EXCHANGE:\nEMPLOYEE: x'));
  } finally {
    setExtractionClient(null);
  }
  assert.ok(EXTRACTION_PROMPT.includes('{{CURRENT_TAXONOMY_STATE}}'));
});

// ─── memory ──────────────────────────────────────────────────────────────────

test('buildMemoryBlob keeps summary-level fields only: top pains by hours, candidates by confidence', () => {
  const blob = buildMemoryBlob({
    sessionId: 's1', roleTitle: 'Clerk', unitName: 'Finance',
    insights: [
      { type: 'pain', label: 'Small pain', time_per_week_hours: 1, confidence: 0.9, evidence_quote: 'secret words' },
      { type: 'pain', label: 'Big pain', time_per_week_hours: 6, confidence: 0.5 },
      { type: 'pain', label: 'big pain ', time_per_week_hours: 5, confidence: 0.9 },
      { type: 'pain', label: 'No hours', time_per_week_hours: null, confidence: 0.9 },
      { type: 'pain', label: 'Mid pain', time_per_week_hours: 3, confidence: 0.9 },
      { type: 'automation_candidate', label: 'Auto low', time_per_week_hours: null, confidence: 0.4 },
      { type: 'automation_candidate', label: 'Auto high', time_per_week_hours: null, confidence: 0.9 },
      { type: 'task', label: 'Task', time_per_week_hours: 9, confidence: 1 },
    ],
    state: { open_threads: ['handover', '', 4, 'month end'] },
  });
  assert.deepEqual(blob.top_pains, [{ label: 'Big pain', hours_per_week: 6 }, { label: 'Mid pain', hours_per_week: 3 }, { label: 'Small pain', hours_per_week: 1 }]);
  assert.deepEqual(blob.automation_candidates, ['Auto high', 'Auto low']);
  assert.deepEqual(blob.working_style_notes, ['handover', 'month end']);
  assert.equal(blob.version, 1);
  assert.equal(blob.source_session_id, 's1');
  assert.ok(!JSON.stringify(blob).includes('secret words'));
  assert.deepEqual(buildMemoryBlob({ sessionId: 's', roleTitle: null, unitName: null, insights: [], state: null }).working_style_notes, []);
});

test('mergeMemoryBlob puts fresh items first, dedupes and re-caps', () => {
  const fresh = { version: 1, source_session_id: 's2', role_title: 'Lead', unit_name: 'Ops', top_pains: [{ label: 'A', hours_per_week: 1 }], automation_candidates: ['X'], working_style_notes: ['n1'], summarised_at: 'now' };
  assert.equal(mergeMemoryBlob(null, fresh), fresh);
  const merged = mergeMemoryBlob({ role_title: 'Old', top_pains: [{ label: 'a', hours_per_week: 9 }, { label: 'B', hours_per_week: 2 }, { label: 'C' }, { label: 'D' }], automation_candidates: ['x', 'Y'], working_style_notes: ['N1', 'n2'] }, fresh);
  assert.deepEqual(merged.top_pains.map((p) => p.label), ['A', 'B', 'C']);
  assert.deepEqual(merged.automation_candidates, ['X', 'Y']);
  assert.deepEqual(merged.working_style_notes, ['n1', 'n2']);
  assert.equal(merged.role_title, 'Lead');
});

test('renderMemoryBlob renders a present blob and returns null for an empty one', () => {
  assert.equal(renderMemoryBlob({}), null);
  assert.equal(renderMemoryBlob({ unit_name: 'Ops', working_style_notes: ['x'] }), null);
  const text = renderMemoryBlob({ role_title: 'Clerk', unit_name: 'Finance', summarised_at: '2026-07-14T10:00:00Z', top_pains: [{ label: 'Keying', hours_per_week: 3 }, { label: 'Chasing', hours_per_week: null }, { label: ' ' }], automation_candidates: ['OCR'], working_style_notes: ['brisk'] }, { participantName: ' Sam ' });
  assert.equal(text, [
    'A memory blob IS present: this is a returning participant who opted in to memory last time. Use the memory-hydrated opening, NOT the cold opening.',
    'Their name: Sam.', 'Last conversation: July 2026.', 'Role then: Clerk, in Finance.',
    'Pains they raised last time, most significant first (verify, do not rediscover):',
    '- Keying (about 3 hours/week)', '- Chasing',
    'Automation candidates they suggested:', '- OCR', 'Working-style notes:', '- brisk',
  ].join('\n'));
  assert.ok(renderMemoryBlob({ unit_name: 'Ops', automation_candidates: ['OCR'] }).includes('Unit then: Ops.'));
});

test('loadActiveMemoryBlob reads only opted-in unexpired rows of this organisation and degrades to null', async (t) => {
  quiet(t);
  const db = fakeDb(() => ({ data: [{ blob: { role_title: 'Clerk' } }] }));
  assert.deepEqual(await loadActiveMemoryBlob(db, 'p1', 'c1'), { role_title: 'Clerk' });
  assert.deepEqual(db.calls[0].filters.map(([op, c, v]) => `${op}:${c}${op === 'eq' ? `=${v}` : ''}`),
    ['eq:person_id=p1', 'eq:customer_id=c1', 'eq:opted_in=true', 'gt:expires_at']);
  // no organisation, no memory (and no query)
  const none = fakeDb(() => ({ data: [{ blob: { role_title: 'Clerk' } }] }));
  assert.equal(await loadActiveMemoryBlob(none, 'p1'), null);
  assert.equal(none.calls.length, 0);
  assert.equal(await loadActiveMemoryBlob(fakeDb(() => ({ data: [] })), 'p1', 'c1'), null);
  assert.equal(await loadActiveMemoryBlob(fakeDb(() => ({ data: [{ blob: 'str' }] })), 'p1', 'c1'), null);
  assert.equal(await loadActiveMemoryBlob(fakeDb(() => ({ error: { message: 'x' } })), 'p1', 'c1'), null);
});

test('ensurePersonForEmployee reuses or creates the person by Better Auth user id and links the employee', async () => {
  assert.equal(await ensurePersonForEmployee(fakeDb(), { id: 'e', person_id: 'p0', user_id: 'u0', email: 'x', name: 'n' }), 'p0');
  const db = fakeDb((q) => (q.table === 'person' && q.op === 'select' ? { data: [] } : q.op === 'insert' ? { data: { person_id: 'p9' } } : {}));
  assert.equal(await ensurePersonForEmployee(db, { id: 'e1', person_id: null, user_id: 'u1', email: ' Sam@Example.TEST ', name: 'Sam' }), 'p9');
  assert.deepEqual(db.calls[0].filters, [['eq', 'auth_user_id', 'u1']]);
  assert.deepEqual(db.calls[1].payload, { auth_user_id: 'u1', verified_email: 'sam@example.test', display_name: 'Sam' });
  assert.equal(db.calls[1].mode, 'single');
  assert.deepEqual([db.calls[2].table, db.calls[2].op, db.calls[2].payload, db.calls[2].filters], ['employee', 'update', { person_id: 'p9' }, [['eq', 'id', 'e1']]]);
  await assert.rejects(ensurePersonForEmployee(fakeDb(() => ({ error: { message: 'down' } })), { id: 'e', person_id: null, user_id: 'u', email: 'a@b.c', name: 'n' }), /person lookup failed: down/);
  // an unclaimed invitation has no person to make
  await assert.rejects(ensurePersonForEmployee(fakeDb(), { id: 'e', person_id: null, user_id: null, email: 'a@b.c', name: 'n' }), /not been claimed/);
});

test('ensurePersonForUser: found, created, and a lost create race', async () => {
  assert.equal(await ensurePersonForUser(fakeDb(() => ({ data: [{ person_id: 'p1' }] })), { userId: 'u', email: 'a@b.c' }), 'p1');
  let selects = 0;
  const race = fakeDb((q) => {
    if (q.op === 'select') return { data: selects++ ? [{ person_id: 'p2' }] : [] };
    return { error: { code: '23505', message: 'dup' } };
  });
  assert.equal(await ensurePersonForUser(race, { userId: 'u', email: 'a@b.c' }), 'p2');
  await assert.rejects(ensurePersonForUser(fakeDb((q) => (q.op === 'select' ? { data: [] } : { error: { code: 'XX', message: 'no' } })),
    { userId: 'u', email: 'a@b.c' }), /person create failed: no/);
});

const EMP = { id: 'emp1', person_id: null, user_id: 'u-sam', customer_id: 'c1', email: 'Sam@Example.test', name: 'Sam', role_title: 'Clerk' };
function signOffDb({ person = [], insights = [], state = createInitialTaxonomyState(), existingBlob = [] } = {}) {
  return fakeDb((q) => {
    if (q.table === 'person' && q.op === 'select') return { data: person };
    if (q.table === 'person' && q.op === 'insert') return { data: { person_id: 'p-new' } };
    if (q.table === 'insight' && q.op === 'select') return { data: insights };
    if (q.table === 'session' && q.op === 'select') return { data: [{ taxonomy_state: state }] };
    if (q.table === 'memory_blob' && q.op === 'select') return { data: existingBlob };
    return {};
  });
}

test('applySignOffConsent opt-in: consent pair, attribution on every insight, merged 24-month blob, slots ratcheted', async () => {
  const state = createInitialTaxonomyState();
  state.open_threads = ['handover'];
  const db = signOffDb({ person: [{ person_id: 'p1' }], insights: [{ type: 'pain', label: 'Keying', time_per_week_hours: 3, confidence: 0.9 }], state, existingBlob: [{ blob: { top_pains: [{ label: 'Old', hours_per_week: 1 }] } }] });
  const r = await applySignOffConsent(db, { employee: EMP, unitName: 'Finance', sessionId: 's1', choice: { attribution: 'anonymised', memory: true } });
  assert.deepEqual(r, { attributionRedacted: true, memoryOptedIn: true, personId: 'p1' });
  const [consent, redact] = db.calls;
  assert.deepEqual(consent.payload, [{ employee_id: 'emp1', kind: 'attribution', value: false }, { employee_id: 'emp1', kind: 'memory_opt_in', value: true }]);
  assert.deepEqual([redact.table, redact.op, redact.payload, redact.filters], ['insight', 'update', { attribution_redacted: true }, [['eq', 'session_id', 's1']]]);
  assert.deepEqual(db.calls.find((q) => q.table === 'memory_blob' && q.op === 'select').filters,
    [['eq', 'person_id', 'p1'], ['eq', 'customer_id', 'c1']]);
  const upsert = db.calls.find((q) => q.table === 'memory_blob' && q.op === 'upsert');
  assert.deepEqual(upsert.opts, { onConflict: 'person_id,customer_id' });
  assert.equal(upsert.payload.person_id, 'p1');
  assert.equal(upsert.payload.customer_id, 'c1');
  assert.equal(upsert.payload.opted_in, true);
  assert.deepEqual(upsert.payload.blob.top_pains.map((p) => p.label), ['Keying', 'Old']);
  assert.deepEqual(upsert.payload.blob.working_style_notes, ['handover']);
  assert.equal(upsert.payload.blob.role_title, 'Clerk');
  assert.equal(upsert.payload.blob.unit_name, 'Finance');
  const months = (new Date(upsert.payload.expires_at) - new Date(upsert.payload.opted_in_at)) / (30.44 * 86_400_000);
  assert.ok(Math.abs(months - MEMORY_RETENTION_MONTHS) < 0.5);
  const final = db.calls.at(-1);
  assert.equal(final.table, 'session');
  assert.equal(final.op, 'update');
  assert.equal(final.payload.taxonomy_state.slots.sign_off.attribution_preference, 'filled');
  assert.equal(final.payload.taxonomy_state.slots.sign_off.memory_opt_in_asked, 'filled');
  assert.equal(final.payload.taxonomy_state.slots.sign_off.insights_read_back, 'filled');
  assert.equal(final.payload.completion_score, 0.08);
});

test('applySignOffConsent opt-out hard-deletes this organisation\'s blob for a linked person', async () => {
  const db = signOffDb();
  const r = await applySignOffConsent(db, { employee: { ...EMP, person_id: 'p7' }, unitName: null, sessionId: 's1', choice: { attribution: 'named', memory: false } });
  assert.deepEqual(r, { attributionRedacted: false, memoryOptedIn: false, personId: 'p7' });
  assert.deepEqual(db.calls[1].payload, { attribution_redacted: false });
  const del = db.calls.find((q) => q.op === 'delete');
  assert.deepEqual([del.table, del.filters], ['memory_blob', [['eq', 'person_id', 'p7'], ['eq', 'customer_id', 'c1']]]);
  assert.equal(db.calls.some((q) => q.table === 'memory_blob' && q.op === 'upsert'), false);
  assert.equal(db.calls.some((q) => q.table === 'person'), false);
});

test('applySignOffConsent opt-out resolves an unlinked person by user id, and never creates one', async () => {
  const found = signOffDb({ person: [{ person_id: 'p3' }] });
  const r = await applySignOffConsent(found, { employee: EMP, unitName: null, sessionId: 's1', choice: { attribution: 'named', memory: false } });
  assert.equal(r.personId, 'p3');
  assert.deepEqual(found.calls.find((q) => q.table === 'person').filters, [['eq', 'auth_user_id', 'u-sam']]);
  assert.deepEqual(found.calls.find((q) => q.op === 'delete').filters, [['eq', 'person_id', 'p3'], ['eq', 'customer_id', 'c1']]);

  const none = signOffDb({ person: [] });
  const r2 = await applySignOffConsent(none, { employee: EMP, unitName: null, sessionId: 's1', choice: { attribution: 'named', memory: false } });
  assert.equal(r2.personId, null);
  assert.equal(none.calls.some((q) => q.op === 'delete'), false);
  assert.equal(none.calls.some((q) => q.table === 'person' && q.op === 'insert'), false);
});

test('applySignOffConsent refuses an employee row without an organisation', async () => {
  const db = signOffDb();
  await assert.rejects(applySignOffConsent(db, { employee: { ...EMP, customer_id: undefined }, unitName: null, sessionId: 's',
    choice: { attribution: 'named', memory: true } }), /no organisation/);
  assert.equal(db.calls.length, 0);
});

test('applySignOffConsent stops on a failed consent write', async () => {
  const db = fakeDb((q) => (q.table === 'consent_event' ? { error: { message: 'denied' } } : {}));
  await assert.rejects(applySignOffConsent(db, { employee: EMP, unitName: null, sessionId: 's', choice: { attribution: 'named', memory: false } }), /consent events failed: denied/);
  assert.equal(db.calls.length, 1);
});

// ─── coverage ────────────────────────────────────────────────────────────────

test('getLeaderCoverage returns status and counts for the leader sub-tree only', async () => {
  const units = [{ id: 'u1', name: 'Ops', path: 'root.ops' }, { id: 'u2', name: 'Ops North', path: 'root.ops.north' }, { id: 'u3', name: 'Opsx', path: 'root.opsx' }, { id: 'u4', name: 'Finance', path: 'root.fin' }];
  const people = [
    { id: 'a', name: 'A', role_title: 'Lead', unit_id: 'u1', status: 'started', portal_role: 'team_leader' },
    { id: 'b', name: 'B', role_title: null, unit_id: 'u2', status: 'completed', portal_role: 'employee' },
    { id: 'c', name: 'C', role_title: null, unit_id: 'u2', status: 'invited', portal_role: 'client_admin' },
    { id: 'd', name: 'D', role_title: null, unit_id: 'u3', status: 'invited', portal_role: 'employee' },
    { id: 'e', name: 'E', role_title: null, unit_id: null, status: 'declined', portal_role: 'employee' },
  ];
  const db = fakeDb((q) => ({ data: q.table === 'org_unit' ? units : people }));
  const cov = await getLeaderCoverage(db, { engagement: { id: 'eng' }, orgUnit: { path: 'root.ops' } });
  assert.deepEqual(cov.people, [
    { id: 'a', name: 'A', roleTitle: 'Lead', unitName: 'Ops', status: 'started', isLead: true },
    { id: 'b', name: 'B', roleTitle: null, unitName: 'Ops North', status: 'completed', isLead: false },
  ]);
  assert.deepEqual(cov.counts, { invited: 0, started: 1, completed: 1, declined: 0, total: 2 });
  assert.deepEqual(cov.units, [{ id: 'u1', name: 'Ops' }, { id: 'u2', name: 'Ops North' }]);
  assert.equal(db.calls[1].cols, 'id, name, role_title, unit_id, status, portal_role');
  assert.deepEqual((await getLeaderCoverage(db, { engagement: { id: 'eng' }, orgUnit: null })).counts.total, 0);
  await assert.rejects(getLeaderCoverage(fakeDb(() => ({ error: { message: 'x' } })), { engagement: { id: 'e' }, orgUnit: null }), /coverage unit lookup failed/);
});

// ─── employee ────────────────────────────────────────────────────────────────

const ctxRow = (empId, engId, created, role = 'employee', unit = { id: 'u1', name: 'Ops' }) => ({
  employee: { id: empId, engagement_id: engId, email: 'sam@example.test', portal_role: role },
  engagement: { id: engId, status: 'active', created_at: created, default_unit_id: 'u1' },
  org_unit: unit,
});

test('getEmployeeContextByUserId joins engagement and unit, keys on the user id and picks the newest engagement', async () => {
  const db = fakeDb(() => ({ data: [ctxRow('e-old', 'g1', '2026-01-01T00:00:00+00:00'), ctxRow('e-new', 'g2', '2026-03-01T00:00:00+00:00', 'employee', null)] }));
  const ctx = await getEmployeeContextByUserId(db, 'user-1');
  assert.deepEqual(ctx, { employee: { id: 'e-new', engagement_id: 'g2', email: 'sam@example.test', portal_role: 'employee' }, engagement: { id: 'g2', status: 'active', created_at: '2026-03-01T00:00:00+00:00', default_unit_id: 'u1' }, orgUnit: null });
  const q = db.calls[0];
  assert.match(q.sql, /JOIN engagement g ON g\.id = e\.engagement_id/);
  assert.match(q.sql, /LEFT JOIN org_unit u ON u\.id = e\.unit_id/);
  assert.match(q.sql, /g\.status = 'active'/);
  assert.match(q.sql, /e\.user_id = \$1/);
  assert.doesNotMatch(q.sql, /email/);
  assert.deepEqual(q.params, ['user-1']);
  // Same instant: tiebreak on engagement id, descending.
  const tie = fakeDb(() => ({ data: [ctxRow('x', 'aaa', 't'), ctxRow('y', 'bbb', 't')] }));
  assert.equal((await getEmployeeContextByUserId(tie, 'a')).employee.id, 'y');
  assert.equal(await getEmployeeContextByUserId(fakeDb(() => ({ data: [] })), 'a'), null);
  const noUser = fakeDb();
  assert.equal(await getEmployeeContextByUserId(noUser, ''), null);
  assert.equal(noUser.calls.length, 0);
  await assert.rejects(getEmployeeContextByUserId(fakeDb(() => ({ error: { message: 'x' } })), 'a'), /employee lookup failed: x/);
});

test('getEmployeeContextById and ForEngagement filter and limit to one row', async () => {
  const db = fakeDb(() => ({ data: [ctxRow('e1', 'g1', 't')] }));
  const byId = await getEmployeeContextById(db, 'e1');
  assert.equal(byId.orgUnit.name, 'Ops');
  assert.match(db.calls[0].sql, /AND e\.id = \$1 LIMIT 1$/);
  assert.deepEqual(db.calls[0].params, ['e1']);
  await getEmployeeContextForEngagement(db, 'user-1', 'g1');
  assert.match(db.calls[1].sql, /e\.user_id = \$1 AND e\.engagement_id = \$2 LIMIT 1$/);
  assert.deepEqual(db.calls[1].params, ['user-1', 'g1']);
  assert.equal(await getEmployeeContextById(fakeDb(() => ({ data: [] })), 'e1'), null);
});

test('isGreatstoneAdmin and getActiveEngagement', async () => {
  const db = fakeDb((q) => ({ data: q.sql ? [{ id: 'x' }] : [{ id: 'g1' }] }));
  assert.equal(await isGreatstoneAdmin(db, 'user-1'), true);
  assert.match(db.calls[0].sql, /e\.user_id = \$1 AND e\.portal_role = 'gs_admin' AND g\.status = 'active'/);
  assert.deepEqual(db.calls[0].params, ['user-1']);
  assert.equal(await isGreatstoneAdmin(fakeDb(() => ({ data: [] })), 'user-1'), false);
  assert.equal(await isGreatstoneAdmin(fakeDb(() => ({ data: [{ id: 'x' }] })), null), false);
  assert.deepEqual(await getActiveEngagement(db, 'g1'), { id: 'g1' });
  assert.deepEqual(db.calls[1].filters, [['eq', 'id', 'g1'], ['eq', 'status', 'active']]);
  assert.equal(await getActiveEngagement(fakeDb(() => ({ data: [] })), 'g1'), null);
});

test('getAdminContextForEngagement: member admin, lesser member, global admin provisioning, outsider', async () => {
  // Tier 1: client_admin on the engagement.
  const admin = fakeDb(() => ({ data: [ctxRow('e1', 'g1', 't', 'client_admin')] }));
  const A = { id: 'user-a', email: 'a@b' };
  assert.equal((await getAdminContextForEngagement(admin, A, 'g1')).employee.portal_role, 'client_admin');
  assert.deepEqual(admin.calls[0].params, ['user-a', 'g1']);
  // A lesser member is not an admin, and no global check runs.
  const member = fakeDb(() => ({ data: [ctxRow('e1', 'g1', 't', 'team_leader')] }));
  assert.equal(await getAdminContextForEngagement(member, A, 'g1'), null);
  assert.equal(member.calls.length, 1);
  // Tier 2: global gs_admin with no row: one upsert CTE returns the joined context.
  const calls = [];
  const global = fakeDb((q) => {
    calls.push(q);
    if (q.table === 'engagement') return { data: [{ id: 'g2', status: 'active', default_unit_id: 'u9' }] };
    if (q.sql?.startsWith('WITH up AS')) return { data: [ctxRow('new', 'g2', 't', 'gs_admin')] };
    if (q.sql?.includes("portal_role = 'gs_admin'")) return { data: [{ id: 'x' }] };
    return { data: [] };
  });
  const ctx = await getAdminContextForEngagement(global, { id: 'user-staff', email: 'Staff@Example.test' }, 'g2');
  assert.equal(ctx.employee.id, 'new');
  assert.equal(ctx.engagement.id, 'g2');
  const up = calls.find((q) => q.sql?.startsWith('WITH up AS'));
  assert.match(up.sql, /ON CONFLICT \(engagement_id, email\) DO UPDATE SET/);
  assert.deepEqual(up.params, ['g2', 'u9', 'Greatstone', 'staff@example.test', 'Greatstone Consultant', 'gs_admin', 'invited', 'user-staff']);
  // Outsider, and a caller without a user id.
  assert.equal(await getAdminContextForEngagement(fakeDb(() => ({ data: [] })), A, 'g1'), null);
  assert.equal(await getAdminContextForEngagement(admin, { email: 'a@b' }, 'g1'), null);
});

// ─── provision ───────────────────────────────────────────────────────────────

test('provision helpers', async () => {
  assert.equal(EMAIL_SHAPE.test('a@b.co'), true);
  assert.equal(EMAIL_SHAPE.test('a@b'), false);
  assert.equal(escapeIlike('a_b%c\\d'), 'a\\_b\\%c\\\\d');
  assert.deepEqual(await ensureSignInAccount('a@b.co', 'pw'), { ok: true });
});

test('provisionInvitee is idempotent for existing members', async () => {
  // by account
  const mine = fakeDb(() => ({ data: [{ id: 'e1', person_id: 'p1' }] }));
  assert.deepEqual(await provisionInvitee(mine, { engagementId: 'g', unitId: 'u', name: 'Sam', email: 'sam_x@y.z', userId: 'u1' }),
    { ok: true, employeeId: 'e1', personId: 'p1', alreadyMember: true });
  assert.deepEqual(mine.calls[0].filters, [['eq', 'engagement_id', 'g'], ['eq', 'user_id', 'u1']]);
  assert.equal(mine.calls.length, 1);
  // an invitation made on someone's behalf (no account yet): matched by email, nothing claimed
  const invite = fakeDb(() => ({ data: [{ id: 'e1', person_id: null, user_id: null }] }));
  assert.deepEqual(await provisionInvitee(invite, { engagementId: 'g', unitId: 'u', name: 'Sam', email: 'sam_x@y.z' }),
    { ok: true, employeeId: 'e1', personId: null, alreadyMember: true });
  assert.deepEqual(invite.calls[0].filters, [['eq', 'engagement_id', 'g'], ['ilike', 'email', 'sam\\_x@y.z']]);
  assert.equal(invite.calls.length, 1);
});

test('provisionInvitee claims an unclaimed invitation for the signed-in user, and refuses one claimed by another', async () => {
  const db = fakeDb((q) => {
    if (q.table === 'employee' && q.op === 'select') {
      return { data: q.filters.some(([, c]) => c === 'user_id') ? [] : [{ id: 'e5', person_id: null, user_id: null }] };
    }
    if (q.table === 'person' && q.op === 'select') return { data: [] };
    if (q.table === 'person' && q.op === 'insert') return { data: { person_id: 'p5' } };
    if (q.table === 'employee' && q.op === 'update') return { data: [{ id: 'e5' }] };
    return {};
  });
  const r = await provisionInvitee(db, { engagementId: 'g', unitId: 'u', name: 'Sam', email: 'sam@y.z', userId: 'u5' });
  assert.deepEqual(r, { ok: true, employeeId: 'e5', personId: 'p5', alreadyMember: true, claimed: true });
  assert.deepEqual(db.calls.find((q) => q.table === 'person' && q.op === 'insert').payload,
    { auth_user_id: 'u5', verified_email: 'sam@y.z', display_name: 'Sam' });
  const upd = db.calls.find((q) => q.op === 'update');
  assert.deepEqual([upd.payload, upd.filters], [{ user_id: 'u5', person_id: 'p5' }, [['eq', 'id', 'e5'], ['is', 'user_id', null]]]);

  const taken = fakeDb((q) => (q.table === 'employee' && q.op === 'select'
    ? { data: q.filters.some(([, c]) => c === 'user_id') ? [] : [{ id: 'e6', person_id: 'px', user_id: 'someone-else' }] } : {}));
  const t2 = await provisionInvitee(taken, { engagementId: 'g', unitId: 'u', name: 'Sam', email: 'sam@y.z', userId: 'u5' });
  assert.equal(t2.ok, false);
  assert.match(t2.message, /another account/);
  assert.equal(taken.calls.some((q) => q.op === 'update' || q.op === 'insert'), false);
});

test('provisionInvitee creates the person and employee, and treats a lost race as membership', async () => {
  const db = fakeDb((q) => {
    if (q.table === 'employee' && q.op === 'select') return { data: [] };
    if (q.table === 'person' && q.op === 'select') return { data: [] };
    if (q.table === 'person' && q.op === 'insert') return { data: { person_id: 'p2' } };
    if (q.table === 'employee' && q.op === 'insert') return { data: { id: 'e2' } };
    return {};
  });
  const r = await provisionInvitee(db, { engagementId: 'g', customerId: 'c1', unitId: 'u', name: 'Sam', email: 'sam@y.z', userId: 'u2',
    roleTitle: '  ', portalRole: 'team_leader', canDelegate: true, invitedBy: 'e0' });
  assert.deepEqual(r, { ok: true, employeeId: 'e2', personId: 'p2', alreadyMember: false });
  const ins = db.calls.find((q) => q.table === 'employee' && q.op === 'insert');
  assert.deepEqual(ins.payload, { engagement_id: 'g', customer_id: 'c1', person_id: 'p2', user_id: 'u2', unit_id: 'u', name: 'Sam',
    email: 'sam@y.z', role_title: null, portal_role: 'team_leader', status: 'invited', can_delegate: true, invited_by: 'e0' });
  assert.equal(ins.mode, 'single');

  // no account: an invitation row with no person and no user (person rows are for signed-in users only)
  const plain = fakeDb((q) => (q.table === 'employee' && q.op === 'insert' ? { data: { id: 'e4' } } : { data: [] }));
  assert.deepEqual(await provisionInvitee(plain, { engagementId: 'g', unitId: 'u', name: 'Sam', email: 'sam@y.z' }),
    { ok: true, employeeId: 'e4', personId: null, alreadyMember: false });
  assert.equal(plain.calls.some((q) => q.table === 'person'), false);
  assert.deepEqual([plain.calls.at(-1).payload.person_id, plain.calls.at(-1).payload.user_id], [null, null]);

  let empSelects = 0;
  const race = fakeDb((q) => {
    if (q.table === 'employee' && q.op === 'select') return { data: empSelects++ >= 2 ? [{ id: 'e3', person_id: 'p1' }] : [] };
    if (q.table === 'person') return { data: [{ person_id: 'p1' }] };
    if (q.table === 'employee' && q.op === 'insert') return { error: { code: '23505', message: 'dup' } };
    return {};
  });
  assert.deepEqual(await provisionInvitee(race, { engagementId: 'g', unitId: 'u', name: 'Sam', email: 's@y.z', userId: 'u3', portalRole: 'gs_admin', canDelegate: true }),
    { ok: true, employeeId: 'e3', personId: 'p1', alreadyMember: true });
  assert.equal(race.calls.find((q) => q.op === 'insert').payload.portal_role, 'employee');
  assert.equal(race.calls.find((q) => q.op === 'insert').payload.can_delegate, false);

  const fail = fakeDb((q) => (q.table === 'employee' && q.op === 'select' ? { error: { message: 'down' } } : {}));
  assert.deepEqual(await provisionInvitee(fail, { engagementId: 'g', unitId: 'u', name: 'S', email: 's@y.z' }), { ok: false, message: 'Could not check the invitation list: down' });
});

// ─── audit ───────────────────────────────────────────────────────────────────

test('logAudit caps the summary and never throws; getEngagementActivity maps rows newest first', async (t) => {
  quiet(t);
  const db = fakeDb(() => ({ data: [{ id: 'a1', action: 'invite.sent', summary: 's', actor_name: 'N', actor_email: 'e', created_at: 't' }] }));
  await logAudit(db, { engagementId: 'g', action: 'invite.sent', summary: 'x'.repeat(600) });
  assert.deepEqual(db.calls[0].payload, { engagement_id: 'g', actor_email: null, actor_name: null, action: 'invite.sent', summary: 'x'.repeat(500), target_id: null });
  await logAudit(fakeDb(() => { throw new Error('boom'); }), { engagementId: 'g', action: 'invite.sent', summary: 's' });
  await logAudit(fakeDb(() => ({ error: { message: 'x' } })), { engagementId: 'g', action: 'invite.sent', summary: 's' });
  assert.deepEqual(await getEngagementActivity(db, 'g'), [{ id: 'a1', action: 'invite.sent', summary: 's', actorName: 'N', actorEmail: 'e', at: 't' }]);
  assert.deepEqual(db.calls[1].order, ['created_at', { ascending: false }]);
  assert.equal(db.calls[1].limit, 30);
  assert.deepEqual(await getEngagementActivity(fakeDb(() => ({ error: { message: 'x' } })), 'g', 5), []);
});

// ─── outbox ──────────────────────────────────────────────────────────────────

test('outbox idempotency keys follow the integration contract', () => {
  const p = (event, extra = {}) => ({ event, engagement: { id: 'g' }, session: { id: 's', phase: 'pain_mapping', ...extra } });
  assert.equal(outboxIdempotencyKey({ payload: p('session_start') }), 's:session_start');
  assert.equal(outboxIdempotencyKey({ payload: p('session_end') }), 's:session_end');
  assert.equal(outboxIdempotencyKey({ payload: p('phase_complete') }), 's:phase_complete:pain_mapping');
  assert.equal(outboxIdempotencyKey({ payload: p('phase_complete'), phase: 'warmup' }), 's:phase_complete:warmup');
  assert.equal(outboxIdempotencyKey({ payload: p('phase_complete'), correctionTurnCount: 0 }), 's:correction:0');
  assert.equal(outboxIdempotencyKey({ payload: p('session_paused') }), 's:session_paused:0');
  assert.equal(outboxIdempotencyKey({ payload: p('session_paused', { turn_count: 4 }) }), 's:session_paused:4');
  assert.equal(outboxIdempotencyKey({ payload: p('session_paused', { turn_count: 4 }), turnCount: 9 }), 's:session_paused:9');
});

test('enqueueOutboxEvent upserts into outbox ignoring duplicates and never throws', async (t) => {
  quiet(t);
  const db = fakeDb();
  const payload = { event: 'session_end', engagement: { id: 'g', client_name: 'Example' }, employee: {}, session: { id: 's', phase: 'sign_off', completion_score: 1 } };
  await enqueueOutboxEvent(db, { payload });
  assert.deepEqual(db.calls[0], { table: 'outbox', op: 'upsert', cols: null, filters: [], payload: { idempotency_key: 's:session_end', engagement_id: 'g', payload, status: 'pending' }, opts: { onConflict: 'idempotency_key', ignoreDuplicates: true }, mode: null, limit: null });
  await enqueueOutboxEvent(fakeDb(() => { throw new Error('x'); }), { payload });
  await enqueueOutboxEvent(fakeDb(() => ({ error: { message: 'x' } })), { payload });
  assert.equal(scheduleOutboxDrain(), undefined);
});

// ─── login-link ──────────────────────────────────────────────────────────────

test('hashLoginToken is sha256 hex', () => {
  assert.equal(hashLoginToken('abc'), createHash('sha256').update('abc').digest('hex'));
  assert.equal(DEFAULT_LINK_DAYS, 14);
});
