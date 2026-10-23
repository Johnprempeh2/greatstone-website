// Public front door. The approved prompts and email templates remain in the shared modules used by the
// former Edge Function. Database work always enters through an anon, transaction-local RLS context.
import { randomUUID } from 'node:crypto';
import { getPool } from './lib/db.mjs';
import { publicIp } from './lib/public-actions.mjs';
import { takeSlot, releaseSlot, saveLead, updateContact, stamp, saveCrmIds } from './lib/front-door-store.mjs';
import {
  normaliseIntake, normaliseMessages, visitorCount, runChat, runProposal, publicAgents,
  signSession, verifySession, transcriptHash, hashIp, sha256, parsePrivateNames,
} from '../../supabase/functions/_shared/front-door-engine.mjs';
import { CHAT_TURNS } from '../../supabase/functions/_shared/front-door-prompts.mjs';
import { stubAllowed, stubFetch, STUB_KEY } from '../../supabase/functions/_shared/front-door-stub.mjs';
import { leadRow, contactUpdate, buildAlertEmail, sendEmail, isLeadId } from '../../supabase/functions/_shared/front-door-leads.mjs';
import { deliverTeamPack, BOOKING_URL } from '../../supabase/functions/_shared/front-door-pack.mjs';
import { crmConfig, syncLeadToCrm } from '../../supabase/functions/_shared/front-door-crm.mjs';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const MSG = {
  offline: 'The team builder is not available right now. Please use the contact form and we will reply.',
  check: 'Please complete the check above and try again.',
  input: 'Check your answers and try again.',
  limit: 'You have built three teams today. Come back tomorrow, or use the contact form to talk to us.',
  chat: 'Everest could not answer just now. Try again, or skip and build your team.',
  propose: 'We could not build your team just now. Please try again, or use the contact form.',
  lead: 'We could not save your details just now. Please use the contact form and we will reply.',
};

const verified = new Map();
export function stagingStubAllowed(env) {
  let host;
  try { host = new URL(env.URL).hostname; } catch { return false; }
  // This dedicated staging site may receive a platform-injected model credential. The explicit
  // staging flag still selects the fixed local responses until the live model is approved for testing.
  return env.FRONT_DOOR_STUB === '1' &&
    env.SITE_ID === '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb' &&
    env.SITE_NAME === 'gre1795-website-db-staging' &&
    host === 'gre1795-website-db-staging.netlify.app';
}
async function turnstileOk(token, ip, secret, fetchImpl) {
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  const key = await sha256(token);
  const now = Date.now();
  for (const [k, exp] of verified) if (exp < now) verified.delete(k);
  if (verified.has(key)) return true;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    if ((await res.json())?.success === true) { verified.set(key, now + 300000); return true; }
  } catch { /* visitor gets the existing check message */ }
  return false;
}

