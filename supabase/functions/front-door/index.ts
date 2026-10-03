// Front door (Supabase Edge Function, Deno). Public: an anonymous visitor's intake, the small Everest chat
// and the three-employee proposal (GRE-416 spec rev 2, B2). Prompts, checks and model calls live in
// ../_shared/front-door-*.mjs so the B6 eval runs the same code under `node --test`.
// Guards, in order: Cloudflare Turnstile (then a signed session), field limits, six visitor messages,
// three proposals per IP a day (counted in the database, IP hashed), fixed max output tokens, retry once.
// Leads (B3): an anonymous row at S5, the contact added at S6, then the internal Resend alert (S8). If the
// row cannot be saved, the alert carries the contact instead, so a lead is never silently lost.
// Team pack (B4, GRE-464): at S6 the visitor's three employees go to the address they typed, once per lead
// (0032's pack_sent_at claim), tick or no tick (GRE-467). The alert says whether it went.
// Pipedrive (B9, GRE-469): after that, a lead with the contact tick becomes a Person and a Deal, once per lead
// (0033's pipedrive_synced_at claim), in the background so the visitor does not wait on the CRM.
// Wire contract: src/lib/front-door.mjs (the FrontDoor block's client).
// Secrets: ANTHROPIC_API_KEY (website-only workspace with a monthly cap), TURNSTILE_SECRET_KEY,
// FRONT_DOOR_SECRET (signs sessions, keys the IP hash), optional FRONT_DOOR_PRIVATE_NAMES. For the S8 alert:
// RESEND_API_KEY, RESEND_FROM, FRONT_DOOR_ALERT_TO (comma list), optional APP_SITE_ORIGIN; no alert without them.
// The team pack needs RESEND_API_KEY and RESEND_FROM; optional FRONT_DOOR_BOOKING_URL (default: the site's Calendly).
// Pipedrive: PIPEDRIVE_API_TOKEN, optional PIPEDRIVE_DOMAIN and PIPEDRIVE_STAGE_ID; no push without the token.
// Deploy: supabase functions deploy front-door --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  normaliseIntake, normaliseMessages, visitorCount, runChat, runProposal, publicAgents,
  signSession, verifySession, transcriptHash, hashIp, sha256, parsePrivateNames,
} from '../_shared/front-door-engine.mjs';
import { CHAT_TURNS } from '../_shared/front-door-prompts.mjs';
import { leadRow, contactUpdate, buildAlertEmail, sendEmail, isLeadId } from '../_shared/front-door-leads.mjs';
import { deliverTeamPack, BOOKING_URL } from '../_shared/front-door-pack.mjs';
import { crmConfig, syncLeadToCrm } from '../_shared/front-door-crm.mjs';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const SECRET = Deno.env.get('FRONT_DOOR_SECRET') ?? '';
const PRIVATE_NAMES = parsePrivateNames(Deno.env.get('FRONT_DOOR_PRIVATE_NAMES'));
const PROPOSALS_PER_DAY = 3;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? '';
const ALERT_TO = (Deno.env.get('FRONT_DOOR_ALERT_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SITE_ORIGIN = (Deno.env.get('APP_SITE_ORIGIN') || 'https://greatstoneint.com').replace(/\/+$/, '');
const STUDIO_URL = SITE_ORIGIN + '/#catalogue/leads';
const BOOKING = Deno.env.get('FRONT_DOOR_BOOKING_URL') || BOOKING_URL;
const CRM = crmConfig(Deno.env.toObject());

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

// S5: save the anonymous lead and return its id, or null (logged) so the visitor still sees their team.
async function saveLead(intake: any, industryOther: boolean, proposal: any, turns: number, source: unknown): Promise<string | null> {
  try {
    await supabase.rpc('front_door_purge');  // retention (spec §3); best effort
    const { data: org } = await supabase.from('organisations').select('id').order('created_at').limit(1).maybeSingle();
    if (!org) { console.error('front-door: no organisation for the lead'); return null; }
    const { data, error } = await supabase.from('front_door_leads')
      .insert(leadRow({ orgId: org.id, intake, industryOther, proposal, turns, source })).select('id').single();
    if (error) { console.error('front-door: lead not saved', error.message); return null; }
    return data.id;
  } catch (e) { console.error('front-door: lead not saved', String((e as Error)?.message || e)); return null; }
}

// S6: the visitor's team pack, once per lead. `taken` means an earlier S6 already sent it.
async function sendPack(lead: any, contact: Record<string, unknown>) {
  const out = await deliverTeamPack({
    lead, contact, bookingUrl: BOOKING, siteOrigin: SITE_ORIGIN,
    claim: async () => {
      const { data, error } = await supabase.from('front_door_leads').update({ pack_sent_at: new Date().toISOString() })
        .eq('id', lead.id).is('pack_sent_at', null).select('id').maybeSingle();
      if (error) { console.error('front-door: pack claim failed', error.message); return 'error'; }
      return data ? 'claimed' : 'taken';
    },
    release: async () => { await supabase.from('front_door_leads').update({ pack_sent_at: null }).eq('id', lead.id); },
    send: (msg: any) => sendEmail({ apiKey: RESEND_KEY, from: RESEND_FROM, ...msg }),
  });
  if (!out.sent) console.warn('front-door: team pack not sent', out.reason);
  return out.sent;
}

const alert = (opts: Parameters<typeof buildAlertEmail>[0]) =>
  sendEmail({ apiKey: RESEND_KEY, from: RESEND_FROM, to: ALERT_TO, ...buildAlertEmail(opts) });

// S6: add the contact to the visitor's own lead (the session names it), then alert once. When the row is
// missing or the database fails, the alert is the record; only if that fails too does the visitor get the
// contact-form message.
async function takeContact(leadId: string | null, update: Record<string, unknown>) {
  let lead: any = null;
  if (leadId) {
    try {
      const { data, error } = await supabase.from('front_door_leads').update(update).eq('id', leadId)
        .select('id, industry, industry_other, team_size, company_name, agents, source, consent_given, alert_sent_at').maybeSingle();
      if (error) console.error('front-door: contact not saved', error.message);
      lead = data;
    } catch (e) { console.error('front-door: contact not saved', String((e as Error)?.message || e)); }
  }
  // No row means no saved team, so no pack; the fallback alert says so and staff send it by hand.
  if (!lead) {
    const sent = await alert({ contact: update, studioUrl: STUDIO_URL, packSent: false });
    if (!sent.sent) console.error('front-door: lead lost, fallback alert failed', sent.error);
    return { ok: sent.sent, pack: false };
  }
  const pack = await sendPack(lead, update);
  if (!lead.alert_sent_at) {
    const sent = await alert({ lead, studioUrl: STUDIO_URL, packSent: pack });
    if (sent.sent) await supabase.from('front_door_leads').update({ alert_sent_at: new Date().toISOString() }).eq('id', lead.id);
    else console.warn('front-door: alert not sent', sent.error);
  }
  background(pushToCrm(lead, update));
  return { ok: true, pack };
}

// Keep the isolate alive for work the response does not wait on (Supabase Edge Runtime). The promise never
// rejects (syncLeadToCrm catches), so elsewhere it simply runs on.
function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(p);
}

// S6, after the pack and the alert: Pipedrive, only with the contact tick. A failure is logged and leaves the
// claim open for a later S6; the lead is already in the studio and the alert has gone, so nothing is lost.
async function pushToCrm(lead: any, contact: Record<string, unknown>) {
  const out = await syncLeadToCrm({
    config: CRM, lead, contact, studioUrl: STUDIO_URL,
    claim: async () => {
      const { data, error } = await supabase.from('front_door_leads').update({ pipedrive_synced_at: new Date().toISOString() })
        .eq('id', lead.id).is('pipedrive_synced_at', null).select('id').maybeSingle();
      if (error) { console.error('front-door: pipedrive claim failed', error.message); return 'error'; }
      return data ? 'claimed' : 'taken';
    },
    release: async () => { await supabase.from('front_door_leads').update({ pipedrive_synced_at: null }).eq('id', lead.id); },
    save: async ({ personId, dealId }: { personId: number; dealId: number }) => {
      await supabase.from('front_door_leads').update({ pipedrive_person_id: personId, pipedrive_deal_id: dealId }).eq('id', lead.id);
    },
  });
  if (!out.synced && out.reason !== 'not configured' && out.reason !== 'no consent') console.error('front-door: pipedrive not synced', out.reason);
  else if (out.reason === 'synced without note') console.warn('front-door: pipedrive deal has no note', lead.id);
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

  // S6 needs the session from S5 (which passed the bot check) and may only name that session's lead.
  if (step === 'lead') {
    const s = await verifySession(body.session, SECRET);
    if (!s || !s.proposed || !('lid' in s)) return json({ error: MSG.lead }, 409);
    if (body.leadId != null && body.leadId !== s.lid) return json({ error: MSG.input }, 409);
    const update = contactUpdate(body);
    if (!update) return json({ error: MSG.input }, 400);
    const out = await takeContact(isLeadId(s.lid) ? s.lid : null, update);
    return out.ok ? json({ ok: true, pack: out.pack }) : json({ error: MSG.lead }, 502);
  }

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
      try { out = await runChat({ intake, messages, apiKey: API_KEY, privateNames: PRIVATE_NAMES }); }
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
    try { result = await runProposal({ intake, messages, apiKey: API_KEY, privateNames: PRIVATE_NAMES }); }
    catch (e) {
      console.error('front-door: proposal failed', ((e as any).attempts || [(e as Error).message]).join(' | '));
      // A failed build does not use up one of the visitor's three.
      await supabase.rpc('front_door_release_slot', { p_id: slot });
      return json({ error: MSG.propose }, 502);
    }
    const { proposal } = result;
    // A declined proposal keeps nothing (least data). The S6 session restarts the clock, so the visitor has
    // the full session time to fill in the form, and names the one lead it may add a contact to.
    if (proposal.status === 'declined') {
      const token = await signSession({ iat: session.iat, th: expect, proposed: true }, SECRET);
      return json({ status: 'declined', leadId: null, agents: [], session: token });
    }
    const leadId = await saveLead(intake, body.intake?.industryOther === true, proposal, turns, body.source);
    const token = await signSession({ iat: Date.now(), th: expect, proposed: true, lid: leadId }, SECRET);
    return json({ status: 'ok', leadId, agents: publicAgents(proposal), session: token });
  } catch (e) {
    console.error('front-door: unexpected', String((e as Error)?.message || e));
    return json({ error: MSG.offline }, 500);
  }
});
