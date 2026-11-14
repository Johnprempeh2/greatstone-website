// Voice reply latency on a deployed site (GRE-5375). Signs in as one synthetic participant, opens a voice session and
// makes N Deepgram-shaped think calls, timing each from the caller's side. Numbers only; no turn text is printed.
//
//   VOICE_BENCH_LOGIN=/path/login.json node scripts/voice-latency-staging.mjs [turns=10] [site=https://gre3833-next-db-staging.netlify.app]
//
// login.json is { "email", "password" } for ONE synthetic account. The think handler answers only after it has loaded
// the session and run the pre-reply extraction, so `headers` is load + extraction (+ network); `firstText` is the first
// spoken text Deepgram would get (after Claude's first token and the first clause); `done` is the end of the reply.
import { readFileSync } from 'node:fs';
import { SMOKE_SCRIPT } from '../netlify/tests/lib/interview-harness.mjs';

const TURNS = Number(process.argv[2]) || 10;
const SITE = (process.argv[3] ?? 'https://gre3833-next-db-staging.netlify.app').replace(/\/$/, '');
const login = JSON.parse(readFileSync(process.env.VOICE_BENCH_LOGIN, 'utf8'));
const EXTRA = [
  'Mostly Excel and Sage, plus the email inbox where the PDFs land. The scanner is a separate tool that nobody really trusts.',
  'Probably the month-end pack. It takes two full days and half of it is copying the same numbers between three spreadsheets.',
];
const UTTERANCES = [...SMOKE_SCRIPT.slice(0, 5).map((e) => e.text), ...EXTRA, ...SMOKE_SCRIPT.slice(5).map((e) => e.text)];

let cookie = '';
async function call(path, body) {
  const res = await fetch(`${SITE}${path}`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: SITE, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [cookie, ...set.map((c) => c.split(';')[0])].filter(Boolean).join('; ');
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json?.error ?? ''}`);
  return json;
}

await call('/api/auth/sign-in/email', { email: login.email, password: login.password });
let page = await call('/api/interview/portal', { op: 'session-page', args: {} });
if (!page?.data?.sessionId) {
  // not started yet: give consent and start, as the portal's start button does
  await call('/api/interview/portal', { op: 'start', args: { dataConsent: true } });
  page = await call('/api/interview/portal', { op: 'session-page', args: {} });
}
const sessionId = page?.data?.sessionId;
if (!sessionId) throw new Error(`no open session for this account: ${JSON.stringify(Object.keys(page?.data ?? page ?? {}))} redirect=${page?.data?.redirect ?? ''}`);
const started = await call('/api/interview/voice/start', { sessionId });
const ep = started.settings.agent.think.endpoint;

const sseFrames = (text) => text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6))
  .map((d) => { try { return d === '[DONE]' ? d : JSON.parse(d); } catch { return null; } }).filter(Boolean);
const rows = [];
for (let i = 0; i < TURNS; i++) {
  const content = UTTERANCES[i % UTTERANCES.length];
  const t0 = performance.now();
  const res = await fetch(ep.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: ep.headers.authorization },
    body: JSON.stringify({ model: 'x', stream: true, messages: [{ role: 'user', content }] }) });
  const headers = Math.round(performance.now() - t0);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  let firstText = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    if (firstText === null && sseFrames(text).some((f) => f !== '[DONE]' && f.choices?.[0]?.delta?.content)) firstText = Math.round(performance.now() - t0);
  }
  const row = { turn: i + 1, status: res.status, headers, firstText, done: Math.round(performance.now() - t0),
    chars: sseFrames(text).filter((f) => f !== '[DONE]').map((f) => f.choices?.[0]?.delta?.content ?? '').join('').length };
  rows.push(row);
  console.log(JSON.stringify(row));
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const stages = {
  'load + extraction (to headers)': (r) => r.headers,
  'Claude first token + first clause': (r) => r.firstText - r.headers,
  'request to first spoken text': (r) => r.firstText,
  'request to reply done': (r) => r.done,
};
console.log('\nstage | median ms | worst ms');
for (const [k, f] of Object.entries(stages)) {
  const xs = rows.map(f).filter(Number.isFinite);
  console.log(`${k} | ${median(xs)} | ${Math.max(...xs)}`);
}
