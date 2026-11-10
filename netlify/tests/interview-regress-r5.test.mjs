// GRE-4941: a replay of the GRE-2617 dry run, row R5 (scripted typed interview on pr-140). There the phase stayed
// `warmup` for 13 turns, Everest asked one question 7 times and said "20 to 30 minutes" in a 10-minute round.
// The replay keeps what made it loop: thin warm-up answers the extractor fills no slot from, and an interviewer
// that asks the current phase's question again for as long as the phase does not move. It runs the whole typed
// interview through the chat endpoint to sign-off, at 10 and at 20 minutes, and checks the three R5 rows:
//   1. warm-up moves on within its turn limit;
//   2. no question is asked more than twice;
//   3. the duration in the prompt and in the opening equals the round's minutes.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, account, chat, fakeReplyModel, installFakeExtraction, joinAndStart, makeHandlers, makeVerify, newCustomer,
  seedRound, skip, startInterviewDb,
} from './lib/interview-harness.mjs';
import { MAX_QUESTION_ASKS, phaseTurnLimit } from '../functions/lib/interview/interview.mjs';

const TYPED = MODES.find((m) => !m.voice);

// The interviewer's question for each phase, asked again while the phase stays put (the R5 failure).
const PHASE_QUESTION = {
  warm_up: 'how long have you been in the role, and who do you work with most?',
  day_in_the_life: 'walk me through what a typical week actually looks like?',
  pain_mapping: 'what makes that one slow or annoying?',
  automation_surfacing: 'if you had a magic wand, what would you give away first?',
};
const ATTRIBUTION_Q = 'no quotes, anonymous quotes, or quotes with your name: which would you like?';
const MEMORY_Q = 'are you happy for me to remember this conversation next time?';

/** A fake interviewer that reads only what the engine gives it: the round length, the phase and the repeat list. */
function r5Interviewer() {
  return fakeReplyModel({
    reply: (n, params) => {
      const stable = params.system[0].text;
      const volatile = params.system[1].text;
      if (params.messages.length === 1) {
        const minutes = /The idea is simple: a (\d+) minute chat/.exec(stable)?.[1];
        return `Hi, I'm Everest. The idea is simple: a ${minutes} minute chat about your working week. ` +
          `To start: I've got you down as an accounts assistant, have I got that right?`;
      }
      if (/This is your FINAL message/.test(volatile)) return 'Thank you, that is everything. Greatstone will share the themes with the team.';
      const phase = /Current phase: (\w+)\./.exec(volatile)[1];
      if (phase === 'sign_off') return /attribution_preference \(/.test(volatile) ? `Last couple of things. ${ATTRIBUTION_Q}` : `And one more: ${MEMORY_Q}`;
      return `Right. So, ${PHASE_QUESTION[phase]}`;
    },
  });
}

// Typed answers. The warm-up and day-in-the-life ones are thin: the extractor fills no slot from them, as in R5.
const ANSWERS = {
  warmup: 'Yes, that is right.',
  day_in_life: 'Mostly invoices, and some reports.',
  pain_mapping: 'Keying the invoices is slow, about ten hours a week.',
  automation: 'Something that reads the invoices for me.',
};
const NO_QUOTES = 'No quotes, please.';
const NO_MEMORY = 'No, please do not remember it.';
const SCRIPT = [
  { text: ANSWERS.pain_mapping, slots: { pain_mapping: { top_pains_named: 'filled', time_costs_quantified: 'partial' } } },
  { text: ANSWERS.automation, slots: { automation_surfacing: { candidates_proposed: 'filled' } } },
  { text: NO_QUOTES, slots: { sign_off: { attribution_preference: 'filled' } }, consent: { attribution: 'none' } },
  { text: NO_MEMORY, slots: { sign_off: { memory_opt_in_asked: 'filled' } }, consent: { memory_opt_in: false } },
];

let db;
let extraction;
before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-regress-r5');
  extraction = installFakeExtraction(SCRIPT);
});
after(async () => { extraction?.reset(); await db?.stop(); });

