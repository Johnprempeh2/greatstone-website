// Port of the source's scripts/corroboration-test.mjs (GRE-2612): two DIFFERENT people describing the SAME pain in
// different words merge into one multi-voice promoted pattern (the empty-deliverable fix), while a single distinct
// pain stays un-promoted (the two-voice rule). The source seeded a throwaway engagement in SQL and ran the real brief
// builder (scripts/synthesis-brief.mjs) against the live database and Opus.
// Here the two interviews are made by the real flows on a real Postgres: each person joins with a website account,
// starts, and answers; a fake extraction turns the answers into the insights (verbatim quotes) and closes each
// interview; then the real buildSynthesisBrief runs over interviewDb with a fake synthesis model that returns
// deterministic per-interview summaries. A third person in ANOTHER organisation says the same thing and must not
// become a third voice.
// Both modes: in voice mode the pain answers are spoken (voice/start + think, input_mode 'voice'), so the quote gate
// runs over spoken turns; the closing consent answer is typed (spoken close-out is covered in the smoke suite).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, account, chat, installFakeExtraction, joinAndStart, makeHandlers, makeVerify, newCustomer, seedRound, skip,
  startInterviewDb, think, thinkTarget, voiceStart,
} from './lib/interview-harness.mjs';
import { interviewDb, inInterviewTransaction } from '../functions/lib/interview/db.mjs';
import { buildSynthesisBrief } from '../functions/lib/interview/synthesis/brief.mjs';
import { setSynthesisClient } from '../functions/lib/interview/synthesis/model.mjs';

const ALL_BUT_CONSENT = {
  warm_up: { role_confirmed: 'filled', tenure_and_team: 'filled', rapport_established: 'filled', mode_confirmed: 'filled' },
  day_in_the_life: { daily_tasks: 'filled', weekly_monthly_cycles: 'filled', tools_inventory: 'filled', handoffs_in_out: 'filled' },
  pain_mapping: { top_pains_named: 'filled', time_costs_quantified: 'filled', severity_probed: 'filled', dependencies_mapped: 'filled' },
  automation_surfacing: { candidates_proposed: 'filled', candidates_reacted: 'filled', feasibility_signals: 'filled' },
  sign_off: { insights_read_back: 'filled', corrections_taken: 'filled' },
};
const ALICE_SAYS = 'Honestly the worst part of my week is the manual invoice keying, I spend about ten hours keying invoice lines into Sage by hand. Also, finding a parking space at the office in the morning is genuinely hard.';
const BOB_SAYS = 'For me it is the manual invoice keying as well, re-entering all those invoice lines into Sage by hand eats my mornings entirely.';
const CAROL_SAYS = 'Same here in our company: re-entering all those invoice lines into Sage by hand eats my mornings entirely, every week.';
const CLOSE = (who) => `That covers it from ${who}. Happy to be named, and there is no need to remember this conversation.`;
const SCRIPT = [
  { text: ALICE_SAYS, slots: ALL_BUT_CONSENT, insights: [
    { type: 'pain', label: 'Manual invoice keying', quote: 'I spend about ten hours keying invoice lines into Sage by hand', confidence: 0.9 },
    // a DISTINCT single-voice pain that must NOT be promoted
    { type: 'pain', label: 'Parking at the office is hard', quote: 'finding a parking space at the office in the morning is genuinely hard', confidence: 0.85 }] },
  { text: BOB_SAYS, slots: ALL_BUT_CONSENT, insights: [
    { type: 'pain', label: 'Manual invoice keying slow', quote: 're-entering all those invoice lines into Sage by hand eats my mornings entirely', confidence: 0.9 }] },
  { text: CAROL_SAYS, slots: ALL_BUT_CONSENT, insights: [
    { type: 'pain', label: 'Manual invoice keying', quote: 're-entering all those invoice lines into Sage by hand eats my mornings entirely', confidence: 0.9 }] },
  ...['alice', 'bob', 'carol'].map((who) => ({ text: CLOSE(who), slots: { sign_off: { attribution_preference: 'filled', memory_opt_in_asked: 'filled' } },
    consent: { attribution: 'named', memory_opt_in: false } })),
];

// ─── the fake synthesis model (deterministic summaries that echo the real insight rows) ───
const SUMMARISER = 'You are the per-interview summariser';
const UNIT = 'You are the unit-level synthesiser';
const COORDINATOR = 'You are the synthesis coordinator';
const EVIDENCE = 'VALIDATED INSIGHTS (the only evidence you may use):\n';
function echoSummary(prompt) {
  const start = prompt.indexOf(EVIDENCE) + EVIDENCE.length;
  const { participant_id, insights } = JSON.parse(prompt.slice(start, prompt.indexOf('\n\nINTERVIEW STATE')));
  return {
    employee_ref: participant_id, role: 'team member', second_hand: false,
    top_pains: insights.map((i) => ({ label: i.label, detail: 'Detail.', frequency: null, time_per_week_hours: null, insight_id: i.id, quote: i.evidence_quote, confidence: 1 })),
    time_costs_total_hours_per_week: 10, automation_candidates: [],
    notable_quotes: insights.map((i) => ({ insight_id: i.id, quote: i.evidence_quote })),
    referrals: [], uncertain: [], follow_up_signal: 0.4,
  };
}
function fakeSynthesisModel() {
  const calls = [];
  setSynthesisClient({
    messages: {
      async create(params) {
        const prompt = params.messages[0].content;
        calls.push(prompt.slice(0, 40));
        let out;
        if (prompt.startsWith(SUMMARISER)) out = echoSummary(prompt);
        else if (prompt.startsWith(UNIT)) {
          const unitId = /unit id: (\S+)/.exec(prompt)[1];
          out = { unit_id: unitId, candidate_themes: [], automation_candidates: [], follow_ups: [], open_questions: ['What happens at month end?'] };
        } else if (prompt.startsWith(COORDINATOR)) out = {};
        else throw new Error('unexpected prompt');
        return { content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 200 } };
      },
    },
  });
  return calls;
}

