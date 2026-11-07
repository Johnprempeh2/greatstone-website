// Front door (GRE-416 spec rev 2, B2): everything the `front-door` edge function does that is not HTTP.
// Input stripping and wrapping, the shared output checks, validateProposal(), the two model calls and the
// signed session. Plain ESM on fetch + WebCrypto, so the edge function (Deno), the B6 eval (`node --test`)
// and a later Laravel port run the same code path. Prompts and fixed lines live in front-door-prompts.mjs.
import {
  CHECKS, MODEL, CHAT_MAX_TOKENS, PROPOSAL_MAX_TOKENS, CHAT_TURNS, EVEREST_OPENING,
  CLOSE_OK, CLOSE_STOP, DEFLECT, EVEREST_SYSTEM, PROPOSAL_SYSTEM, PROPOSAL_SCHEMA, NAME_BLOCKLIST,
} from './front-door-prompts.mjs';

export const TEAM_SIZES = ['1-10', '11-50', '51-250', '250+'];
export const LIMITS = { industry: 80, company: 80, word: 20, message: 500, reply: 1000 };

// ---------------------------------------------------------------------------------------------------
// Input: visitor text is data. Strip < and > (persona: "or replace them with ‹ ›") before it is wrapped.

const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
export const stripMarkup = (s) => String(s == null ? '' : s).replace(/</g, '‹').replace(/>/g, '›');
const field = (s, max) => stripMarkup(squash(s)).slice(0, max);

// The intake as the FrontDoor block sends it ({ industry, company, words, teamSize }), or in the test
// set's own shape ({ industry, company_name, brand_words, team_size }). Returns null when it is not usable.
export function normaliseIntake(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const industry = field(raw.industry, LIMITS.industry);
  const company = field(raw.company ?? raw.company_name, LIMITS.company);
  const rawWords = raw.words ?? raw.brand_words;
  const words = (Array.isArray(rawWords) ? rawWords : []).map((w) => field(w, LIMITS.word));
  const size = raw.teamSize ?? raw.team_size;
  if (!industry || !company || words.length !== 3 || words.some((w) => !w)) return null;
  return { industry, company, words, teamSize: TEAM_SIZES.includes(size) ? size : null };
}

// The chat as the page holds it: [{ from: 'everest' | 'visitor', text }], opening line first. The opening
// is page copy, so it is dropped here; what is left must alternate visitor, everest, visitor, ...
export function normaliseMessages(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 2 * CHAT_TURNS + 2) return null;
  const list = raw.slice();
  if (list[0] && list[0].from === 'everest' && squash(list[0].text) === EVEREST_OPENING) list.shift();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const want = i % 2 === 0 ? 'visitor' : 'everest';
    if (!m || m.from !== want || typeof m.text !== 'string') return null;
    // Everest's own replies were checked when we sent them; the session hash proves they are unchanged.
    const text = want === 'visitor' ? field(m.text, LIMITS.message) : squash(m.text).slice(0, LIMITS.reply);
    if (!text) return null;
    out.push({ from: want, text });
  }
  return out;
}

export const visitorCount = (messages) => messages.filter((m) => m.from === 'visitor').length;

export function intakeBlock(intake) {
  return [
    '<intake>',
    `industry: ${intake.industry}`,
    `company_name: ${intake.company}`,
    `brand_words: ${intake.words.join(', ')}`,
    `team_size: ${intake.teamSize || 'not given'}`,
    '</intake>',
  ].join('\n');
}

export const visitorTurn = (n, text) => `<visitor turn="${n}" of="${CHAT_TURNS}">${text}</visitor>`;

// Persona: first user turn is the intake block then the first visitor message; every later turn is one
// visitor message. Everest's earlier replies go back as assistant turns.
export function chatMessages(intake, messages) {
  let n = 0;
  return messages.map((m) => {
    if (m.from === 'everest') return { role: 'assistant', content: m.text };
    n++;
    const turn = visitorTurn(n, m.text);
    return { role: 'user', content: n === 1 ? `${intakeBlock(intake)}\n${turn}` : turn };
  });
}

