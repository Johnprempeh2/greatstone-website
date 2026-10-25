// Synthesis pipeline suite (GRE-2612). Ports scripts/fuzzy-merge-test.mjs and
// scripts/corroboration-test.mjs of the source @505ba6a to node:test, and adds the quote gate, the
// renderer invariants, the hierarchical roll-up and the release gate (released-only read).
// No network and no database: an in-memory supabase-shaped fake db and a fake Anthropic client.
// Port: corroboration-test seeded a real Postgres and spawned synthesis-brief.mjs; here the same
// seed goes into the fake db and buildSynthesisBrief runs in-process.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  canonicaliseLabels, labelSimilarity, normalise, quoteWithinSource, quoteLengthOk,
  validateThemes, validateRecommendations, validateHeadline, validateFollowUps, buildAttribution,
  computeGroupConfidence, bandFor, LABEL_SIMILARITY_THRESHOLD,
} from '../functions/lib/interview/synthesis/invariants.mjs';
import { isIdentityToken, suppressIdentityItems } from '../functions/lib/interview/synthesis/suppression.mjs';
import { loadSynthesisData, SUMMARY_PROMPT_VERSION } from '../functions/lib/interview/synthesis/data.mjs';
import { computeHotSpots } from '../functions/lib/interview/synthesis/hotspots.mjs';
import { buildUnitPlan } from '../functions/lib/interview/synthesis/rollup.mjs';
import { setSynthesisClient, SYNTHESIS_MODEL, synthesisCostPence } from '../functions/lib/interview/synthesis/model.mjs';
import { runSynthesisStep, verifyForRender } from '../functions/lib/interview/synthesis/pipeline.mjs';
import { buildSynthesisBrief } from '../functions/lib/interview/synthesis/brief.mjs';
import { RULES_VERSION } from '../functions/lib/interview/synthesis/types.mjs';
import {
  runSynthesis, releaseSynthesis, withdrawRelease, unreleaseSynthesis, getReleasedSynthesis,
  getLatestSynthesis,
} from '../functions/lib/interview/synthesis/release.mjs';
import { SYNTHESIS_SUMMARISER_PROMPT } from '../functions/lib/interview/prompts/synthesis-prompts.mjs';

// ─── Fake data plane: the supabase-js surface the synthesis code uses ─────────

function fakeDb(seed = {}) {
  const tables = structuredClone(seed);
  const t = (name) => (tables[name] ??= []);
  const fail = {};
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.op = 'select'; }
    select() { return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    order(c, { ascending = true } = {}) { this.ord = { c, ascending }; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    single() { this.mode = 'single'; return this; }
    insert(rows) { this.op = 'insert'; this.rows = [].concat(rows); return this; }
    update(patch) { this.op = 'update'; this.patch = patch; return this; }
    upsert(rows, { onConflict }) { this.op = 'upsert'; this.rows = [].concat(rows); this.keys = onConflict.split(','); return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }
    run() {
      if (fail[`${this.name}.${this.op}`]) return { data: null, error: { message: fail[`${this.name}.${this.op}`] } };
      const rows = t(this.name);
      const match = (r) => this.filters.every((f) => f(r));
      // jsonb round trip: what is stored and read back is a copy, never the caller's object.
      if (this.op === 'insert') {
        const added = this.rows.map((r) => ({ id: randomUUID(), generated_at: new Date().toISOString(), ...structuredClone(r) }));
        rows.push(...added);
        return this.shape(added);
      }
      if (this.op === 'upsert') {
        for (const r of this.rows) {
          const i = rows.findIndex((x) => this.keys.every((k) => x[k] === r[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...structuredClone(r) }; else rows.push(structuredClone(r));
        }
        return { data: null, error: null };
      }
      if (this.op === 'update') {
        for (const r of rows.filter(match)) Object.assign(r, structuredClone(this.patch));
        return { data: null, error: null };
      }
      let out = rows.filter(match).map((r) => structuredClone(r));
      if (this.ord) {
        const { c, ascending } = this.ord;
        out.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (this.lim !== undefined) out = out.slice(0, this.lim);
      return this.shape(out);
    }
    shape(out) {
      if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
      if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not single' } };
      return { data: out, error: null, count: out.length };
    }
  }
  return { tables, fail, from: (name) => new Query(name), rpc: async () => ({ data: null, error: null }), sql: async () => ({ data: [], error: null }) };
}

// ─── Fake model: answers by prompt kind, echoes real insight quotes ───────────

const SUMMARISER = 'You are the per-interview summariser';
const UNIT = 'You are the unit-level synthesiser';
const COORDINATOR = 'You are the synthesis coordinator';

function insightsFromSummariserPrompt(prompt) {
  const start = prompt.indexOf('VALIDATED INSIGHTS (the only evidence you may use):\n') + 'VALIDATED INSIGHTS (the only evidence you may use):\n'.length;
  return JSON.parse(prompt.slice(start, prompt.indexOf('\n\nINTERVIEW STATE')));
}

function echoSummary(prompt) {
  const { participant_id, insights } = insightsFromSummariserPrompt(prompt);
  return {
    employee_ref: participant_id, role: 'team member', second_hand: false,
    top_pains: insights.map((i) => ({ label: i.label, detail: 'Detail.', frequency: null, time_per_week_hours: 99, insight_id: i.id, quote: i.evidence_quote, confidence: 1 })),
    time_costs_total_hours_per_week: 999, automation_candidates: [],
    notable_quotes: insights.map((i) => ({ insight_id: i.id, quote: i.evidence_quote })),
    referrals: [], uncertain: [], follow_up_signal: 0.4,
  };
}

function fakeModel({ summary = echoSummary, unit, coordinator = () => ({}) } = {}) {
  const calls = [];
  const client = {
    calls,
    messages: {
      create: async (params) => {
        const prompt = params.messages[0].content;
        calls.push({ params, prompt });
        let out;
        if (prompt.startsWith(SUMMARISER)) out = summary(prompt);
        else if (prompt.startsWith(UNIT)) {
          const unitId = /unit id: (\S+)/.exec(prompt)[1];
          const name = /working on the unit "([^"]+)"/.exec(prompt)[1];
          out = unit ? unit(prompt, unitId) : { unit_id: unitId, candidate_themes: [], automation_candidates: [], follow_ups: [], open_questions: [`Open question from ${name}?`] };
        } else if (prompt.startsWith(COORDINATOR)) out = coordinator(prompt);
        else throw new Error('unexpected prompt');
        return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 200 } };
      },
    },
  };
  setSynthesisClient(client);
  return client;
}

