// Front door (GRE-416 spec rev 2): the browser half of "Meet your first three employees". Pure logic
// shared by the FrontDoor block and its tests: field limits, the intake shape, and the one client for
// the `front-door` Supabase edge function (B2). No model call, prompt or key lives here; the edge
// function owns all of that, so a Laravel move is a port of one endpoint.
//
// The wire contract with `front-door` (POST /functions/v1/front-door, anon apikey):
//   { step: 'chat',    turnstile?, session?, intake, messages }          → { reply, closed: 'ok'|'stop'|null, session }
//   { step: 'propose', turnstile?, session?, intake, messages, source }  → { status: 'ok'|'declined', leadId, agents, session }
//   { step: 'lead',    session, leadId, contact, consent }               → { ok: true }
// `turnstile` is the Cloudflare token, sent on the first call only; the function answers with a short
// `session` the page sends back on every later call (a Turnstile token is single-use, so the function
// should accept a token it verified itself in the last few minutes: a retried first call resends it).
// Errors: non-2xx with { error } (a visitor-safe sentence) or a non-JSON body.

export const TEAM_SIZES = ['1-10', '11-50', '51-250', '250+'];
export const OTHER = 'Other';
export const LIMITS = { company: 80, other: 40, word: 20, words: 3, message: 500, chatTurns: 6, name: 80, email: 254, role: 80 };

// The four fixed lines and opening are Harbor's (GRE-466 `persona`); the page shows the opening itself.
export const EVEREST_OPENING = 'What would you hand to a new hire on day one?';

// B7 wording (GRE-467 `wording`, draft 1). The version is stored with every consent; change both together.
export const CONSENT_VERSION = 'front-door-consent-v1';
export const NOTICE_INTAKE = 'We use what you enter here to build your three employees. An AI model provider processes it for us to make the proposal, and does not train on it. Please leave out personal or confidential details.';
export const CONSENT_LABEL = 'Greatstone can email me about my team and the walk-through. I can ask you to stop at any time.';
export const NOTICE_LEAD = 'We send your team pack to this address. If you tick the box, we keep your name, email and role with your team so we can follow up, for up to 24 months after we last speak, or until you ask us to delete them.';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// A brand word chip: one or two words, no markup characters, capped at the field limit.
export function normaliseWord(s) {
  return clean(s).replace(/[<>]/g, '').slice(0, LIMITS.word);
}

// Add a chip from what the visitor typed; returns the new list (unchanged when full, empty or a repeat).
export function addWord(words, raw) {
  const w = normaliseWord(raw);
  if (!w || words.length >= LIMITS.words) return words;
  if (words.some((x) => x.toLowerCase() === w.toLowerCase())) return words;
  return [...words, w];
}

// Check the S2 form. Returns { ok, errors: { field: message }, intake } where intake is the trimmed shape
// the edge function takes. Field messages are short and say what to do.
export function validateIntake({ industry, other, company, words, teamSize } = {}, sectors = []) {
  const errors = {};
  const ind = clean(industry);
  const oth = clean(other).slice(0, LIMITS.other);
  const comp = clean(company);
  const ws = (Array.isArray(words) ? words : []).map(normaliseWord).filter(Boolean);
  if (!ind || (ind !== OTHER && !sectors.includes(ind))) errors.industry = 'Choose your industry.';
  else if (ind === OTHER && !oth) errors.industry = 'Tell us your industry in a few words.';
  if (!comp) errors.company = 'Enter your company name.';
  else if (comp.length > LIMITS.company) errors.company = `Use ${LIMITS.company} characters or fewer.`;
  if (ws.length !== LIMITS.words) errors.words = 'Add three words for your brand.';
  const size = TEAM_SIZES.includes(teamSize) ? teamSize : null;
  const ok = Object.keys(errors).length === 0;
  return {
    ok, errors,
    intake: ok ? { industry: ind === OTHER ? oth : ind, industryOther: ind === OTHER, company: comp, words: ws, teamSize: size } : null,
  };
}

// Check the S6 form. Consent is optional (GRE-467 decision 2); the pack is sent either way.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateContact({ name, email, role, consent } = {}) {
  const errors = {};
  const n = clean(name).slice(0, LIMITS.name);
  const e = clean(email).slice(0, LIMITS.email);
  const r = clean(role).slice(0, LIMITS.role);
  if (!n) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(e)) errors.email = 'Enter a work email, like name@company.com.';
  if (!r) errors.role = 'Enter your role.';
  const ok = Object.keys(errors).length === 0;
  return {
    ok, errors,
    contact: ok ? { name: n, email: e, role: r } : null,
    consent: { given: !!consent, version: CONSENT_VERSION },
  };
}

// Lead first, then the other two in the order the model gave. Tolerates a missing or odd list.
export function orderAgents(agents) {
  const list = Array.isArray(agents) ? agents.filter((a) => a && a.name) : [];
  return [...list.filter((a) => a.is_lead), ...list.filter((a) => !a.is_lead)];
}

// The same name always gets the same avatar (GRE-466 `proposal`: code chooses, not the model).
export function avatarIndex(name, count) {
  const s = String(name || '').toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return count > 0 ? h % count : 0;
}

// The visit's source fields (spec section 3). Read from what analytics.js already stores; no new cookies.
export function readGaClientId(cookie) {
  const m = /(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)/.exec(String(cookie || ''));
  return m ? m[1] : null;
}

export class FrontDoorError extends Error {
  constructor(message, { status = 0, retryable = true } = {}) { super(message); this.status = status; this.retryable = retryable; }
}

const FALLBACK_ERROR = 'Something went wrong on our side. Please try again in a moment.';

// One client for the edge function. fetchImpl and endpoint are injected so tests and the editor canvas
// never touch the network. `retries` repeats a failed call that is worth repeating (network, 5xx);
// a 4xx (bad input, rate limit, bot check) is the visitor's answer and is not repeated.
export function makeFrontDoorClient({ url, anonKey, fetchImpl = (...a) => fetch(...a) } = {}) {
  let session = null;
  const configured = !!(url && anonKey);
  async function once(body) {
    let res;
    try {
      res = await fetchImpl(url.replace(/\/$/, '') + '/functions/v1/front-door', {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + anonKey },
        body: JSON.stringify(session ? { ...body, session } : body),
      });
    } catch (e) {
      throw new FrontDoorError(FALLBACK_ERROR, { status: 0, retryable: true });
    }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok || !data) {
      const msg = (data && typeof data.error === 'string' && data.error) || FALLBACK_ERROR;
      throw new FrontDoorError(msg, { status: res.status, retryable: res.status === 0 || res.status >= 500 });
    }
    if (data.session) session = data.session;
    return data;
  }
  async function call(body, retries = 0) {
    if (!configured) throw new FrontDoorError('The team builder is not set up on this site yet.', { retryable: false });
    for (let attempt = 0; ; attempt++) {
      try { return await once(body); } catch (e) {
        if (attempt >= retries || !e.retryable) throw e;
      }
    }
  }
  return {
    configured,
    chat: ({ intake, messages, turnstile }) => call({ step: 'chat', intake, messages, turnstile }),
    // spec S4: one structured call; if it fails, retry once, then the page shows the friendly error
    propose: ({ intake, messages, source, turnstile }) => call({ step: 'propose', intake, messages, source, turnstile }, 1),
    lead: ({ leadId, contact, consent }) => call({ step: 'lead', leadId, contact, consent }, 1),
  };
}