// Proposal: the user message template. `<chat>none</chat>` when the visitor skipped the chat.
export function proposalUserMessage(intake, messages) {
  if (!visitorCount(messages)) return `${intakeBlock(intake)}\n<chat>none</chat>`;
  const lines = [`Everest: ${EVEREST_OPENING}`];
  for (const m of messages) lines.push(`${m.from === 'visitor' ? 'Visitor' : 'Everest'}: ${m.text}`);
  return `${intakeBlock(intake)}\n<chat>\n${lines.join('\n')}\n</chat>`;
}

// ---------------------------------------------------------------------------------------------------
// Output checks (GRE-466 `test-cases`, shared checks). Regex flags `im`, as the test set says.

const compile = (list) => list.map((src) => new RegExp(src, 'im'));
export const CHECK_RES = Object.fromEntries(Object.entries(CHECKS.must_not_match).map(([k, v]) => [k, compile(v)]));
export const CHAT_GROUPS = Object.keys(CHECK_RES);
export const VISIBLE_GROUPS = CHAT_GROUPS.filter((g) => g !== 'chat_only');
export const SUMMARY_GROUPS = ['leak', 'markup'];

// Names that must never appear in any output (FRONT_DOOR_PRIVATE_NAMES, a secret; never committed).
export function parsePrivateNames(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter((x) => x.length >= 2);
}

// The check groups a string fails, plus 'private_name' when it holds one of those names.
export function failedChecks(text, groups, privateNames = /** @type {string[]} */ ([])) {
  const s = String(text || '');
  const failed = groups.filter((g) => CHECK_RES[g].some((re) => re.test(s)));
  const low = s.toLowerCase();
  if (privateNames.some((n) => low.includes(n.toLowerCase()))) failed.push('private_name');
  return failed;
}

// The last question Everest asked, so a replaced reply can go back to it.
export function lastQuestion(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].from !== 'everest') continue;
    const qs = messages[i].text.match(/[^.?!]*\?/g);
    if (qs) return qs[qs.length - 1].trim();
  }
  return EVEREST_OPENING;
}

// Persona: run the shared checks before a reply reaches the page. A failed reply becomes DEFLECT then the
// last question (or the close, when the chat is closing). `closed` is 'stop', 'ok' or null.
export function guardReply(raw, messages, { privateNames = /** @type {string[]} */ ([]) } = {}) {
  const text = squash(raw).slice(0, LIMITS.reply);
  const turns = visitorCount(messages);
  let closed = text.includes(CLOSE_STOP) ? 'stop' : text.includes(CLOSE_OK) || turns >= CHAT_TURNS ? 'ok' : null;
  const failed = text ? failedChecks(text, CHAT_GROUPS, privateNames) : ['empty'];
  if (!failed.length) return { reply: text, closed, failed };
  let reply;
  if (closed === 'stop') reply = CLOSE_STOP;
  else if (closed === 'ok') reply = `${DEFLECT} ${CLOSE_OK}`;
  else reply = `${DEFLECT} ${lastQuestion(messages)}`;
  return { reply, closed, failed };
}

// ---------------------------------------------------------------------------------------------------
// validateProposal(): the source of truth for what the page may show (GRE-466 `proposal`, rules 1 to 7).

const NAME_RE = new RegExp(PROPOSAL_SCHEMA.properties.agents.items.properties.name.pattern);
const BLOCKED = new Set(NAME_BLOCKLIST.map((n) => n.toLowerCase()));
const AGENT_KEYS = PROPOSAL_SCHEMA.properties.agents.items.required;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const strList = (v, n, max) => Array.isArray(v) && v.length === n && v.every((x) => isStr(x, max));

// The strings a visitor sees: name, role, personality, first_tasks, works_with.
export function visibleStrings(proposal) {
  const out = [];
  for (const a of (proposal && Array.isArray(proposal.agents) ? proposal.agents : [])) {
    out.push(a.name, a.role, ...(a.personality || []), ...(a.first_tasks || []), a.works_with);
  }
  return out.filter((s) => typeof s === 'string');
}

