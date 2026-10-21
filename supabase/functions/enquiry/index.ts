// Replaced by the Netlify Function netlify/functions/enquiry.mjs (GRE-1794): the form posts to /api/enquiry now.
// This copy stays deployed and unchanged on Supabase until the GRE-1703 cut-over.
// Contact enquiry (Supabase Edge Function, Deno). Public: the BookDeepDive contact form (GRE-654). Saves the
// enquiry in service_inquiries (0023 + 0035 + 0040) with the service role, then sends the owner a Resend alert. If
// the row cannot be saved the alert carries the whole enquiry, so a lead is never silently lost; only when
// both fail does the visitor get an error (and the page shows the contact address).
// The logic is ../_shared/enquiry.mjs, covered by `node --test`. Wire contract: src/lib/enquiry.mjs.
// Guards: a honeypot field, field limits, ten enquiries per IP a day (counted in service_inquiries.ip, as
// 0023's rpc does).
// Secrets: RESEND_API_KEY, RESEND_FROM, ENQUIRY_ALERT_TO (comma list, the enquiry owner; no alert without
// it), optional APP_SITE_ORIGIN for the studio link.
// Deploy: supabase functions deploy enquiry --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleEnquiry, sendEmail } from '../_shared/enquiry.mjs';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? '';
const ALERT_TO = (Deno.env.get('ENQUIRY_ALERT_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SITE_ORIGIN = (Deno.env.get('APP_SITE_ORIGIN') || 'https://greatstoneint.com').replace(/\/+$/, '');
const STUDIO_URL = SITE_ORIGIN + '/#catalogue/inquiries';
const EXTRA = /attribution|industry|alert_sent_at|size_band/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const clientIp = (req: Request) =>
  (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64);

async function countRecent(ip: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from('service_inquiries').select('id', { count: 'exact', head: true })
    .eq('ip', ip).gte('created_at', since);
  if (error) { console.error('enquiry: could not count', error.message); return null; }
  return count ?? 0;
}

async function saveRow(row: Record<string, unknown>) {
  const { data: org } = await supabase.from('organisations').select('id').order('created_at').limit(1).maybeSingle();
  if (!org) { console.error('enquiry: no organisation'); return null; }
  let { data, error } = await supabase.from('service_inquiries').insert({ ...row, org_id: org.id }).select('id').single();
  // Before 0040 there is no size_band column, and before 0035 no attribution or industry: keep the enquiry
  // without them (the alert still carries them).
  if (error && /size_band/.test(error.message || '')) {
    console.warn('enquiry: saved without the size band (apply 0040)');
    const { size_band: _s, ...rest } = row;
    ({ data, error } = await supabase.from('service_inquiries').insert({ ...rest, org_id: org.id }).select('id').single());
  }
  if (error && EXTRA.test(error.message || '')) {
    console.warn('enquiry: saved without attribution (apply 0035)');
    const { attribution: _a, industry: _i, size_band: _s, ...rest } = row;
    ({ data, error } = await supabase.from('service_inquiries').insert({ ...rest, org_id: org.id }).select('id').single());
  }
  if (error) { console.error('enquiry: not saved', error.message); return null; }
  return data;
}

async function markAlerted(id: string) {
  const { error } = await supabase.from('service_inquiries').update({ alert_sent_at: new Date().toISOString() }).eq('id', id);
  if (error && !EXTRA.test(error.message || '')) console.warn('enquiry: alert_sent_at not set', error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);
  let body: unknown = null;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Check your answers and try again.' }, 400); }
  try {
    const out = await handleEnquiry(body, {
      ip: clientIp(req), studioUrl: STUDIO_URL, countRecent, saveRow, markAlerted,
      sendAlert: (msg: { subject: string; html: string; text: string }) =>
        sendEmail({ apiKey: RESEND_KEY, from: RESEND_FROM, to: ALERT_TO.length ? ALERT_TO : '', ...msg }),
      log: (level: string, msg: string) => (level === 'error' ? console.error(msg) : console.warn(msg)),
    });
    return json(out.body, out.status);
  } catch (e) {
    console.error('enquiry: failed', String((e as Error)?.message || e));
    return json({ ok: false, error: 'We could not send your enquiry just now. Please email us instead.' }, 500);
  }
});
