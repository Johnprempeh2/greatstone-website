// Front door (Supabase Edge Function, Deno). Public: an anonymous visitor's intake, the small Everest chat
// and the three-employee proposal (GRE-416 spec rev 2, B2). Prompts, checks and model calls live in
// ../_shared/front-door-*.mjs so the B6 eval runs the same code under `node --test`.
// Guards, in order: Cloudflare Turnstile (then a signed session), field limits, six visitor messages,
// three proposals per IP a day (counted in the database, IP hashed), fixed max output tokens, retry once.
// Wire contract: src/lib/front-door.mjs (the FrontDoor block's client).
// Secrets: ANTHROPIC_API_KEY (website-only workspace with a monthly cap), TURNSTILE_SECRET_KEY,
// FRONT_DOOR_SECRET (signs sessions, keys the IP hash), optional FRONT_DOOR_PRIVATE_NAMES.
// Local, no cost: FRONT_DOOR_STUB=1 with no ANTHROPIC_API_KEY answers from ../_shared/front-door-stub.mjs
// (never in a hosted project). Use Turnstile's test secret 1x0000000000000000000000000000000AA with it.
// Deploy: supabase functions deploy front-door --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  normaliseIntake, normaliseMessages, visitorCount, runChat, runProposal, publicAgents,
  signSession, verifySession, transcriptHash, hashIp, sha256, parsePrivateNames,
} from '../_shared/front-door-engine.mjs';
import { CHAT_TURNS } from '../_shared/front-door-prompts.mjs';
import { stubAllowed, stubFetch, STUB_KEY } from '../_shared/front-door-stub.mjs';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const STUB = stubAllowed({
  flag: Deno.env.get('FRONT_DOOR_STUB'), apiKey: Deno.env.get('ANTHROPIC_API_KEY'), supabaseUrl: Deno.env.get('SUPABASE_URL'),
});
const API_KEY = STUB ? STUB_KEY : Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL_FETCH = STUB ? stubFetch : undefined;
if (STUB) console.warn('front-door: LOCAL STUB, replies are fixed lines, not a model');
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const SECRET = Deno.env.get('FRONT_DOOR_SECRET') ?? '';
const PRIVATE_NAMES = parsePrivateNames(Deno.env.get('FRONT_DOOR_PRIVATE_NAMES'));
const PROPOSALS_PER_DAY = 3;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// Visitor-safe sentences. Each one gives a next step; none says what went wrong inside.
const MSG = {
  offline: 'The team builder is not available right now. Please use the contact form and we will reply.',
  check: 'Please complete the check above and try again.',
  input: 'Check your answers and try again.',
  limit: 'You have built three teams today. Come back tomorrow, or use the contact form to talk to us.',
  chat: 'Everest could not answer just now. Try again, or skip and build your team.',
  propose: 'We could not build your team just now. Please try again, or use the contact form.',
  lead: 'We could not save your details just now. Please use the contact form and we will reply.',
};

const clientIp = (req: Request) =>
  (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64);