export function validateProposal(p, { companyName = '', privateNames = /** @type {string[]} */ ([]) } = {}) {
  const errors = [];
  const err = (e) => { errors.push(e); return { ok: false, errors }; };
  if (!p || typeof p !== 'object' || Array.isArray(p)) return err('not an object');
  const top = Object.keys(PROPOSAL_SCHEMA.properties);
  if (Object.keys(p).some((k) => !top.includes(k))) errors.push('extra top-level field');
  if (!PROPOSAL_SCHEMA.properties.status.enum.includes(p.status)) errors.push('status');
  if (!PROPOSAL_SCHEMA.properties.decline_reason.enum.includes(p.decline_reason)) errors.push('decline_reason');
  if (!Array.isArray(p.agents) || p.agents.length > 3) return err('agents');
  if (!Array.isArray(p.chat_summary) || p.chat_summary.length > 5 || !p.chat_summary.every((s) => isStr(s, 140))) errors.push('chat_summary');
  p.agents.forEach((a, i) => {
    const at = `agent ${i + 1}`;
    if (!a || typeof a !== 'object') { errors.push(`${at}: not an object`); return; }
    if (Object.keys(a).some((k) => !AGENT_KEYS.includes(k))) errors.push(`${at}: extra field`);
    if (typeof a.name !== 'string' || !NAME_RE.test(a.name)) errors.push(`${at}: name`);
    if (!isStr(a.role, 60) || !a.role.trim()) errors.push(`${at}: role`);
    if (typeof a.is_lead !== 'boolean') errors.push(`${at}: is_lead`);
    if (!strList(a.personality, 3, 24)) errors.push(`${at}: personality`);
    if (!strList(a.first_tasks, 3, 90)) errors.push(`${at}: first_tasks`);
    if (!isStr(a.works_with, 120) || !a.works_with.trim()) errors.push(`${at}: works_with`);
  });
  if (errors.length) return { ok: false, errors };

  // Rules 2 and 3.
  if (p.status === 'ok') {
    if (p.agents.length !== 3) errors.push('ok needs exactly 3 agents');
    if (p.agents.filter((a) => a.is_lead).length !== 1) errors.push('ok needs exactly 1 lead');
    if (p.decline_reason !== 'none') errors.push('ok needs decline_reason none');
  } else {
    if (p.agents.length !== 0) errors.push('declined needs 0 agents');
    if (p.decline_reason === 'none') errors.push('declined needs a reason');
  }
  // Rules 4 and 5.
  const names = p.agents.map((a) => a.name.toLowerCase());
  if (new Set(names).size !== names.length) errors.push('names repeat');
  if (new Set(names.map((n) => n[0])).size !== names.length) errors.push('names share a first letter');
  for (const n of names) if (BLOCKED.has(n)) errors.push(`blocked name: ${n}`);
  // Rules 6 and 7.
  const company = squash(companyName).toLowerCase();
  for (const s of visibleStrings(p)) {
    const failed = failedChecks(s, VISIBLE_GROUPS, privateNames);
    if (failed.length) errors.push(`visible text fails: ${failed.join(', ')}`);
    if (company.length >= 4 && s.toLowerCase().includes(company)) errors.push('visible text holds the company name');
  }
  for (const s of p.chat_summary) {
    const failed = failedChecks(s, SUMMARY_GROUPS, privateNames);
    if (failed.length) errors.push(`chat_summary fails: ${failed.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------------
// Model calls. One fetch to the Messages API; no SDK, so Deno and Node share it.

export class ModelError extends Error {
  constructor(message, { status = 0, retryable = true } = {}) { super(message); this.status = status; this.retryable = retryable; }
}

export async function callModel(body, { apiKey, fetchImpl = (...a) => fetch(...a), timeoutMs = 45000 } = {}) {
  if (!apiKey) throw new ModelError('no api key', { retryable: false });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ModelError(`model unreachable: ${e && e.name}`, { retryable: true });
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data) {
    // 429 and 5xx are worth one more try; 4xx (bad request, spend cap, auth) are not.
    throw new ModelError(`model http ${res.status}`, { status: res.status, retryable: res.status === 429 || res.status >= 500 });
  }
  return data;
}

// Small Everest: one turn. `messages` ends with the visitor's newest message. No tools, no web access.
export async function runChat({ intake, messages, apiKey, fetchImpl = /** @type {((url: string, init: any) => Promise<Response>) | undefined} */ (undefined), privateNames = /** @type {string[]} */ ([]), model = MODEL }) {
  const data = await callModel({
    model, max_tokens: CHAT_MAX_TOKENS, system: EVEREST_SYSTEM, messages: chatMessages(intake, messages),
  }, { apiKey, fetchImpl, timeoutMs: 25000 });
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
  return guardReply(raw, messages, { privateNames });
}

// The copy of the schema sent to the API: the validator keeps every rule, the API gets the shape.
const { $schema, title, ...API_SCHEMA } = PROPOSAL_SCHEMA;
export const PROPOSAL_TOOL = {
  name: 'propose_team',
  description: "Return the visitor's three employees as one object matching this schema.",
  input_schema: API_SCHEMA,
};

// The proposal: one forced tool call, validated in code, retried once (spec S4). Throws ModelError when
// both attempts fail; `attempts` says why each one failed (no visitor text in it).
export async function runProposal({ intake, messages, apiKey, fetchImpl = /** @type {((url: string, init: any) => Promise<Response>) | undefined} */ (undefined), privateNames = /** @type {string[]} */ ([]), model = MODEL }) {
  const body = {
    model, max_tokens: PROPOSAL_MAX_TOKENS, system: PROPOSAL_SYSTEM,
    tools: [PROPOSAL_TOOL], tool_choice: { type: 'tool', name: PROPOSAL_TOOL.name },
    messages: [{ role: 'user', content: proposalUserMessage(intake, messages) }],
  };
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    try {
      const data = await callModel(body, { apiKey, fetchImpl });
      const use = (data.content || []).find((b) => b.type === 'tool_use' && b.name === PROPOSAL_TOOL.name);
      const proposal = use && use.input;
      const v = validateProposal(proposal, { companyName: intake.company, privateNames });
      if (v.ok) return { proposal, attempts };
      attempts.push(`invalid: ${v.errors.slice(0, 5).join('; ')}`);
    } catch (e) {
      attempts.push(e.message);
      if (e instanceof ModelError && !e.retryable) break;
    }
  }
  const e = new ModelError('proposal failed');
  e.attempts = attempts;
  throw e;
}

// What the page gets: the visible fields only. chat_summary is staff-only and stays on the server.
export const publicAgents = (proposal) => proposal.agents.map((a) => ({
  name: a.name, role: a.role, is_lead: a.is_lead, personality: a.personality, first_tasks: a.first_tasks, works_with: a.works_with,
}));

// ---------------------------------------------------------------------------------------------------
// Session: a Turnstile token is single-use, so after the bot check the function hands the page a short
// signed token. It carries a hash of the intake and transcript the server last answered, so the page
// cannot rewrite Everest's replies, reset the six-message cap or swap the intake mid-visit.

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

// Salted (keyed) SHA-256 of the IP: the clear address is never stored (spec section 3).
export const hashIp = async (ip, secret) => hex(await hmac(secret, `ip:${ip || 'unknown'}`));

export const transcriptHash = (intake, messages) => sha256(JSON.stringify({ intake, messages }));

export const SESSION_TTL_MS = 30 * 60 * 1000;

export async function signSession(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

// Returns the payload, or null when the token is malformed, tampered with or older than SESSION_TTL_MS.
export async function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = b64url(await hmac(secret, body));
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(body)); } catch { return null; }
  if (!payload || typeof payload.iat !== 'number' || now - payload.iat > SESSION_TTL_MS || payload.iat > now + 60000) return null;
  return payload;
}