// ─── Seed builder (the corroboration-test shape) ─────────────────────────────

function seedEngagement() {
  const seed = { engagement: [], org_unit: [], employee: [], session: [], turn: [], insight: [] };
  const eng = { id: 'eng-1', client_name: 'ZZ Test Client', status: 'active', seat_total: 10, released_synthesis_id: null, released_at: null, released_by: null };
  seed.engagement.push(eng);
  const unit = (id, name, path, parent_id = null) => { seed.org_unit.push({ id, engagement_id: eng.id, parent_id, name, kind: 'team', path }); return id; };
  let n = 0;
  const person = ({ name, unitId = null, role = 'team member', leader_track = null, phase = 'sign_off', ended = true, is_test = false, turns = [], insights = [] }) => {
    n += 1;
    const emp = { id: `emp-${n}`, engagement_id: eng.id, person_id: null, unit_id: unitId, name, role_title: role, portal_role: 'employee', status: 'completed', leader_track };
    seed.employee.push(emp);
    const sess = { id: `sess-${n}`, employee_id: emp.id, started_at: `2026-06-0${n}T09:00:00.000Z`, ended_at: ended ? `2026-06-0${n}T09:30:00.000Z` : null, phase, completion_score: '0.9', taxonomy_state: {}, is_test };
    seed.session.push(sess);
    for (const content of turns) seed.turn.push({ session_id: sess.id, role: 'user', content });
    insights.forEach((i, k) => seed.insight.push({ id: `ins-${n}-${k + 1}`, session_id: sess.id, type: 'pain', label: 'x', evidence_quote: null, time_per_week_hours: null, confidence: '0.9', attribution_redacted: false, second_hand: false, ...i }));
    return emp;
  };
  return { seed, eng, unit, person };
}

function corroborationSeed() {
  const s = seedEngagement();
  const ops = s.unit('unit-ops', 'Ops', 'ops');
  s.person({
    name: 'Alice', unitId: ops,
    turns: ['Honestly the worst part of my week is the manual invoice keying, I spend about ten hours keying invoice lines into Sage by hand.'],
    insights: [
      { label: 'Manual invoice keying', evidence_quote: 'I spend about ten hours keying invoice lines into Sage by hand', confidence: '0.9' },
      // a DISTINCT single-voice pain that must NOT be promoted
      { label: 'Parking at the office is hard', evidence_quote: 'finding a parking space at the office in the morning is genuinely hard', confidence: '0.85' },
    ],
  });
  s.person({
    name: 'Bob', unitId: ops,
    turns: ['For me it is the manual invoice keying as well, re-entering all those invoice lines into Sage by hand eats my mornings entirely.'],
    insights: [{ label: 'Manual invoice keying slow', evidence_quote: 're-entering all those invoice lines into Sage by hand eats my mornings entirely', confidence: '0.9' }],
  });
  return s;
}

// ─── Prepared-insight helper for the pure invariant checks ───────────────────

const QA = 'every single week I lose most of Monday to keying invoices by hand';
const QB = 'the approvals sit in somebody inbox for days before anyone looks at them';
function prepared({ id, employee = 'e1', person = null, unitId = 'u1', unitName = 'Ops', quote = QA, confidence = 0.8, secondHand = false, quoteEligible = true, redacted = false, hours = null, name = 'Pat', role = 'Analyst' }) {
  const emp = { id: employee, person_id: person, unit_id: unitId, name, role_title: role, leader_track: secondHand ? 'on_behalf' : null };
  return {
    row: { id, session_id: `s-${employee}`, type: 'pain', label: 'l', evidence_quote: quote, time_per_week_hours: hours, confidence, attribution_redacted: redacted, second_hand: secondHand },
    employee: emp, session: { id: `s-${employee}` }, unitId, unitName, voiceKey: person ?? employee, secondHand, confidence, quoteEligible,
  };
}
function ctxOf(insights, redacted = []) {
  return {
    insightById: new Map(insights.map((i) => [i.row.id, i])),
    employeesById: new Map(insights.map((i) => [i.employee.id, i.employee])),
    unitNameById: new Map(insights.map((i) => [i.unitId, i.unitName])),
    redactedEmployeeIds: new Set(redacted),
  };
}

// ═══ fuzzy-merge-test.mjs ═════════════════════════════════════════════════════

function clusters(labels) {
  const map = canonicaliseLabels(labels);
  const byCluster = new Map();
  for (const l of labels) {
    const norm = l.toLowerCase().trim();
    const id = map.get(norm) ?? `(self:${norm})`;
    if (!byCluster.has(id)) byCluster.set(id, []);
    byCluster.get(id).push(l);
  }
  return [...byCluster.values()];
}

test('fuzzy merge CORRECTNESS: unrelated labels sharing one token never merge', () => {
  assert.equal(LABEL_SIMILARITY_THRESHOLD, 0.6);
  assert.equal(clusters(['invoice approval delays', 'approval of new staff members']).length, 2, 'one-shared-token labels stay separate');
  assert.equal(clusters(['meeting overload eats my week', 'car parking is a nightmare']).length, 2, 'wholly unrelated labels stay separate');
  // antonym pair: characterisation only in the source script (always passes); recorded here.
  clusters(['the reports are too slow', 'the reports are too fast']);
});