let db;
let extraction;
before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-regress-corroboration');
  extraction = installFakeExtraction(SCRIPT);
});
after(async () => { extraction?.reset(); setSynthesisClient(null); await db?.stop(); });

for (const mode of MODES) {
  describe(`corroboration, ${mode.name}`, { skip }, () => {
    let A, B, modelCalls;

    // one person's interview, start to close-out, through the handlers
    async function interview(h, user, round, says, who) {
      const sid = await joinAndStart(h, user, round);
      assert.equal((await chat(h, user, { sessionId: sid })).status, 200);
      if (mode.voice) {
        const vs = await voiceStart(h, user, sid);
        assert.equal(vs.status, 200);
        assert.equal((await think(h, thinkTarget(vs.body.settings), says)).status, 200);
      } else {
        assert.equal((await chat(h, user, { sessionId: sid, content: says, clientTurnId: `${who}-1` })).status, 200);
      }
      const closed = await chat(h, user, { sessionId: sid, content: CLOSE(who), clientTurnId: `${who}-2` });
      assert.equal(closed.done.complete, true, `${who}'s interview closes`);
      return sid;
    }

    before(async () => {
      A = seedRound(db.sql, { customerId: newCustomer(db.sql, 'ZZ Corroboration Test'), clientName: 'ZZ Corroboration Test' });
      B = seedRound(db.sql, { customerId: newCustomer(db.sql, 'Other organisation') });
      const [alice, bob, carol] = ['alice', 'bob', 'carol'].map((x) => account(x));
      const h = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([alice, bob, carol]) });
      await interview(h, alice, A, ALICE_SAYS, 'alice');
      await interview(h, bob, A, BOB_SAYS, 'bob');
      await interview(h, carol, B, CAROL_SAYS, 'carol');
      const spoken = db.sql(`SELECT count(*) FROM interview.turn WHERE role = 'user' AND input_mode = 'voice' AND customer_id = '${A.customerId}'`);
      assert.equal(spoken, mode.voice ? '2' : '0');
      assert.equal(db.sql(`SELECT count(*) FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id
        WHERE e.engagement_id = '${A.id}' AND s.ended_at IS NOT NULL AND s.phase = 'sign_off'`), '2');
      modelCalls = fakeSynthesisModel();
    });

    test('the shared pain, worded differently by two people, is one promoted 2-voice pattern; the lone pain is not promoted', async () => {
      const res = await buildSynthesisBrief(interviewDb('system', { pool: db.pool }), A.id, { stepOptions: { maxModelCalls: 1000 } });
      assert.ok(res.stats.patternsPromoted >= 1, `shared pain corroborated into a promoted multi-voice pattern: promoted=${res.stats.patternsPromoted}`);
      assert.equal(res.stats.patternsPromoted, 1);
      assert.equal(res.stats.patternsNeedingCorroboration, 1);
      assert.equal(res.stats.interviewsIncluded, 2, 'the other organisation\'s interview is not in this round');
      assert.match(res.markdown, /### `PROMOTED` Manual invoice keying[^\n]*\n2 voices · 2 first-hand/, 'two voices, not three');
      assert.match(res.markdown, /### `NEEDS CORROBORATION` Parking at the office is hard\n1 voice · 1 first-hand/);
      assert.ok(!/`PROMOTED` Parking/.test(res.markdown), 'parking (1 voice) is never promoted');
      assert.match(res.markdown, /invoice/i);
      assert.ok(!res.markdown.includes('Same here in our company'), 'nothing of the other organisation reaches the brief');
      assert.ok(modelCalls.filter((c) => c.startsWith(SUMMARISER)).length === 2, 'one summary per eligible interview');
    });

    test('the brief\'s spend and cache rows carry the round\'s organisation; a rerun is cache hits', async () => {
      assert.equal(db.sql(`SELECT count(*) FROM interview.synthesis_cache WHERE engagement_id = '${A.id}' AND kind = 'session'
        AND customer_id = '${A.customerId}'`), '2', 'one cached summary per interview');
      assert.equal(db.sql(`SELECT count(*) FROM interview.synthesis_cache WHERE engagement_id = '${A.id}' AND customer_id <> '${A.customerId}'`), '0');
      assert.equal(db.sql(`SELECT count(*) FROM interview.usage_ledger WHERE engagement_id = '${A.id}' AND customer_id <> '${A.customerId}'`), '0');
      const summaries = modelCalls.filter((c) => c.startsWith(SUMMARISER)).length;
      const again = await buildSynthesisBrief(interviewDb('system', { pool: db.pool }), A.id);
      assert.equal(again.stats.patternsPromoted, 1);
      assert.equal(modelCalls.filter((c) => c.startsWith(SUMMARISER)).length, summaries, 'unchanged interviews are never re-summarised');
    });

    test('keyed to the round\'s organisation the brief is the same; keyed to another it cannot see the round', async () => {
      const scoped = await inInterviewTransaction(db.pool, (sdb) => buildSynthesisBrief(sdb, A.id), { org: '90000000-0000-4000-8000-0000000000aa', customer_id: A.customerId });
      assert.equal(scoped.stats.patternsPromoted, 1);
      await assert.rejects(
        inInterviewTransaction(db.pool, (sdb) => buildSynthesisBrief(sdb, A.id), { customer_id: B.customerId }),
        /not found/);
    });
  });
}
