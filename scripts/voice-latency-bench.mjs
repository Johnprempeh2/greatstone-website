// Voice reply latency bench (GRE-5375). Runs the real voice think handler against a throwaway Postgres with the real
// Claude models, for N spoken turns of a synthetic interview (the regression SMOKE_SCRIPT), and prints where each
// turn's wait went. Numbers only; no turn text is printed.
//
//   ANTHROPIC_API_KEY=... PG_BIN=/usr/lib/postgresql/16/bin node scripts/voice-latency-bench.mjs [turns=10]
//
// Marks are ms from the request arriving: loaded (auth and state read), extracted (the extraction call, which runs
// alongside the reply outside sign-off),
// firstToken (Claude's first text), firstClause (first text handed to Deepgram TTS), replyDone. `client` is the
// same first-text gap seen by the caller, as Deepgram sees it.
import Anthropic from '@anthropic-ai/sdk';
import {
  account, chat, joinAndStart, makeHandlers, makeVerify, MODES, newCustomer, seedRound, SMOKE_SCRIPT, sseFrames,
  startInterviewDb, thinkTarget, voiceStart,
} from '../netlify/tests/lib/interview-harness.mjs';
import { makeVoiceThinkHandler } from '../netlify/functions/interview-voice-think.mjs';

const TURNS = Number(process.argv[2]) || 10;
const EXTRA = [
  'Mostly Excel and Sage, plus the email inbox where the PDFs land. The scanner is a separate tool that nobody really trusts.',
  'Probably the month-end pack. It takes two full days and half of it is copying the same numbers between three spreadsheets.',
];
const UTTERANCES = [...SMOKE_SCRIPT.slice(0, 5).map((e) => e.text), ...EXTRA, ...SMOKE_SCRIPT.slice(5).map((e) => e.text)];

const client = new Anthropic();
const replyModel = { model: () => client };
const timings = [];
const log = { info: (line) => { const m = /^voice think timing (.*)$/.exec(line); if (m) timings.push(JSON.parse(m[1])); }, warn() {}, error: console.error };

const db = await startInterviewDb('voice-latency-bench');
try {
  const env = MODES.find((m) => m.voice).env;
  const customerId = newCustomer(db.sql, 'Bench Ltd');
  const round = seedRound(db.sql, { customerId, seatTotal: 3 });
  const dan = account('dan');
  const h = makeHandlers({ pool: db.pool, env, verify: makeVerify([dan]), replyModel });
  const voiceThink = makeVoiceThinkHandler({ pool: () => db.pool, model: replyModel.model, env, log });
  const sessionId = await joinAndStart(h, dan, round);
  await chat(h, dan, { sessionId }); // the typed kickoff, so the first spoken turn answers a question
  const { url, authorization } = thinkTarget((await voiceStart(h, dan, sessionId)).body.settings);

  const rows = [];
  for (let i = 0; i < TURNS; i++) {
    const content = UTTERANCES[i % UTTERANCES.length];
    const t0 = performance.now();
    const res = await voiceThink(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization },
      body: JSON.stringify({ model: 'x', stream: true, messages: [{ role: 'user', content }] }) }));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = '';
    let client1 = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      if (client1 === null && sseFrames(text).some((f) => f !== '[DONE]' && f.choices?.[0]?.delta?.content)) client1 = Math.round(performance.now() - t0);
    }
    const t = timings.at(-1) ?? {};
    rows.push({ turn: i + 1, client: client1, ...t });
    console.log(JSON.stringify(rows.at(-1)));
  }

  const stage = (r) => ({
    'load (auth, state)': r.loaded,
    'extraction (alongside the reply outside sign-off)': r.extracted - r.loaded,
    'Claude first token': r.firstToken - r.loaded,
    'first clause wait': r.firstClause - r.firstToken,
    'request to first clause': r.firstClause,
  });
  const keys = Object.keys(stage(rows[0]));
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  console.log('\nstage | median ms | worst ms');
  for (const k of keys) {
    const xs = rows.map((r) => stage(r)[k]).filter(Number.isFinite);
    console.log(`${k} | ${median(xs)} | ${Math.max(...xs)}`);
  }
} finally {
  await db.stop();
}