test('fuzzy merge COVERAGE: obvious-same variants merge', () => {
  assert.equal(clusters(['Reporting', 'the reporting', 'reporting']).length, 1, 'single-token concept variants merge (stopword diff)');
  assert.equal(clusters(['invoice keying', 'keying invoices']).length, 1, 'word-order / plural variants merge (consistent stemmer)');
  assert.equal(clusters(['invoice keying', 'invoice keying slow']).length, 1, 'one-extra-token near-duplicate merges');
});

test('fuzzy merge CHARACTERISATION: similarity samples', () => {
  assert.ok(labelSimilarity('invoice keying', 'invoice keying slow') >= 0.6);
  assert.ok(labelSimilarity('invoice approval delays', 'approval of new staff members') < 0.6);
  assert.equal(labelSimilarity('', 'anything'), 0, 'empties never merge');
  // genuine paraphrases with little lexical overlap are NOT merged (conservative by design)
  assert.ok(clusters(['manual invoice keying into sage', 're-entering supplier invoices by hand', 'hand entry of invoice data']).length >= 2);
});

// ═══ corroboration-test.mjs (two-voice rule) ═════════════════════════════════

test('corroboration: two people on the same pain in different words promote one pattern; a single voice does not', async () => {
  const { seed, eng } = corroborationSeed();
  const db = fakeDb(seed);
  fakeModel();
  const res = await buildSynthesisBrief(db, eng.id, { stepOptions: { maxModelCalls: 1000 } });
  assert.ok(res.stats.patternsPromoted >= 1, `shared pain corroborated into a promoted multi-voice pattern — promoted=${res.stats.patternsPromoted}`);
  assert.equal(res.stats.patternsPromoted, 1);
  assert.equal(res.stats.patternsNeedingCorroboration, 1);
  assert.match(res.markdown, /### `PROMOTED` Manual invoice keying[^\n]*\n2 voices · 2 first-hand/);
  assert.match(res.markdown, /### `NEEDS CORROBORATION` Parking at the office is hard\n1 voice · 1 first-hand/);
  assert.ok(!/`PROMOTED` Parking/.test(res.markdown), 'parking (1 voice) is never promoted');
  assert.equal(res.version, 1);
  assert.equal(res.stats.interviewsIncluded, 2);
  assert.match(res.markdown, /Mean interview completion score: \*\*90%\*\*/, 'numeric completion_score coerced, not string-concatenated');
});

test('two-voice rule: one person saying it twice is one voice; an on-behalf voice alone cannot promote', async () => {
  const s = seedEngagement();
  const ops = s.unit('unit-ops', 'Ops', 'ops');
  const quote1 = 'I spend about ten hours keying invoice lines into Sage by hand';
  const quote2 = 'keying invoice lines into Sage by hand takes the whole of Monday';
  s.person({ name: 'Solo', unitId: ops, turns: [`${quote1}. And ${quote2}.`], insights: [
    { label: 'Manual invoice keying', evidence_quote: quote1 }, { label: 'Manual invoice keying slow', evidence_quote: quote2 }] });
  s.person({ name: 'Lead', unitId: ops, leader_track: 'on_behalf', turns: [`My team say ${quote1}`], insights: [{ label: 'Approval chasing everywhere', evidence_quote: quote1 }] });
  s.person({ name: 'Lead2', unitId: ops, leader_track: 'on_behalf', turns: [`Mine too: ${quote1}`], insights: [{ label: 'Approval chasing everywhere', evidence_quote: quote1 }] });
  const db = fakeDb(s.seed);
  fakeModel();
  const res = await buildSynthesisBrief(db, s.eng.id);
  assert.equal(res.stats.patternsPromoted, 0);
  assert.match(res.markdown, /`NEEDS CORROBORATION` Manual invoice keying[^\n]*\n1 voice · 1 first-hand/);
  assert.match(res.markdown, /`NEEDS CORROBORATION` Approval chasing everywhere\n2 voices · 0 first-hand · includes second-hand/);
});

// ═══ Quote gate ═══════════════════════════════════════════════════════════════

test('quote gate at load: >= 30 chars, >= 7 words, verbatim in a participant turn of its own session', async () => {
  const s = seedEngagement();
  const ops = s.unit('unit-ops', 'Ops', 'ops');
  s.person({ name: 'Ann', unitId: ops,
    turns: ['Honestly   EVERY single week I lose most of Monday\nto keying invoices by hand.', 'too short here'],
    insights: [
      { label: 'ok', evidence_quote: 'every single week I lose most of Monday to keying invoices by hand' },
      { label: 'short', evidence_quote: 'too short here' },
      { label: 'not said', evidence_quote: 'this sentence was never said by the participant in any turn' },
      { label: 'escalation', type: 'escalation', evidence_quote: 'every single week I lose most of Monday to keying invoices by hand' },
      { label: 'nullconf', confidence: null, evidence_quote: 'every single week I lose most of Monday to keying invoices by hand' },
    ] });
  // an assistant turn never counts as evidence
  s.seed.turn.push({ session_id: 'sess-1', role: 'assistant', content: 'this sentence was never said by the participant in any turn' });
  s.person({ name: 'Partial', unitId: ops, phase: 'pain_mapping', turns: ['the approvals sit in somebody inbox for days before anyone looks at them'],
    insights: [{ label: 'p', evidence_quote: 'the approvals sit in somebody inbox for days before anyone looks at them', confidence: '0.95' }] });
  s.person({ name: 'Live', unitId: ops, phase: 'automation', ended: false, insights: [{ label: 'live' }] });
  s.person({ name: 'Tester', unitId: ops, is_test: true, insights: [{ label: 'test run' }] });
  s.person({ name: 'Early', unitId: ops, phase: 'day_in_life', insights: [{ label: 'early' }] });

  const data = await loadSynthesisData(fakeDb(s.seed), s.eng.id, false);
  const byLabel = Object.fromEntries(data.insights.map((i) => [i.row.label, i]));
  assert.equal(byLabel.ok.quoteEligible, true, 'whitespace- and case-normalised verbatim match');
  assert.equal(byLabel.short.quoteEligible, false, 'below the 30-char / 7-word floor');
  assert.equal(byLabel['not said'].quoteEligible, false, 'not in a participant turn');
  assert.equal(byLabel.escalation, undefined, 'escalations excluded (invariant 8)');
  assert.ok(data.loadLog.some((l) => l.subject === 'escalations' && /1 escalation-type/.test(l.reason)));
  assert.equal(byLabel.nullconf.confidence, null);
  assert.equal(byLabel.ok.confidence, 0.9, 'numeric string coerced');
  assert.equal(byLabel.p.confidence, 0.7, 'partial session capped at 0.7');
  assert.deepEqual(data.eligible.map((e) => [e.employee.name, e.complete, e.partial]), [['Ann', true, false], ['Partial', false, true]]);
  assert.equal(data.eligible[0].fingerprint, `2026-06-01T09:30:00.000Z|5|${SUMMARY_PROMPT_VERSION}`);

  const relaxed = await loadSynthesisData(fakeDb(s.seed), s.eng.id, true);
  assert.deepEqual(relaxed.eligible.map((e) => e.employee.name).sort(), ['Ann', 'Early', 'Live', 'Partial'], 'relaxed admits in-flight sessions with insights, never test runs');
  assert.ok(relaxed.relaxed && relaxed.loadLog.some((l) => l.subject === 'eligibility'));
});

test('quote mechanics: one [...] elision, bracketed referents, length limits', () => {
  const src = 'We wait for the finance team to approve every invoice and it takes about three days each time';
  assert.ok(quoteWithinSource('We wait for the finance team [...] it takes about three days', src));
  assert.ok(quoteWithinSource('and it [the approval] takes about three days each time', src), 'bracketed referent is not matched');
  assert.ok(!quoteWithinSource('We wait [...] finance [...] three days', src), 'more than one elision rejected');
  assert.ok(!quoteWithinSource('it takes about three days [...] We wait', src), 'segments must be in order');
  assert.ok(!quoteWithinSource('anything', ''), 'empty source never matches');
  assert.equal(quoteLengthOk('too short a quote').ok, false);
  assert.equal(quoteLengthOk(Array(61).fill('word').join(' ')).reason, 'above the 60-word maximum');
  assert.equal(quoteLengthOk(QA).ok, true);
});

test('summariser quote gate: non-contiguous quotes dropped, fragments kept without a quote, confidence and hours from the row', async () => {
  const s = seedEngagement();
  const ops = s.unit('unit-ops', 'Ops', 'ops');
  const long = 'I spend about ten hours every week keying invoice lines into Sage by hand';
  s.person({ name: 'Dana', unitId: ops, role: 'DX Lead', turns: [long], insights: [{ label: 'Invoice keying', evidence_quote: long, confidence: '0.6', time_per_week_hours: '10' }] });
  const db = fakeDb(s.seed);
  fakeModel({ summary: () => ({
    role: 'DX Lead',
    top_pains: [
      { label: 'Invoice keying', insight_id: 'ins-1-1', quote: 'keying invoice lines', confidence: 0.99, time_per_week_hours: 40 },
      { label: 'Invoice keying fabricated', insight_id: 'ins-1-1', quote: 'I love keying invoices', confidence: 0.5 },
      { label: 'DX Lead', insight_id: 'ins-1-1', quote: long, confidence: 0.5 },
      { label: 'Unknown', insight_id: 'nope', quote: long, confidence: 0.5 },
    ],
    notable_quotes: [{ insight_id: 'ins-1-1', quote: long }, { insight_id: 'ins-1-1', quote: 'by hand' }],
    follow_up_signal: 7,
  }) });
  const step = await runSynthesisStep(db, s.eng.id, { maxModelCalls: 1 });
  assert.equal(step.phase, 'units');
  const cached = db.tables.synthesis_cache.find((r) => r.kind === 'session');
  assert.equal(cached.model, SYNTHESIS_MODEL);
  const { payload } = cached;
  assert.equal(payload.top_pains.length, 1);
  assert.deepEqual(
    { quote: payload.top_pains[0].quote, confidence: payload.top_pains[0].confidence, hours: payload.top_pains[0].time_per_week_hours },
    { quote: '', confidence: 0.6, hours: 10 }, 'fragment kept without its quote; lower confidence wins; hours from the insight row');
  assert.equal(payload.time_costs_total_hours_per_week, 10, 'model arithmetic never trusted');
  assert.deepEqual(payload.notable_quotes, [{ insight_id: 'ins-1-1', quote: long }]);
  assert.equal(payload.follow_up_signal, 1);
  assert.equal(step.usage.calls, 1, 'usage still recorded');
});

// ═══ Invariants ═══════════════════════════════════════════════════════════════

test('invariants 2 and 3: two distinct voices with at least one first-hand, re-derived in code', () => {
  const a = prepared({ id: 'a', employee: 'e1' });
  const a2 = prepared({ id: 'a2', employee: 'e1', quote: QB });
  const b = prepared({ id: 'b', employee: 'e2', quote: QB, unitId: 'u2', unitName: 'Finance', confidence: 0.6 });
  const sh1 = prepared({ id: 'sh1', employee: 'e3', secondHand: true, confidence: 0.7 });
  const sh2 = prepared({ id: 'sh2', employee: 'e4', secondHand: true, quote: QB, confidence: 0.7 });
  const ctx = ctxOf([a, a2, b, sh1, sh2]);
  const q = (i) => ({ insight_id: i.row.id, quote: i.row.evidence_quote });
  const log = [];
  const themes = validateThemes([
    { theme_id: 'one-voice', title: 'One voice', evidence_quotes: [q(a), q(a2)], distinct_voices: 5 },
    { theme_id: 'on-behalf-only', title: 'Hearsay', evidence_quotes: [q(sh1), q(sh2)] },
    { theme_id: 'good', title: 'Invoice keying', evidence_quotes: [q(a), q(b), q(b)], confidence: 0.99 },
    { theme_id: 'mixed', title: 'Mixed', evidence_quotes: [q(a), q(sh1)] },
  ], ctx, log);
  assert.deepEqual(themes.map((t) => t.theme_id), ['good', 'mixed']);
  assert.ok(log.some((l) => l.kind === 'theme_demoted' && l.subject === 'theme "One voice"'));
  assert.ok(log.some((l) => l.kind === 'open_question' && /Only one voice currently supports "One voice"/.test(l.reason)));
  assert.ok(log.some((l) => l.kind === 'theme_dropped' && /no first-hand voice/.test(l.reason)));
  const good = themes[0];
  assert.equal(good.distinct_voices, 2);
  assert.equal(good.scope, 'cross_team');
  assert.equal(good.evidence_quotes.length, 2, 'deduped by insight');
  assert.equal(good.confidence, 0.7, 'mean of 0.8 and 0.6, never the model value');
  const mixed = themes[1];
  assert.equal(mixed.scope, 'team_local');
  assert.equal(mixed.includes_second_hand, true);
  assert.ok(mixed.confidence <= 0.75);
  assert.equal(mixed.evidence_quotes[1].second_hand, true, 'second-hand forced from the row (invariant 5)');
  assert.match(mixed.evidence_quotes[1].attribution, /via team leader on behalf of Ops$/);
});

test('invariants 1 and 4: unverifiable quotes and null confidence never back a claim', () => {
  const ok = prepared({ id: 'ok', employee: 'e1' });
  const unverified = prepared({ id: 'unv', employee: 'e2', quoteEligible: false });
  const noConf = prepared({ id: 'nc', employee: 'e3', confidence: null });
  const ctx = ctxOf([ok, unverified, noConf]);
  const log = [];
  const themes = validateThemes([{ title: 'T', evidence_quotes: [
    { insight_id: 'ok', quote: QA }, { insight_id: 'unv', quote: QA }, { insight_id: 'nc', quote: QA },
    { insight_id: 'ghost', quote: QA }, { insight_id: 'ok', quote: 'invented words never spoken by anyone at all here' }, { quote: QA }] }], ctx, log);
  assert.equal(themes.length, 0);
  const reasons = log.map((l) => l.reason).join('\n');
  assert.match(reasons, /fails contract 6.1/);
  assert.match(reasons, /carries no confidence value \(invariant 4\)/);
  assert.match(reasons, /cites unknown insight ghost/);
  assert.match(reasons, /not a contiguous span/);
  assert.match(reasons, /quote missing insight_id or text/);
  assert.ok(log.some((l) => l.kind === 'theme_demoted'));
});

test('invariant 6: redacted people are never named; invariant 7: first-hand hours only on recommendations', () => {
  const red = prepared({ id: 'r', employee: 'e1', redacted: true, hours: 4, name: 'Secret Person', role: 'Analyst' });
  const named = prepared({ id: 'n', employee: 'e2', quote: QB, hours: 3 });
  const onBehalf = prepared({ id: 'ob', employee: 'e3', secondHand: true, hours: 50 });
  const ctx = ctxOf([red, named, onBehalf], ['e1']);
  assert.equal(buildAttribution(red, ctx), 'A analyst in Ops');
  assert.equal(buildAttribution(named, ctx), 'Pat, Analyst (Ops)');
  const log = [];
  const recs = validateRecommendations([
    { rec_id: 'r1', title: 'Automate keying', impact: 4, feasibility: 3, evidence_quotes: [{ insight_id: 'r', quote: QA }, { insight_id: 'n', quote: QB }, { insight_id: 'ob', quote: QA }] },
    { rec_id: 'bad', title: 'Bad scores', impact: 6, feasibility: 3, evidence_quotes: [{ insight_id: 'r', quote: QA }] },
    { rec_id: 'none', title: 'No evidence', impact: 2, feasibility: 2, evidence_quotes: [] },
  ], ctx, log);
  assert.deepEqual(recs.map((r) => r.rec_id), ['r1']);
  assert.equal(recs[0].estimated_hours_per_week, 7, 'on-behalf 50 h never blended in');
  assert.ok(!JSON.stringify(recs).includes('Secret Person'));
  assert.ok(log.some((l) => l.kind === 'recommendation_dropped' && /1 to 5/.test(l.reason)));
  const fus = validateFollowUps([{ employee_ref: 'e1', question: 'Q?', related_insight_ids: ['r', 'ghost'] }, { employee_ref: 'nobody', question: 'Q?' }, { employee_ref: 'e2' }], ctx, log);
  assert.deepEqual(fus, [{ employee_id: 'e1', display_name: 'A analyst in Ops', question: 'Q?', reason: '', related_insight_ids: ['r'] }]);
  assert.equal(log.filter((l) => l.kind === 'follow_up_dropped').length, 2);
  assert.equal(validateHeadline({ text: 'Headline', supporting_insight_ids: ['r', 'n'] }, ctx, log), null, 'headline needs 3 verifiable insights');
  assert.deepEqual(validateHeadline({ text: 'Headline', supporting_insight_ids: ['r', 'n', 'ob', 'ghost'] }, ctx, log).supporting_insight_ids, ['r', 'n', 'ob']);
});

test('confidence rule 5.3.5 and bands', () => {
  assert.equal(computeGroupConfidence({ confidences: [0.8, 0.6], distinctVoices: 2, includesSecondHand: false, firstHandVoices: 2 }), 0.7);
  assert.equal(computeGroupConfidence({ confidences: [0.7, 0.7, 0.7, 0.7], distinctVoices: 4, includesSecondHand: false, firstHandVoices: 4 }), 0.7, 'bonus capped at the strongest insight');
  assert.equal(computeGroupConfidence({ confidences: [0.9, 0.9], distinctVoices: 2, includesSecondHand: true, firstHandVoices: 1 }), 0.75);
  assert.deepEqual([bandFor(0.75), bandFor(0.5), bandFor(0.49)], ['well evidenced', 'evidenced', 'indicative']);
});

test('identity suppression: role titles, names and tenure are never findings', () => {
  assert.ok(isIdentityToken('DX Lead'));
  assert.ok(isIdentityToken('leading the team'));
  assert.ok(isIdentityToken('I have worked here since August'));
  assert.ok(isIdentityToken('Testing is slow for Test', { name: 'Test' }));
  assert.ok(!isIdentityToken('manual testing of releases is slow', { name: 'Test' }), 'whole-word name match only');
  assert.ok(!isIdentityToken('Chasing invoice approvals across three systems'));
  const log = [];
  assert.deepEqual(suppressIdentityItems([{ label: 'Senior Analyst', insight_id: 'a' }, { label: 'Invoice keying takes hours', insight_id: 'b' }], {}, 's', log).map((i) => i.insight_id), ['b']);
  assert.equal(log.length, 1);
});

test('hot spots never sum first-hand and on-behalf hours', () => {
  const units = [{ id: 'u1', name: 'Ops', path: 'ops' }];
  const employees = [{ id: 'e1', unit_id: 'u1', status: 'completed' }, { id: 'e2', unit_id: 'u1', status: 'completed', leader_track: 'on_behalf' }, { id: 'e3', unit_id: 'u1', status: 'declined' }];
  const eligible = [{ employee: { ...employees[0], person_id: null } }, { employee: { ...employees[1], person_id: null } }];
  const insights = [prepared({ id: 'a', hours: 4 }), prepared({ id: 'b', hours: 2.25 }), prepared({ id: 'c', hours: 30, secondHand: true }), { ...prepared({ id: 'd', hours: 9 }), row: { ...prepared({ id: 'd', hours: 9 }).row, type: 'automation_candidate' } }];
  const [spot] = computeHotSpots({ units, employees, eligible, insights });
  assert.equal(spot.first_hand_hours_per_week, 6.3);
  assert.equal(spot.on_behalf_hours_per_week, 30);
  assert.equal(spot.respondents, 1);
  assert.equal(spot.team_size_interviewed, '1 of 2 invited');
  assert.deepEqual(spot.top_drivers.map((d) => d.insight_id), ['a', 'b']);
});

// ═══ Pipeline: hierarchical roll-up, batching, cache, ledger, versioning ══════

function hierarchySeed() {
  const s = seedEngagement();
  const org = s.unit('unit-org', 'Organisation', 'org');
  const ops = s.unit('unit-ops', 'Ops', 'org.ops', org);
  const fin = s.unit('unit-fin', 'Finance', 'org.fin', org);
  s.unit('unit-empty', 'Empty', 'org.empty', org);
  const qa = 'I spend about ten hours keying invoice lines into Sage by hand';
  const qb = 're-entering all those invoice lines into Sage by hand eats my mornings entirely';
  const qc = 'nobody owns the supplier master data so every change takes a week';
  s.person({ name: 'Alice', unitId: ops, turns: [qa], insights: [{ label: 'Manual invoice keying', evidence_quote: qa, time_per_week_hours: '10' }] });
  s.person({ name: 'Bob', unitId: fin, turns: [qb], insights: [{ label: 'Invoice re-entry', evidence_quote: qb, attribution_redacted: true, time_per_week_hours: '5' }] });
  s.person({ name: 'Carol', turns: [qc], insights: [{ label: 'Supplier data ownership', evidence_quote: qc }] });
  return { ...s, qa, qb, qc };
}

const coordinatorOut = ({ qa, qb, qc }) => () => ({
  headline_read: { text: 'Invoice keying dominates.', supporting_insight_ids: ['ins-1-1', 'ins-2-1', 'ins-3-1'] },
  themes: [
    { theme_id: 'th-invoice', title: 'Invoices are keyed by hand', statement: 'S', evidence_quotes: [{ insight_id: 'ins-1-1', quote: qa }, { insight_id: 'ins-2-1', quote: qb }], confidence: 1 },
    { theme_id: 'th-solo', title: 'Supplier data', statement: 'S', evidence_quotes: [{ insight_id: 'ins-3-1', quote: qc }] },
  ],
  recommendations: [{ rec_id: 'rec-ocr', title: 'Invoice capture', summary: 'S', impact: 4, feasibility: 4, evidence_quotes: [{ insight_id: 'ins-1-1', quote: qa }, { insight_id: 'ins-2-1', quote: qb }] }],
  follow_ups: [{ employee_ref: 'emp-2', question: 'How many invoices a week?', reason: 'R', related_insight_ids: ['ins-2-1'] }],
  to_confirm_in_readout: ['Is supplier data owned anywhere?'],
});

test('hierarchical roll-up: leaves first, parents read children, coordinator reads only roots plus unassigned', async () => {
  const s = hierarchySeed();
  const data = await loadSynthesisData(fakeDb(s.seed), s.eng.id, false);
  const plan = buildUnitPlan(data.units, data.eligible);
  assert.deepEqual(plan.ordered.map((n) => n.unit.id), ['unit-fin', 'unit-ops', 'unit-org'], 'deepest first, stable by path; inactive units skipped');
  assert.deepEqual(plan.roots.map((n) => n.unit.id), ['unit-org']);
  assert.deepEqual(plan.unassigned.map((e) => e.employee.name), ['Carol']);

  const db = fakeDb(s.seed);
  const model = fakeModel({ coordinator: coordinatorOut(s) });
  const results = [];
  for (let i = 0; i < 20; i++) {
    const r = await runSynthesisStep(db, s.eng.id, { maxModelCalls: 2 });
    results.push(r);
    if (r.done) break;
  }
  assert.deepEqual(results.map((r) => r.phase), ['summaries', 'units', 'final', 'written']);
  assert.equal(model.calls.length, 7, '3 summaries + 3 unit roll-ups + 1 coordinator, nothing re-paid');
  const unitCalls = model.calls.filter((c) => c.prompt.startsWith(UNIT));
  const orgPrompt = unitCalls.find((c) => c.prompt.includes('working on the unit "Organisation"')).prompt;
  assert.ok(orgPrompt.includes('"unit_id": "unit-ops"') && orgPrompt.includes('"unit_id": "unit-fin"'), 'parent receives child syntheses');
  assert.ok(orgPrompt.includes('unit id: unit-org\n(none)'), 'no members attached directly to the parent');
  const coord = model.calls.find((c) => c.prompt.startsWith(COORDINATOR)).prompt;
  assert.ok(coord.includes('"unit_id": "unit-org"') && !coord.includes('"unit_id": "unit-ops"'), 'coordinator reads only top-level syntheses');
  assert.ok(coord.includes('"employee_ref": "emp-3"'), 'unassigned summaries go straight to the coordinator');
  assert.ok(coord.includes('employee_ref emp-2: A team member in Finance'), 'redacted voice is a role descriptor in the directory');
  assert.ok(!coord.includes('Bob'), 'redacted name never reaches the coordinator');
  assert.ok(model.calls.every((c) => c.params.model === SYNTHESIS_MODEL));
  assert.deepEqual(model.calls.map((c) => c.params.max_tokens), [4500, 4500, 4500, 8000, 8000, 8000, 10000]);

  const final = results.at(-1);
  assert.equal(final.version, 1);
  const row = db.tables.synthesis[0];
  assert.equal(row.id, final.synthesisId);
  assert.deepEqual(row.themes.map((t) => t.theme_id), ['th-invoice']);
  assert.equal(row.themes[0].scope, 'cross_team');
  assert.equal(row.themes[0].evidence_quotes[1].attribution, 'A team member in Finance');
  assert.ok(row.validation_log.some((l) => l.kind === 'theme_demoted' && l.subject === 'theme "Supplier data"'));
  assert.ok(row.validation_log.some((l) => l.kind === 'open_question' && l.subject === 'coordinator'));
  assert.ok(row.validation_log.some((l) => l.kind === 'open_question' && l.subject === 'unit "Ops"'));
  assert.equal(row.recommendations[0].estimated_hours_per_week, 15);
  assert.equal(row.follow_ups[0].display_name, 'A team member in Finance');
  assert.equal(row.headline_read.supporting_insight_ids.length, 3);
  assert.deepEqual(row.hot_spots.map((h) => [h.team, h.first_hand_hours_per_week]), [['Ops', 10], ['Finance', 5]]);
  assert.equal(row.methodology.interview_window, '2026-06-01 to 2026-06-03');
  assert.equal(row.methodology.rules_version, RULES_VERSION);
  assert.equal(row.methodology.sessions_complete, 3);
  assert.equal(row.model_version, SYNTHESIS_MODEL);
  assert.deepEqual(row.input_insight_ids, ['ins-1-1', 'ins-2-1', 'ins-3-1']);

  // Ledger discipline: one usage_ledger row per model call, engagement-level.
  assert.equal(db.tables.usage_ledger.length, 7);
  assert.ok(db.tables.usage_ledger.every((u) => u.session_id === null && u.engagement_id === s.eng.id && u.cost_pence === synthesisCostPence(SYNTHESIS_MODEL, 1000, 200)));

  // A re-run on an unchanged engagement pays for the coordinator only and writes v2.
  const again = await runSynthesisStep(db, s.eng.id, { maxModelCalls: 2 });
  assert.equal(again.version, 2);
  assert.equal(again.usage.calls, 1);
  assert.equal(model.calls.length, 8);

  // Renderer re-verification: a tampered stored quote is refused at render time.
  const stored = structuredClone(db.tables.synthesis[0]);
  assert.equal((await verifyForRender(db, s.eng.id, stored)).failed.size, 0);
  stored.themes[0].evidence_quotes[1].quote = 'a quote nobody ever said in any of these interviews';
  assert.equal((await verifyForRender(db, s.eng.id, stored)).failed.get('th-invoice'), 're-derived voice count below 2');
});

test('model wrapper: strict JSON with one retry; both attempts land in one ledger row; second failure throws', async () => {
  const s = hierarchySeed();
  const db = fakeDb(s.seed);
  let n = 0;
  fakeModel({ summary: (p) => (++n === 1 ? 'not json at all' : '```json\n' + JSON.stringify(echoSummary(p)) + '\n```') });
  const r = await runSynthesisStep(db, s.eng.id, { maxModelCalls: 1 });
  assert.equal(r.summariesReady, 1);
  assert.equal(db.tables.usage_ledger.length, 1);
  assert.equal(db.tables.usage_ledger[0].input_tokens, 2000);
  fakeModel({ summary: () => '[1,2]' });
  await assert.rejects(runSynthesisStep(db, s.eng.id, { maxModelCalls: 1 }), /failed to parse twice: top-level value is not a JSON object/);
  assert.equal(db.tables.usage_ledger.length, 2, 'failed attempts are still accounted');
  assert.ok(SYNTHESIS_SUMMARISER_PROMPT.includes('{{INSIGHTS}}'), 'prompt template is the source text');
});

test('no eligible sessions: no model call, honest message', async () => {
  const s = seedEngagement();
  s.person({ name: 'Early', phase: 'warmup', insights: [{ label: 'x' }] });
  const model = fakeModel();
  const r = await runSynthesisStep(fakeDb(s.seed), s.eng.id);
  assert.equal(r.phase, 'no_input');
  assert.equal(model.calls.length, 0);
});

// ═══ Release gate ════════════════════════════════════════════════════════════

test('release gate: the client reads only the released synthesis, never the latest', async () => {
  const s = hierarchySeed();
  const other = { id: 'eng-2', client_name: 'Other', status: 'active', seat_total: 1, released_synthesis_id: null };
  s.seed.engagement.push(other);
  const db = fakeDb(s.seed);
  fakeModel({ coordinator: coordinatorOut(s) });
  const audits = [];
  const logAudit = async (dbArg, entry) => { assert.equal(dbArg, db); audits.push(entry); };

  // Staff trigger: bounded batches until done.
  let step;
  do { step = await runSynthesis(db, s.eng.id); } while (!step.done);
  assert.equal(step.ok, true);
  assert.equal(step.version, 1);
  const v1 = await getLatestSynthesis(db, s.eng.id);
  assert.equal(v1.version, 1);

  assert.equal(await getReleasedSynthesis(db, s.eng.id), null, 'nothing released: the client sees nothing');

  // What may be released: only a synthesis of this engagement, by a named actor.
  db.tables.synthesis.push({ id: 'foreign-synth', engagement_id: other.id, version: 1, themes: [] });
  assert.deepEqual(await releaseSynthesis(db, s.eng.id, 'foreign-synth', 'admin@example.test', { logAudit }), { ok: false, message: 'That synthesis version does not belong to this engagement.' });
  assert.equal((await releaseSynthesis(db, s.eng.id, 'missing', 'admin@example.test', { logAudit })).ok, false);
  assert.equal((await releaseSynthesis(db, s.eng.id, v1.id, '', { logAudit })).ok, false);
  assert.equal(audits.length, 0, 'refused releases are not audited');
  assert.equal(await getReleasedSynthesis(db, s.eng.id), null);

  const released = await releaseSynthesis(db, s.eng.id, v1.id, 'admin@example.test', { logAudit });
  assert.deepEqual(released, { ok: true, message: 'Synthesis v1 released to the client.', releasedSynthesisId: v1.id });
  const eng = db.tables.engagement.find((e) => e.id === s.eng.id);
  assert.equal(eng.released_by, 'admin@example.test');
  assert.ok(eng.released_at);
  assert.deepEqual(audits.at(-1), { engagementId: s.eng.id, actorEmail: 'admin@example.test', actorName: null, action: 'synthesis.released', summary: 'Released synthesis v1 to the client', targetId: v1.id });

  // A newer run does not reach the client until it is released.
  do { step = await runSynthesis(db, s.eng.id); } while (!step.done);
  assert.equal((await getLatestSynthesis(db, s.eng.id)).version, 2);
  assert.equal((await getReleasedSynthesis(db, s.eng.id)).id, v1.id, 'client still sees v1');
  assert.equal(await getReleasedSynthesis(db, other.id), null, 'another engagement sees nothing');

  // A pointer at another engagement's synthesis is never served.
  eng.released_synthesis_id = 'foreign-synth';
  assert.equal(await getReleasedSynthesis(db, s.eng.id), null);
  eng.released_synthesis_id = v1.id;

  assert.equal(unreleaseSynthesis, withdrawRelease);
  const withdrawn = await withdrawRelease(db, s.eng.id, 'admin@example.test', { logAudit });
  assert.deepEqual(withdrawn, { ok: true, message: 'Deliverable withdrawn. The client now sees the holding screen.', releasedSynthesisId: null });
  assert.equal(await getReleasedSynthesis(db, s.eng.id), null);
  assert.deepEqual([eng.released_synthesis_id, eng.released_at, eng.released_by], [null, null, null]);
  assert.equal(audits.at(-1).action, 'synthesis.unreleased');
});

test('release gate: write failures change nothing and say so; audit failure never breaks a release', async () => {
  const s = hierarchySeed();
  s.seed.synthesis = [{ id: 'syn-1', engagement_id: s.eng.id, version: 3 }];
  const db = fakeDb(s.seed);
  db.fail['engagement.update'] = 'boom';
  const r = await releaseSynthesis(db, s.eng.id, 'syn-1', 'admin@example.test', { logAudit: async () => {} });
  assert.deepEqual(r, { ok: false, message: 'The release could not be completed. Nothing was changed; try again.' });
  assert.equal((await withdrawRelease(db, s.eng.id, 'admin@example.test', { logAudit: async () => {} })).message, 'The withdrawal could not be completed. Nothing was changed; try again.');
  delete db.fail['engagement.update'];
  const ok = await releaseSynthesis(db, s.eng.id, 'syn-1', 'admin@example.test', { logAudit: async () => { throw new Error('audit down'); } });
  assert.equal(ok.ok, true);
  assert.equal((await getReleasedSynthesis(db, s.eng.id)).version, 3);
  db.fail['synthesis.select'] = 'down';
  await assert.rejects(getReleasedSynthesis(db, s.eng.id), /released synthesis lookup failed: down/);
  db.fail['engagement.select'] = 'down';
  const failed = await runSynthesis(db, s.eng.id);
  assert.equal(failed.ok, false);
  assert.equal(failed.done, true);
});

test('runSynthesis reports progress like the source admin card', async () => {
  const s = hierarchySeed();
  const db = fakeDb(s.seed);
  fakeModel({ coordinator: coordinatorOut(s) });
  const first = await runSynthesis(db, s.eng.id);
  assert.deepEqual(first, { ok: true, done: false, message: 'Summarised 2 of 3 interviews; run again to continue.', progress: 'summaries 2/3', version: undefined });
  const second = await runSynthesis(db, s.eng.id);
  assert.equal(second.progress, 'unit roll-ups 1/3');
  assert.equal(normalise('  A  b '), 'a b');
});

test('brief refuses a Notion write before spending on the model', async () => {
  const model = fakeModel();
  await assert.rejects(buildSynthesisBrief(fakeDb(corroborationSeed().seed), 'eng-1', { writeToNotion: true }), /not available on the website/);
  assert.equal(model.calls.length, 0);
});