export function makeFrontDoorHandler({ pool = getPool, env = process.env, fetchImpl = fetch, log = console.error } = {}) {
  const stub = stagingStubAllowed(env) || (!env.NETLIFY && !env.CONTEXT &&
    stubAllowed({ flag: env.FRONT_DOOR_STUB, apiKey: env.ANTHROPIC_API_KEY,
      supabaseUrl: env.NETLIFY_DB_URL || env.DATABASE_URL }));
  const apiKey = stub ? STUB_KEY : env.ANTHROPIC_API_KEY || '';
  const modelFetch = stub ? stubFetch : fetchImpl;
  const secret = env.FRONT_DOOR_SECRET || '';
  const privateNames = parsePrivateNames(env.FRONT_DOOR_PRIVATE_NAMES);
  const resend = { apiKey: env.RESEND_API_KEY || '', from: env.RESEND_FROM || '', fetchImpl };
  const alertTo = (env.FRONT_DOOR_ALERT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = (env.APP_SITE_ORIGIN || 'https://greatstoneint.com').replace(/\/+$/, '');
  const studioUrl = origin + '/#catalogue/leads';
  const bookingUrl = env.FRONT_DOOR_BOOKING_URL || BOOKING_URL;
  const crm = crmConfig(env);
  const alert = (opts) => sendEmail({ ...resend, to: alertTo, ...buildAlertEmail(opts) });
  const db = () => pool();

  async function sendPack(lead, contact) {
    const out = await deliverTeamPack({
      lead, contact, bookingUrl, siteOrigin: origin,
      claim: async () => {
        try { return await stamp(db(), lead.id, 'pack_sent_at', new Date().toISOString(), true) ? 'claimed' : 'taken'; }
        catch (e) { log('front-door: pack claim failed', e?.code || e?.name); return 'error'; }
      },
      release: () => stamp(db(), lead.id, 'pack_sent_at', null),
      send: (msg) => sendEmail({ ...resend, ...msg }),
    });
    if (!out.sent) log('front-door: team pack not sent', out.reason);
    return out.sent;
  }

  async function pushToCrm(lead, contact) {
    const out = await syncLeadToCrm({
      config: crm, lead, contact, studioUrl, fetchImpl,
      claim: async () => {
        try { return await stamp(db(), lead.id, 'pipedrive_synced_at', new Date().toISOString(), true) ? 'claimed' : 'taken'; }
        catch (e) { log('front-door: CRM claim failed', e?.code || e?.name); return 'error'; }
      },
      release: () => stamp(db(), lead.id, 'pipedrive_synced_at', null),
      save: ({ personId, dealId }) => saveCrmIds(db(), lead.id, personId, dealId),
    });
    if (!out.synced && out.reason !== 'not configured' && out.reason !== 'no consent') log('front-door: CRM not synced', out.reason);
  }

  async function takeContact(leadId, update, context) {
    let lead = null;
    if (leadId) {
      try { lead = await updateContact(db(), leadId, update); }
      catch (e) { log('front-door: contact not saved', e?.code || e?.name); }
    }
    if (!lead) {
      const sent = await alert({ contact: update, studioUrl, packSent: false });
      if (!sent.sent) log('front-door: fallback alert failed', sent.error);
      return { ok: sent.sent, pack: false };
    }
    const pack = await sendPack(lead, update);
    if (!lead.alert_sent_at) {
      const sent = await alert({ lead, studioUrl, packSent: pack });
      if (sent.sent) {
        try { await stamp(db(), lead.id, 'alert_sent_at', new Date().toISOString()); }
        catch (e) { log('front-door: alert stamp failed', e?.code || e?.name); }
      } else log('front-door: alert not sent', sent.error);
    }
    const pending = pushToCrm(lead, update);
    if (typeof context?.waitUntil === 'function') context.waitUntil(pending);
    else await pending;
    return { ok: true, pack };
  }

  return async (req, context) => {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!apiKey || !env.TURNSTILE_SECRET_KEY || secret.length < 32)
      return json({ error: MSG.offline }, 503);
    let body;
    try { body = await req.json(); } catch { return json({ error: MSG.input }, 400); }
    const step = body?.step;
    if (!['chat', 'propose', 'lead'].includes(step)) return json({ error: MSG.input }, 400);
    if (step === 'lead') {
      const session = await verifySession(body.session, secret);
      if (!session || !session.proposed || !('lid' in session)) return json({ error: MSG.lead }, 409);
      if (body.leadId != null && body.leadId !== session.lid) return json({ error: MSG.input }, 409);
      const update = contactUpdate(body);
      if (!update) return json({ error: MSG.input }, 400);
      const out = await takeContact(isLeadId(session.lid) ? session.lid : null, update, context);
      return out.ok ? json({ ok: true, pack: out.pack }) : json({ error: MSG.lead }, 502);
    }
    const ip = publicIp(req, context);
    let session = await verifySession(body.session, secret);
    if (!session) {
      if (!(await turnstileOk(body.turnstile, ip, env.TURNSTILE_SECRET_KEY, fetchImpl))) return json({ error: MSG.check }, 403);
      session = { iat: Date.now(), th: null };
    }
    const intake = normaliseIntake(body.intake);
    const messages = normaliseMessages(body.messages);
    if (!intake || !messages) return json({ error: MSG.input }, 400);
    const turns = visitorCount(messages);
    try {
      if (step === 'chat') {
        if (turns < 1 || turns > CHAT_TURNS || messages[messages.length - 1].from !== 'visitor') return json({ error: MSG.input }, 400);
        const history = messages.slice(0, -1);
        const expected = history.length ? await transcriptHash(intake, history) : null;
        if (session.th !== expected) return json({ error: MSG.input }, 409);
        let out;
        try { out = await runChat({ intake, messages, apiKey, fetchImpl: modelFetch, privateNames }); }
        catch (e) { log('front-door: chat failed', e?.name); return json({ error: MSG.chat }, 502); }
        const next = [...messages, { from: 'everest', text: out.reply }];
        const token = await signSession({ iat: session.iat, th: await transcriptHash(intake, next) }, secret);
        return json({ reply: out.reply, closed: out.closed, session: token });
      }
      const expected = messages.length ? await transcriptHash(intake, messages) : null;
      if (messages.length ? session.th !== expected : turns !== 0) return json({ error: MSG.input }, 409);
      const ipHash = await hashIp(ip, secret);
      let slot;
      try { slot = await takeSlot(db(), ipHash); }
      catch (e) { log('front-door: rate unavailable', e?.code || e?.name); return json({ error: MSG.offline }, 503); }
      if (!slot) return json({ error: MSG.limit }, 429);
      let proposal;
      try { ({ proposal } = await runProposal({ intake, messages, apiKey, fetchImpl: modelFetch, privateNames })); }
      catch (e) {
        log('front-door: proposal failed', e?.name);
        try { await releaseSlot(db(), slot); } catch (releaseError) { log('front-door: slot release failed', releaseError?.code || releaseError?.name); }
        return json({ error: MSG.propose }, 502);
      }
      if (proposal.status === 'declined') {
        const token = await signSession({ iat: session.iat, th: expected, proposed: true }, secret);
        return json({ status: 'declined', leadId: null, agents: [], session: token });
      }
      let leadId = null;
      try {
        const id = randomUUID();
        const row = leadRow({ orgId: null, intake, industryOther: body.intake?.industryOther === true, proposal, turns, source: body.source });
        leadId = await saveLead(db(), id, row);
      } catch (e) { log('front-door: lead not saved', e?.code || e?.name); }
      const token = await signSession({ iat: Date.now(), th: expected, proposed: true, lid: leadId }, secret);
      return json({ status: 'ok', leadId, agents: publicAgents(proposal), session: token });
    } catch (e) {
      log('front-door: unexpected', e?.code || e?.name);
      return json({ error: MSG.offline }, 500);
    }
  };
}

export default makeFrontDoorHandler();
export const config = { path: '/api/front-door' };
