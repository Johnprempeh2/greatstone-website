// Shared harness for the interview regression suites (GRE-2612, netlify/tests/interview-regress-*.test.mjs): the
// website ports of the source app's scripts/{security-probe,adversarial-chat,concurrency-verify,fuzzy-merge-test,
// corroboration-test,interview-smoke}.mjs. A real Postgres with every migration applied, the real handler factories,
// a fake Better Auth `verify`, a fake Anthropic client (never a real API) and a stub Deepgram grant.
//
// Every suite runs in both modes (docs/INTERVIEW-ENGINE.md "Typed only (the Indago fallback)"):
//   typed only  VOICE_ENABLED=0 with a Deepgram key still set, so the switch, not a missing key, takes voice away
//   voice on    VOICE_ENABLED=1 with a fake DEEPGRAM_API_KEY and a stub grant
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './postgres.mjs';
import { makeChatHandler } from '../../functions/interview-chat.mjs';
import { makePortalHandler } from '../../functions/interview-portal.mjs';
import { makeJoinHandler } from '../../functions/interview-join.mjs';
import { makeVoiceStartHandler } from '../../functions/interview-voice-start.mjs';
import { makeVoiceThinkHandler } from '../../functions/interview-voice-think.mjs';
import { setExtractionClient } from '../../functions/lib/interview/extraction.mjs';

export { skip };

const BASE_ENV = {
  INTERVIEW_ENABLED: '1',
  // a whole scripted interview runs inside one minute: the per-minute ceilings are lifted unless a test sets them
  CHAT_RATE_SESSION_PER_MIN: '1000', CHAT_RATE_EMPLOYEE_PER_MIN: '1000', JOIN_RATE_TOKEN_PER_MIN: '1000', JOIN_RATE_IP_PER_MIN: '1000',
  DEEPGRAM_API_KEY: 'dg-fake-key-for-tests',
};
export const MODES = [
  { name: 'typed only (VOICE_ENABLED=0)', voice: false, env: { ...BASE_ENV, VOICE_ENABLED: '0' } },
  { name: 'voice on (VOICE_ENABLED=1)', voice: true, env: { ...BASE_ENV, VOICE_ENABLED: '1' } },
];

export const ORG = '90000000-0000-4000-8000-0000000000aa';
export const ORIGIN = 'https://site.test';
export const quietLog = { info() {}, warn() {}, error() {}, log() {} };

// ─── database ────────────────────────────────────────────────────────────────

/** A throwaway cluster with every migration, one Greatstone tenant, and a pool (max 10, so requests truly overlap). */
export async function startInterviewDb(label) {
  const pgc = startPostgres(label);
  await pgc.migrate('003');
  const r = pgc.psql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone-regress', 'Greatstone');`);
  assert.equal(r.status, 0, r.stderr);
  await pgc.migrate();
  const pool = new pg.Pool({ connectionString: pgc.url, max: 10 });
  const sql = (q) => { const res = pgc.psql(q); assert.equal(res.status, 0, res.stderr); return res.stdout.trim(); };
  return { pgc, pool, sql, async stop() { await pool.end(); pgc.stop(); } };
}

/** A website organisation (customers.id) under the test tenant. */
export function newCustomer(sql, name = 'Client') {
  const id = randomUUID();
  sql(`INSERT INTO customers (id, org_id, slug, name) VALUES ('${id}', '${ORG}', 'c-${id.slice(0, 8)}', '${name.replace(/'/g, "''")}');`);
  return id;
}

/**
 * An open round as GSAM leaves it (bridge POST rounds/{id}): engagement, root + default team unit, an approved context
 * pack, enrolment on. branding_config.voice=false is the per-round typed-only switch.
 */