// A retried first call resends the same Turnstile token, which Cloudflare then calls a duplicate. Tokens
// this isolate verified in the last five minutes are accepted again (best effort; a cold isolate asks anew).
const verified = new Map<string, number>();
async function turnstileOk(token: unknown, ip: string) {
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  const key = await sha256(token);
  const now = Date.now();
  for (const [k, exp] of verified) if (exp < now) verified.delete(k);
  if (verified.has(key)) return true;
  try {
    const form = new FormData();
    form.append('secret', TURNSTILE_SECRET);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const out = await res.json();
    if (out?.success === true) { verified.set(key, now + 5 * 60 * 1000); return true; }
  } catch (e) { console.error('front-door: turnstile unreachable', String((e as Error)?.name || e)); }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!API_KEY || !TURNSTILE_SECRET || SECRET.length < 32) {
    console.error('front-door: not configured (ANTHROPIC_API_KEY, TURNSTILE_SECRET_KEY or FRONT_DOOR_SECRET missing)');
    return json({ error: MSG.offline }, 503);
  }
  let body: any;
  try { body = await req.json(); } catch { return json({ error: MSG.input }, 400); }
  const step = body?.step;
  if (!['chat', 'propose', 'lead'].includes(step)) return json({ error: MSG.input }, 400);

  // The lead store is B3 (GRE-463: front_door_leads, studio tab, Resend alert). Until it lands the page
  // gets a clear next step rather than a silent success.
  if (step === 'lead') return json({ error: MSG.lead }, 501);

  const ip = clientIp(req);

  // Bot check once, then the signed session carries the visit. `th` is the hash of the intake and the
  // transcript the server last answered; null means a fresh session with no chat yet.
  let session = await verifySession(body.session, SECRET);
  if (!session) {
    if (!(await turnstileOk(body.turnstile, ip))) return json({ error: MSG.check }, 403);
    session = { iat: Date.now(), th: null };
  }

  const intake = normaliseIntake(body.intake);
  const messages = normaliseMessages(body.messages);
  if (!intake || !messages) return json({ error: MSG.input }, 400);
  const turns = visitorCount(messages);

  try {
    if (step === 'chat') {
      // Hard stop in code: no model call past the sixth visitor message.
      if (turns < 1 || turns > CHAT_TURNS || messages[messages.length - 1].from !== 'visitor') return json({ error: MSG.input }, 400);
      const history = messages.slice(0, -1);
      const expect = history.length ? await transcriptHash(intake, history) : null;
      if (session.th !== expect) return json({ error: MSG.input }, 409);
      let out;
      try { out = await runChat({ intake, messages, apiKey: API_KEY, fetchImpl: MODEL_FETCH, privateNames: PRIVATE_NAMES }); }
      catch (e) { console.error('front-door: chat call failed', (e as Error).message); return json({ error: MSG.chat }, 502); }
      if (out.failed.length) console.warn('front-door: chat reply replaced', out.failed.join(','));
      const next = [...messages, { from: 'everest', text: out.reply }];
      const token = await signSession({ iat: session.iat, th: await transcriptHash(intake, next) }, SECRET);
      return json({ reply: out.reply, closed: out.closed, session: token });
    }

    // step === 'propose': the transcript must be the one the server last answered (or none at all).
    const expect = messages.length ? await transcriptHash(intake, messages) : null;
    if (messages.length ? session.th !== expect : turns !== 0) return json({ error: MSG.input }, 409);

    const ipHash = await hashIp(ip, SECRET);
    const { data: slot, error: slotErr } = await supabase.rpc('front_door_take_slot', { p_ip_hash: ipHash, p_limit: PROPOSALS_PER_DAY });
    if (slotErr) { console.error('front-door: rate limit unavailable', slotErr.message); return json({ error: MSG.offline }, 503); }
    if (!slot) return json({ error: MSG.limit }, 429);

    let result;
    try { result = await runProposal({ intake, messages, apiKey: API_KEY, fetchImpl: MODEL_FETCH, privateNames: PRIVATE_NAMES }); }
    catch (e) {
      console.error('front-door: proposal failed', ((e as any).attempts || [(e as Error).message]).join(' | '));
      // A failed build does not use up one of the visitor's three.
      await supabase.rpc('front_door_release_slot', { p_id: slot });
      return json({ error: MSG.propose }, 502);
    }
    const { proposal } = result;
    const token = await signSession({ iat: session.iat, th: expect, proposed: true }, SECRET);
    // leadId and the anonymous S5 record (with chat_summary) arrive with B3 (GRE-463).
    if (proposal.status === 'declined') return json({ status: 'declined', leadId: null, agents: [], session: token });
    return json({ status: 'ok', leadId: null, agents: publicAgents(proposal), session: token });
  } catch (e) {
    console.error('front-door: unexpected', String((e as Error)?.message || e));
    return json({ error: MSG.offline }, 500);
  }
});
