// The `enquiry` Netlify Function's request handling (GRE-1794), built so `node --test` can run it against a
// local Netlify Database and fake Resend and Turnstile. It replaces the Supabase edge function
// (supabase/functions/enquiry) with the same contract and the same logic, handleEnquiry in
// supabase/functions/_shared/enquiry.mjs:
//   POST /api/enquiry { name?, company?, email, size_band?, industry?, message?, attribution?, page?, website?, turnstile? }
//   → 200 { ok: true, ref } when the row is saved or the owner alert went (the lead is on record)
//   → 4xx/5xx { ok: false, error } otherwise; the form then shows the contact address.
// Order: honeypot, Turnstile (when TURNSTILE_SECRET_KEY is set), field checks, ten enquiries per IP a day,
// save as `anon`, owner alert by Resend (GRE-652 §4.6). A lead is lost only when the save and the alert both fail.
import { handleEnquiry, sendEmail } from '../../../supabase/functions/_shared/enquiry.mjs';
import { enquiryStore } from './enquiry-store.mjs';
import { verifyTurnstile } from './turnstile.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const FAILED = 'We could not send your enquiry just now. Please email us instead.';

export const clientIp = (req, context) =>
  String((context && context.ip) || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '')
    .trim().slice(0, 64);

// env: RESEND_API_KEY, RESEND_FROM, ENQUIRY_ALERT_TO (comma list; no alert without it), TURNSTILE_SECRET_KEY,
// APP_SITE_ORIGIN. getPool() → a pg-compatible pool, or null when the site has no database.
export function makeEnquiryHandler({ env = {}, getPool = () => null, fetchImpl = (...a) => fetch(...a), now, log = defaultLog } = {}) {
  const alertTo = String(env.ENQUIRY_ALERT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = String(env.APP_SITE_ORIGIN || 'https://greatstoneint.com').replace(/\/+$/, '');
  return async function handler(req, context) {
    if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);
    let body = null;
    try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'Check your answers and try again.' }, 400); }
    const ip = clientIp(req, context);
    try {
      if (!(body && typeof body === 'object' && body.website)) {
        const check = await verifyTurnstile({ secret: env.TURNSTILE_SECRET_KEY, token: body && body.turnstile, ip, fetchImpl });
        if (check.reason === 'off') log('warn', 'enquiry: Turnstile is off (TURNSTILE_SECRET_KEY not set)');
        if (check.reason === 'unreachable') log('error', 'enquiry: Turnstile unreachable, let through');
        if (!check.ok) return json({ ok: false, error: 'Please complete the check and try again.' }, 403);
      }
      let pool = null;
      try { pool = getPool(); } catch (e) { log('error', 'enquiry: database not available (' + ((e && e.name) || 'error') + ')'); }
      const out = await handleEnquiry(body, {
        ip, studioUrl: origin + '/#catalogue/inquiries', ...(now ? { now } : {}),
        ...enquiryStore(pool, { log }),
        sendAlert: (msg) => sendEmail({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, to: alertTo.length ? alertTo : '', ...msg, fetchImpl }),
        log,
      });
      return json(out.body, out.status);
    } catch (e) {
      log('error', 'enquiry: failed (' + ((e && e.name) || 'error') + ')');
      return json({ ok: false, error: FAILED }, 500);
    }
  };
}

function defaultLog(level, msg) { (level === 'error' ? console.error : console.warn)(msg); }