export function seedRound(sql, { customerId, clientName = 'Example Ltd', seatTotal = 10, domains = ['example.test'], voice = true,
  status = 'active', token = `tok${randomUUID().replace(/-/g, '')}` } = {}) {
  const id = randomUUID();
  const root = randomUUID();
  const team = randomUUID();
  const pack = randomUUID();
  const branding = voice === false ? `'{"voice": false}'` : `'{}'`;
  sql(`SET search_path TO interview, public;
    INSERT INTO engagement (id, customer_id, org_id, client_name, status, seat_total, enrol_token, enrol_enabled, allowed_email_domains,
      branding_config, cost_envelope_pence, mode)
      VALUES ('${id}', '${customerId}', '${ORG}', '${clientName}', '${status}', ${seatTotal}, '${token}', true,
        '{${domains.join(',')}}', ${branding}, 50000, 'team');
    INSERT INTO org_unit (id, engagement_id, parent_id, name, kind) VALUES ('${root}', '${id}', NULL, '${clientName}', 'organisation');
    INSERT INTO org_unit (id, engagement_id, parent_id, name, kind) VALUES ('${team}', '${id}', '${root}', 'Finance', 'team');
    INSERT INTO context_pack (id, engagement_id, version, content, status, approved_by)
      VALUES ('${pack}', '${id}', 1, '{"company_background": "A test company.", "scope": "Finance operations."}', 'approved', 'gsam');
    UPDATE engagement SET default_unit_id = '${team}', context_pack_id = '${pack}', context_pack_version = 1 WHERE id = '${id}';`);
  return { id, customerId, token, rootUnit: root, teamUnit: team };
}

