// Unit tests for the ported voice modules (netlify/functions/lib/interview/voice). The clause buffer and
// barge-in checks are the source's scripts/clause-buffer-test.mjs and scripts/barge-in-test.mjs, case for case.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ClauseBuffer } from '../functions/lib/interview/voice/clause-buffer.mjs';
import { SpokenWindow, classifyBargeIn, FALSE_INTERRUPTION_TIMEOUT_MS, POST_SPEECH_GATE_MS } from '../functions/lib/interview/voice/barge-in.mjs';
import { latestUserMessage, chunkOpener, chunkText, chunkClose, chunkDone, SSE_HEADERS } from '../functions/lib/interview/voice/openai-wire.mjs';
import { buildVoiceSettings, VOICE_SAMPLE_RATE, ENDPOINT_SILENCE_MS } from '../functions/lib/interview/voice/settings.mjs';
import { mintSessionToken, hashSessionToken, tokenHashMatches, bearerFrom } from '../functions/lib/interview/voice/session-token.mjs';
import { VOICE_PROMPT_ADDENDUM } from '../functions/lib/interview/voice/prompt-addendum.mjs';

// ─── clause buffer ───────────────────────────────────────────────────────────

/** Feed a string the way Claude streams it: a few characters at a time. */
function stream(text, size = 3) {
  const b = new ClauseBuffer();
  const pieces = [];
  for (let i = 0; i < text.length; i += size) pieces.push(...b.push(text.slice(i, i + size)));
  const rest = b.drain();
  if (rest) pieces.push(rest);
  return pieces;
}
/** Whitespace differences are fine; losing or duplicating words is not. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('clause buffer A: nothing is lost, whatever the token boundaries', () => {
  const replies = [
    'Hm, okay. So what actually happens at the handover? Walk me through it.',
    'Right. That sounds like it costs you a fair bit of time every week, so tell me about the last time it went wrong.',
    'No rush.',
    'Go on.',
    'You said twenty a day. Is that twenty a day, or twenty a week?',
    'It runs at 3.5 hours a week, which is most of a morning gone.',
    'That is interesting, and I want to come back to the invoicing point, but first, what does a normal Tuesday look like for you, start to finish, including the bits you would rather not do?',
  ];
  for (const r of replies) for (const size of [1, 3, 7, 40]) assert.equal(norm(stream(r, size).join(' ')), norm(r), `@${size} ${r}`);
});

test('clause buffer B: it breaks where a person would pause', () => {
  const p = stream('Hm, okay. So what actually happens at the handover? Walk me through it.');
  assert.deepEqual(p, ['Hm, okay.', 'So what actually happens at the handover?', 'Walk me through it.']);
});

test('clause buffer C: the first release is fast (time to first audio)', () => {
  const b = new ClauseBuffer();
  let firstAt = -1;
  let chars = 0;
  for (const t of 'Right. That sounds frustrating, tell me more.'.split('')) {
    chars += 1;
    if (b.push(t).length && firstAt < 0) firstAt = chars;
  }
  assert.ok(firstAt > 0 && firstAt <= 8, `after ${firstAt} chars`);
});

test('clause buffer D: it does not split things that are not sentence ends', () => {
  assert.ok(stream('It runs at 3.5 hours a week.').some((x) => x.includes('3.5')));
  assert.equal(stream('Hm, okay. Go on.')[0], 'Hm, okay.');
});

test('clause buffer E: a run-on cannot hold the audio hostage', () => {
  const runon = 'so ' + 'and then another thing happened '.repeat(12);
  const parts = stream(runon);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((x) => x.length <= 200), JSON.stringify(parts.map((x) => x.length)));
  assert.equal(norm(parts.join(' ')), norm(runon));
});

test('clause buffer F: empty and edge input', () => {
  assert.equal(stream('').length, 0);
  assert.equal(stream('   \n  ').length, 0);
  assert.equal(new ClauseBuffer().drain(), null);
});

// ─── barge-in ────────────────────────────────────────────────────────────────

const AGENT_LINE = 'So tell me about a time you had to change your mind about something important at work.';
// Defaults describe a clear, near-field, mid-turn utterance, so each test changes only one signal.
const base = { text: '', durationMs: 1200, rmsDb: -30, noiseFloorDb: -50, agentSpeakingForMs: 3000, echoOverlap: 0, isFirstAgentTurn: false };
const verdict = (over) => classifyBargeIn({ ...base, ...over });

test('barge-in A: recognising our own voice coming back', () => {
  const win = new SpokenWindow();
  win.note(AGENT_LINE);
  const exactEcho = 'tell me about a time you had to change your mind';
  const partialEcho = 'a time you had to change your mind about something';
  const realAnswer = 'I once changed my mind about moving the whole team to Accra';
  assert.ok(win.overlap(exactEcho) >= 0.6);
  assert.ok(win.overlap(partialEcho) >= 0.6);
  assert.ok(win.overlap(realAnswer) < 0.6);
  assert.equal(verdict({ text: exactEcho, echoOverlap: win.overlap(exactEcho) }), 'echo');
  assert.equal(verdict({ text: realAnswer, echoOverlap: win.overlap(realAnswer) }), 'interrupt');
  // The window must forget, or an answer that repeats the question later would be dropped as echo.
  const t0 = 1_000_000;
  const shortWin = new SpokenWindow(12_000);
  shortWin.note(AGENT_LINE, t0);
  assert.equal(shortWin.overlap(exactEcho, t0 + 13_000), 0);
  win.clear();
  assert.equal(win.overlap(exactEcho), 0);
  win.note('   ');
  assert.equal(win.overlap(exactEcho), 0);
});

test('barge-in B: corrections always get through', () => {
  for (const text of ['no wait', 'sorry can I go back', 'stop', 'actually that is not right', 'hold on']) assert.equal(verdict({ text }), 'interrupt', text);
  assert.equal(verdict({ text: 'no wait', agentSpeakingForMs: 100 }), 'interrupt');
  assert.equal(verdict({ text: 'no stop that is wrong', echoOverlap: 0.95 }), 'interrupt');
  assert.equal(verdict({ text: 'wait', rmsDb: -49 }), 'interrupt');
});

test('barge-in C: listening noises are not interruptions', () => {
  for (const text of ['mhm', 'yeah', 'right', 'okay', 'sure']) assert.equal(verdict({ text, durationMs: 300 }), 'backchannel', text);
  assert.notEqual(verdict({ text: 'yeah', durationMs: 1500 }), 'backchannel');
  assert.equal(verdict({ text: 'yeah but that is the problem' }), 'interrupt');
});

test('barge-in D: the room and the colleague two desks away', () => {
  assert.equal(verdict({ text: 'that is interesting', rmsDb: -46, noiseFloorDb: -52 }), 'far-field');
  assert.equal(verdict({ text: 'that is interesting', rmsDb: -25, noiseFloorDb: -52 }), 'interrupt');
});

test('barge-in E: staying deaf while cancellation warms up', () => {
  assert.equal(verdict({ text: 'something', agentSpeakingForMs: 300 }), 'ignore');
  assert.equal(verdict({ text: 'something happened here', agentSpeakingForMs: 900 }), 'interrupt');
  assert.equal(verdict({ text: 'something happened here', agentSpeakingForMs: 900, isFirstAgentTurn: true }), 'ignore');
  assert.equal(verdict({ text: 'something happened here', agentSpeakingForMs: 1800, isFirstAgentTurn: true }), 'interrupt');
});

test('barge-in F: edge cases', () => {
  assert.equal(verdict({ text: '' }), 'ignore');
  assert.equal(verdict({ text: 'the' }), 'ignore');
  assert.notEqual(verdict({ text: 'change your', echoOverlap: 1 }), 'echo');
  assert.equal(FALSE_INTERRUPTION_TIMEOUT_MS, 2000);
  assert.equal(POST_SPEECH_GATE_MS, 800);
});

// ─── openai wire ─────────────────────────────────────────────────────────────

const decode = (u8) => new TextDecoder().decode(u8);
const parseFrame = (u8) => {
  const s = decode(u8);
  assert.ok(s.startsWith('data: ') && s.endsWith('\n\n'), s);
  return JSON.parse(s.slice(6, -2));
};

test('latestUserMessage takes the newest non-empty user turn only', () => {
  assert.equal(latestUserMessage({ messages: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'a' }, { role: 'user', content: '  second  ' }, { role: 'user', content: '   ' }, { role: 'user', content: null }] }), 'second');
  assert.equal(latestUserMessage({}), '');
  assert.equal(latestUserMessage(null), '');
  assert.equal(latestUserMessage({ messages: 'x' }), '');
});

test('chat.completion.chunk frames, the [DONE] sentinel and unbuffered SSE headers', () => {
  const open = parseFrame(chunkOpener('id1', 'm'));
  assert.equal(open.object, 'chat.completion.chunk');
  assert.deepEqual([open.id, open.model], ['id1', 'm']);
  assert.ok(Number.isInteger(open.created));
  assert.deepEqual(open.choices, [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]);
  assert.deepEqual(parseFrame(chunkText('id1', 'm', 'Hi.')).choices, [{ index: 0, delta: { content: 'Hi.' }, finish_reason: null }]);
  assert.deepEqual(parseFrame(chunkClose('id1', 'm')).choices, [{ index: 0, delta: {}, finish_reason: 'stop' }]);
  assert.equal(decode(chunkDone()), 'data: [DONE]\n\n');
  assert.deepEqual(SSE_HEADERS, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
});

// ─── settings ────────────────────────────────────────────────────────────────

test('buildVoiceSettings keeps the load-bearing decisions', () => {
  const s = buildVoiceSettings({ thinkEndpointUrl: 'https://example.test/api/interview/voice/think', sessionToken: 'tok', greeting: 'Hi Sam.' });
  assert.equal(s.type, 'Settings');
  assert.equal(s.mip_opt_out, true);
  assert.equal(VOICE_SAMPLE_RATE, 48_000);
  assert.deepEqual(s.audio, { input: { encoding: 'linear16', sample_rate: 48_000 }, output: { encoding: 'linear16', sample_rate: 48_000, container: 'none' } });
  assert.deepEqual(s.agent.listen.provider, { type: 'deepgram', model: 'nova-3', endpointing: ENDPOINT_SILENCE_MS });
  assert.equal(ENDPOINT_SILENCE_MS, 2000);
  assert.equal(s.agent.think.provider.type, 'open_ai');
  assert.equal(s.agent.think.provider.model, process.env.VOICE_INTERVIEW_MODEL ?? 'claude-haiku-4-5');
  assert.deepEqual(s.agent.think.endpoint, { url: 'https://example.test/api/interview/voice/think', headers: { authorization: 'Bearer tok' } });
  assert.deepEqual(s.agent.speak.provider, { type: 'deepgram', model: 'aura-2-draco-en' });
  assert.equal(s.agent.greeting, 'Hi Sam.');
  assert.equal(s.agent.language, 'en');
  const custom = buildVoiceSettings({ thinkEndpointUrl: 'u', sessionToken: 't', greeting: 'g', speakModel: 'aura-2-other-en', listenModel: 'nova-2' });
  assert.equal(custom.agent.speak.provider.model, 'aura-2-other-en');
  assert.equal(custom.agent.listen.provider.model, 'nova-2');
});

// ─── session token ───────────────────────────────────────────────────────────

test('per-session voice tokens: random, hashed, constant-time matched, bearer parsed', () => {
  const a = mintSessionToken();
  const b = mintSessionToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.hash, createHash('sha256').update(a.token).digest('hex'));
  assert.equal(hashSessionToken(a.token), a.hash);
  assert.equal(tokenHashMatches(a.hash, hashSessionToken(a.token)), true);
  assert.equal(tokenHashMatches(a.hash, b.hash), false);
  assert.equal(tokenHashMatches(a.hash, a.hash.slice(2)), false);
  assert.equal(tokenHashMatches(null, a.hash), false);
  assert.equal(tokenHashMatches('', ''), false);
  assert.equal(bearerFrom(`  Bearer   ${a.token} `), a.token);
  assert.equal(bearerFrom('bearer x'), 'x');
  assert.equal(bearerFrom('Basic x'), null);
  assert.equal(bearerFrom(null), null);
});

test('voice prompt addendum is the spoken-interview override', () => {
  assert.ok(VOICE_PROMPT_ADDENDUM.startsWith('YOU ARE BEING SPOKEN ALOUD.'));
  assert.ok(VOICE_PROMPT_ADDENDUM.includes('THE CONTINUER'));
  assert.equal(VOICE_PROMPT_ADDENDUM, VOICE_PROMPT_ADDENDUM.trim());
});