for (const minutes of [10, 20]) {
  describe(`R5 replay, typed, ${minutes}-minute round`, { skip }, () => {
    let h, person, sessionId;
    const log = []; // one row per agent turn: the phase it was sent in and the question it asked (no answers kept)

    before(() => {
      const customerId = newCustomer(db.sql, `R5 ${minutes}`);
      const round = seedRound(db.sql, { customerId, voice: false });
      db.sql(`UPDATE interview.engagement SET target_minutes = ${minutes} WHERE id = '${round.id}';`);
      person = account(`rfive${minutes}`);
      h = makeHandlers({ pool: db.pool, env: TYPED.env, verify: makeVerify([person]), replyModel: r5Interviewer() });
      return joinAndStart(h, person, round).then((sid) => { sessionId = sid; });
    });

    test('the scripted typed interview reaches sign-off and closes', async () => {
      const opening = await chat(h, person, { sessionId });
      assert.equal(opening.status, 200);
      log.push({ phase: opening.done.phase, reply: opening.reply });
      let complete = false;
      for (let i = 0; i < 40 && !complete; i += 1) {
        const { phase, reply } = log[log.length - 1];
        const content = phase !== 'sign_off' ? ANSWERS[phase] : reply.includes(MEMORY_Q) ? NO_MEMORY : NO_QUOTES;
        const turn = await chat(h, person, { sessionId, content, clientTurnId: `r5-${minutes}-${i}` });
        assert.equal(turn.status, 200, JSON.stringify(turn.json ?? turn.error));
        assert.ok(turn.done, `turn ${i} streamed no done frame: ${JSON.stringify(turn.events)}`);
        log.push({ phase: turn.done.phase, reply: turn.reply, answeredIn: phase });
        complete = turn.done.complete;
      }
      assert.equal(complete, true, `no sign-off after ${log.length - 1} turns: ${log.map((l) => l.phase).join(' ')}`);
      assert.equal(log[log.length - 1].phase, 'sign_off');
      const order = ['warmup', 'day_in_life', 'pain_mapping', 'automation', 'sign_off'];
      assert.deepEqual([...new Set(log.map((l) => l.phase))], order, 'every phase is visited, in order');
    });

    test('warm-up moves on within its turn limit', () => {
      const warmUpAnswers = log.filter((l) => l.answeredIn === 'warmup').length;
      assert.ok(warmUpAnswers >= 1);
      assert.ok(warmUpAnswers <= phaseTurnLimit('warm_up', minutes), `warm-up took ${warmUpAnswers} answers`);
    });

    test(`no question is asked more than ${MAX_QUESTION_ASKS} times`, () => {
      const counts = new Map();
      for (const { reply } of log) {
        const q = reply.match(/[^.!?]*\?/g)?.pop()?.trim();
        if (q) counts.set(q, (counts.get(q) ?? 0) + 1);
      }
      for (const [q, n] of counts) assert.ok(n <= MAX_QUESTION_ASKS, `asked ${n} times: ${q}`);
    });

    test(`the stated duration is the round's ${minutes} minutes`, () => {
      const prompt = h.replyModel.calls[0].system[0].text;
      assert.ok(!/20 to 30|\b30 minutes\b/.test(prompt), 'no fixed 20 to 30 minutes left in the prompt');
      assert.match(prompt, new RegExp(`in about ${minutes} minutes of text chat`));
      assert.match(prompt, new RegExp(`a ${minutes} minute chat about what your working week`));
      assert.match(log[0].reply, new RegExp(`a ${minutes} minute chat`));
      for (const call of h.replyModel.calls) assert.match(call.system[1].text, new RegExp(`of ${minutes} minutes\\.`));
    });

    test('turn log summary (phases per turn, no answers)', (t) => {
      const asks = new Map();
      const rows = log.map((l, i) => {
        const q = l.reply.match(/[^.!?]*\?/g)?.pop()?.trim();
        const n = q ? (asks.set(q, (asks.get(q) ?? 0) + 1), asks.get(q)) : 0;
        return `${i}:${l.phase}${q ? ` q${[...asks.keys()].indexOf(q) + 1}x${n}` : ''}`;
      });
      t.diagnostic(`R5 ${minutes} min: ${rows.join(' | ')}`);
    });
  });
}