/** One transaction as interview_worker with these claims (null: none), as interviewDb() runs each statement. */
export async function asWorker(pool, claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE interview_worker');
    if (claims) await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ─── accounts (Better Auth, faked through the handlers' injectable verify) ───

/** A website account. The bearer `tok:<id>` is what the fake verify accepts (userFromRequest's verify seam). */
export function account(label, { domain = 'example.test', verified = true } = {}) {
  const id = `ba-${label}-${randomUUID().slice(0, 8)}`;
  return { id, email: `${label}.${id.slice(-8)}@${domain}`, name: label[0].toUpperCase() + label.slice(1), emailVerified: verified };
}

export function makeVerify(accounts) {
  const byToken = new Map(accounts.map((a) => [`tok:${a.id}`, a]));
  return async (token) => byToken.get(token) ?? null;
}

/** A POST to one of the interview endpoints, signed in as `user` (or anonymous). `raw` sends a body verbatim. */
export function post(path, { user, body, raw, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer tok:${user.id}` } : {}), ...headers },
    body: raw ?? JSON.stringify(body ?? {}),
  });
}

// ─── fake models ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A fake Anthropic client for the reply stream (chat and voice think): `messages.stream()` yields text deltas and a
 * final message with usage, like the SDK's MessageStream. `calls` records every request.
 */
export function fakeReplyModel({ reply = (n) => `Thanks, that is really helpful. Could you tell me a little more about that? (${n})`, delayMs = 0 } = {}) {
  const calls = [];
  const client = {
    messages: {
      stream(params) {
        calls.push(params);
        const text = reply(calls.length, params);
        const chunks = text.match(/[\s\S]{1,16}/g) ?? [];
        return {
          async *[Symbol.asyncIterator]() {
            if (delayMs) await sleep(delayMs);
            for (const c of chunks) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } };
          },
          async finalMessage() { return { usage: { input_tokens: 1500, output_tokens: 60 } }; },
        };
      },
    },
  };
  return { calls, model: () => client };
}

const EMPTY_EXTRACTION = {
  taxonomy_updates: { role: null, tasks_add: [], pains_add: [], automation_candidates_add: [], time_costs_add: [] },
  insights: [], special_category_detected: false, consent_updates: { attribution: null, memory_opt_in: null }, slot_updates: {},
};

/** The employee message runExtraction put into EXTRACTION_PROMPT's {{LATEST_EXCHANGE}}. */
export function employeeMessageOf(prompt) {
  const m = /EMPLOYEE: ([\s\S]*?)\n\nON_BEHALF MODE:/.exec(prompt);
  return m ? m[1] : null;
}

/**
 * Installs a fake extraction client (setExtractionClient, the module's test seam). `script` entries match an employee
 * message exactly and return their slots, insights (quotes must be verbatim) and consent; anything else extracts
 * nothing. Deterministic, so the phase machine advances exactly as the script says.
 */
export function installFakeExtraction(script = [], { delayMs = 0 } = {}) {
  const calls = [];
  setExtractionClient({
    messages: {
      async create(params) {
        const prompt = params.messages[0].content;
        const message = employeeMessageOf(prompt);
        calls.push({ params, message });
        if (delayMs) await sleep(delayMs);
        const entry = script.find((e) => e.text === message);
        const out = structuredClone(EMPTY_EXTRACTION);
        if (entry) {
          out.slot_updates = entry.slots ?? {};
          out.consent_updates = { attribution: entry.consent?.attribution ?? null, memory_opt_in: entry.consent?.memory_opt_in ?? null };
          out.insights = (entry.insights ?? []).map((i) => ({ type: i.type, label: i.label, evidence_quote: i.quote, implication: null,
            time_per_week_hours: i.hours ?? null, confidence: i.confidence ?? 0.85, second_hand: false }));
        }
        return { usage: { input_tokens: 900, output_tokens: 150 }, content: [{ type: 'text', text: JSON.stringify(out) }] };
      },
    },
  });
  return { calls, reset: () => setExtractionClient(null) };
}

// The source smoke script's eight turns (scripts/interview-smoke.mjs), with the slots a real extraction fills for each.
const filled = (...names) => Object.fromEntries(names.map((n) => [n, 'filled']));
export const SMOKE_SCRIPT = [
  { text: "Hi! I'm Dan Mills, I'm an accounts assistant here. Been with the company about three years now. I report to Priya, the finance manager, and I work most closely with the warehouse team and our two credit controllers.",
    slots: { warm_up: filled('role_confirmed', 'tenure_and_team', 'rapport_established', 'mode_confirmed') } },
  { text: 'A real week? Monday mornings I pull the weekend sales out of the till system and re-key them into the board pack spreadsheet, that takes most of the morning. The rest of the week is supplier invoices - I copy the lines from the PDF invoices into Sage by hand, every day. And month-end I do the supplier statement reconciliations, plus I spend a chunk of every afternoon chasing the warehouse for delivery confirmations before I can book anything.',
    slots: { day_in_the_life: filled('daily_tasks', 'weekly_monthly_cycles', 'tools_inventory', 'handoffs_in_out') },
    insights: [{ type: 'task', label: 'Re-keying weekend till sales into the board pack', quote: 'I pull the weekend sales out of the till system and re-key them into the board pack spreadsheet' }] },
  { text: 'The invoice keying is the worst one honestly. Takes me about two hours every morning, so call it ten hours a week. Most of that is copying numbers from the PDF into Sage and fixing what the scanner got wrong. If I mis-key a line the payment run goes out wrong and a supplier rings up angry, then Priya and I spend half a day unpicking it.',
    slots: { pain_mapping: filled('top_pains_named', 'time_costs_quantified') },
    insights: [{ type: 'pain', label: 'Manual invoice keying into Sage', quote: 'Most of that is copying numbers from the PDF into Sage and fixing what the scanner got wrong', hours: 10, confidence: 0.9 }] },
  { text: "When it goes wrong the credit controllers feel it first because suppliers ring them, not me. And I can't book anything at all until the warehouse confirms the delivery, which can sit with them for two or three days - the chasing alone is probably another four hours a week. It happens every single week, without fail.",
    slots: { pain_mapping: filled('severity_probed', 'dependencies_mapped') },
    insights: [{ type: 'pain', label: 'Waiting on warehouse delivery confirmations', quote: "I can't book anything at all until the warehouse confirms the delivery", hours: 4 }] },
  { text: "Magic wand? Easy - something that reads the supplier invoice PDFs and puts the lines into Sage for me to approve. That's most of my mornings back. With the time back I'd actually get the reconciliations done properly during the month instead of in a panic at month-end.",
    slots: { automation_surfacing: filled('candidates_proposed', 'candidates_reacted', 'feasibility_signals') },
    insights: [{ type: 'automation_candidate', label: 'Automated reading of supplier invoice PDFs into Sage', quote: 'something that reads the supplier invoice PDFs and puts the lines into Sage for me to approve' }] },
  { text: "I think we've covered the big stuff. The only other thing is the till system export breaks every time IT pushes an update, worth knowing. You should definitely talk to Esi in the warehouse - her week looks nothing like mine and she sees the delivery side of all this.",
    slots: { sign_off: filled('insights_read_back', 'corrections_taken') } },
  { text: "I'm happy for my quotes to carry my name, no problem at all.",
    slots: { sign_off: filled('attribution_preference') }, consent: { attribution: 'named' } },
  { text: "Yes, happy for you to remember this conversation next time. That's everything from me, thanks!",
    slots: { sign_off: filled('memory_opt_in_asked') }, consent: { memory_opt_in: true } },
];
for (const e of SMOKE_SCRIPT) for (const i of e.insights ?? []) assert.ok(e.text.includes(i.quote), `script quote not verbatim: ${i.quote}`);

// ─── handlers and response readers ───────────────────────────────────────────

/** Deepgram's grant, stubbed: a short-lived token whenever a key is configured, as grantDeepgramToken answers. */
export function stubGrant() {
  const calls = [];
  return { calls, grant: async (env) => { calls.push(env.DEEPGRAM_API_KEY); return env.DEEPGRAM_API_KEY ? `dg-grant-${calls.length}` : null; } };
}

/** The five interviewee endpoints, built from their factories with the test pool, env, verify and models. */
export function makeHandlers({ pool, env, verify, replyModel = fakeReplyModel(), grant = stubGrant() }) {
  const p = () => pool;
  return {
    replyModel, grant,
    chat: makeChatHandler({ pool: p, verify, model: replyModel.model, env, log: quietLog }),
    portal: makePortalHandler({ pool: p, verify, env, log: quietLog }),
    join: makeJoinHandler({ pool: p, verify, env, log: quietLog }),
    voiceStart: makeVoiceStartHandler({ pool: p, verify, grant: grant.grant, env }),
    voiceThink: makeVoiceThinkHandler({ pool: p, model: replyModel.model, env, log: quietLog }),
  };
}

/** Parse a whole SSE body into its data frames (JSON, or the literal '[DONE]'). */
export function sseFrames(text) {
  return text.split('\n\n').map((f) => f.split('\n').find((l) => l.startsWith('data: '))).filter(Boolean)
    .map((l) => l.slice(6)).map((d) => (d === '[DONE]' ? d : JSON.parse(d)));
}

/** One chat request: { status, json } for a JSON answer, or { status, events, meta, done, reply } for the SSE stream. */
export async function chat(h, user, body) {
  const res = await h.chat(post('/api/interview/chat', { user, body }));
  const text = await res.text();
  if (!(res.headers.get('content-type') ?? '').startsWith('text/event-stream')) return { status: res.status, json: JSON.parse(text) };
  const events = sseFrames(text);
  return { status: res.status, events, meta: events.find((e) => e.type === 'meta'), done: events.find((e) => e.type === 'done'),
    error: events.find((e) => e.type === 'error'), reply: events.filter((e) => e.type === 'delta').map((e) => e.text).join('') };
}

export async function portal(h, user, op, args = {}) {
  const res = await h.portal(post('/api/interview/portal', { user, body: { op, args } }));
  return { status: res.status, body: await res.json() };
}

export async function joinEnrol(h, user, token, name = user?.name) {
  const res = await h.join(post('/api/interview/join', { user, body: { op: 'enrol', token, name } }));
  return { status: res.status, body: await res.json() };
}

/** Join a round by its token, consent, take a seat and open the session: the participant's first minute. */
export async function joinAndStart(h, user, round) {
  const joined = await joinEnrol(h, user, round.token);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const started = await portal(h, user, 'start', { dataConsent: true });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.data.redirect, '#portal/interview/session', JSON.stringify(started.body));
  const page = await portal(h, user, 'session-page');
  assert.equal(page.status, 200);
  assert.ok(page.body.data.sessionId, JSON.stringify(page.body));
  return page.body.data.sessionId;
}

/** voice/start for a session: { status, body }. */
export async function voiceStart(h, user, sessionId) {
  const res = await h.voiceStart(post('/api/interview/voice/start', { user, body: { sessionId } }));
  return { status: res.status, body: await res.json() };
}

/** The think URL and bearer the server put into Settings (what Deepgram would call). */
export function thinkTarget(settings) {
  const ep = settings.agent.think.endpoint;
  return { url: ep.url, authorization: ep.headers.authorization };
}

/** A Deepgram-shaped think call (OpenAI Chat Completions body). */
export async function think(h, { url, authorization }, content) {
  const headers = { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) };
  const res = await h.voiceThink(new Request(url, { method: 'POST', headers,
    body: JSON.stringify({ model: 'x', stream: true, messages: content ? [{ role: 'user', content }] : [] }) }));
  const text = await res.text();
  const isSse = (res.headers.get('content-type') ?? '').startsWith('text/event-stream');
  const frames = isSse ? sseFrames(text) : [];
  const spoken = frames.filter((f) => f !== '[DONE]').map((f) => f.choices?.[0]?.delta?.content ?? '').join('');
  return { status: res.status, isSse, frames, spoken, body: isSse ? null : JSON.parse(text) };
}
