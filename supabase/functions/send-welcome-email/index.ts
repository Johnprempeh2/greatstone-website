// send-welcome-email — the branded welcome / onboarding email, sent ONCE when a new customer first lands
// on their account dashboard (right after they confirm their address and sign in). Ben (1 Jul) flagged the
// gap: registration only fired Supabase's bare confirmation email, with no introduction to Greatstone or
// what to do next.
//
// SECURITY: the caller must be the signed-in customer themselves (their JWT resolves to a customer_users
// row); the email goes only to that row's own address. ONCE-ONLY: the function claims
// customer_users.welcome_email_sent_at atomically (UPDATE ... WHERE ... IS NULL), so repeat visits or
// concurrent calls can never send twice; a failed send releases the claim. No-ops cleanly (WITHOUT
// claiming) while RESEND_API_KEY is unset, so the first visit after Resend goes live still gets welcomed.
//
// The email HTML mirrors src/lib/welcome-email.mjs buildWelcomeEmail (unit-tested; keep the two in step,
// same convention as licence-email.mjs ↔ notify-licence-issued). Deploy:
//   supabase functions deploy send-welcome-email --project-ref <ref>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(SUPA_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const SITE_ORIGIN = (Deno.env.get('APP_SITE_ORIGIN') || 'https://greatstoneint.com').replace(/\/+$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Mirror of src/lib/welcome-email.mjs buildWelcomeEmail (keep in step).
function buildEmail(opts: { customerName?: string; company?: string }) {
  const name = opts.customerName ? String(opts.customerName).trim() : '';
  const company = opts.company ? String(opts.company).trim() : '';
  const accountUrl = SITE_ORIGIN + '/#account';
  const shopUrl = SITE_ORIGIN + '/#shop';
  const bookUrl = SITE_ORIGIN + '/#book';

  const greeting = name ? 'Hi ' + esc(name) + ',' : 'Hello,';
  const intro = company
    ? 'Thanks for setting up ' + esc(company) + ' on Greatstone.'
    : 'Thanks for setting up your Greatstone account.';

  const steps = [
    { t: 'Browse the catalogue', d: 'The developer software we license and support, from the vendors who make it. Find what your team builds on.', href: shopUrl, cta: 'Browse the catalogue' },
    { t: 'Place your first order', d: 'Pay by card, or by purchase order if that suits your procurement. Your licences land in your account, normally within one business day.', href: shopUrl, cta: null as string | null },
    { t: 'Book a diagnostic', d: 'Thirty focused minutes on where your time goes and what to fix first. No deck, no obligation.', href: bookUrl, cta: 'Book a diagnostic' },
  ];
  const stepRows = steps.map((s) => `
    <tr><td style="padding:14px 0;border-top:1px solid #333">
      <div style="font-weight:800;font-size:15px;color:#f5f5f5">${esc(s.t)}</div>
      <div style="font-size:14px;color:#b0b0b0;margin-top:4px;line-height:1.55">${esc(s.d)}</div>
      ${s.cta ? `<a href="${esc(s.href)}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:#c8ff00;text-decoration:none">${esc(s.cta)} &rarr;</a>` : ''}
    </td></tr>`).join('');

  const html = `<div style="background:#1f1f1f;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:#c8ff00">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">Welcome to Greatstone</h1>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 6px">${greeting}</p>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 18px">${intro} We are the foundation the best teams build on: the licensed software you run, and the help to get more from it. Here is where to start.</p>
    <table style="width:100%;border-collapse:collapse">${stepRows}</table>
    <a href="${esc(accountUrl)}" style="display:inline-block;margin-top:22px;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:#c8ff00;text-decoration:none;border-radius:100px">Go to your account</a>
    <p style="color:#707070;font-size:12px;margin-top:22px">Questions? Just reply to this email and a real person will help. Greatstone International &middot; The Foundation of Digital Excellence</p>
  </div>`;
  return { subject: 'Welcome to Greatstone', html };
}

// Resolve the caller to their own customer_users row (never staff, never someone else's row).
async function resolveCaller(req: Request) {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === ANON_KEY) return null;
    const userClient = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return null;
    const { data: cu } = await admin.from('customer_users')
      .select('id, email, full_name, customer_id, welcome_email_sent_at')
      .eq('auth_subject', user.id).is('deleted_at', null).maybeSingle();
    return cu || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const cu = await resolveCaller(req);
  if (!cu) return json({ error: 'customers only' }, 403);
  if (cu.welcome_email_sent_at) return json({ sent: false, skipped: 'already sent' });

  // No key → report skipped WITHOUT claiming, so the first visit after Resend goes live still sends.
  const KEY = Deno.env.get('RESEND_API_KEY');
  if (!KEY) { console.log('welcome email skipped — RESEND_API_KEY not set'); return json({ sent: false, skipped: 'RESEND_API_KEY not set' }); }
  const FROM = Deno.env.get('RESEND_FROM') || 'Greatstone <onboarding@resend.dev>';

  // Atomic once-only claim: only ONE caller can flip NULL → now(). A concurrent duplicate gets no row back.
  const { data: claimed } = await admin.from('customer_users')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq('id', cu.id).is('welcome_email_sent_at', null)
    .select('id').maybeSingle();
  if (!claimed) return json({ sent: false, skipped: 'already sent' });

  // Company name for the greeting — best-effort, the email works without it.
  let company = '';
  try {
    const { data: c } = await admin.from('customers').select('name').eq('id', cu.customer_id).maybeSingle();
    company = c?.name || '';
  } catch (_) { /* greeting falls back */ }

  const { subject, html } = buildEmail({ customerName: cu.full_name || '', company });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: cu.email, subject, html }),
  });
  if (!res.ok) {
    // release the claim so the next visit retries (best-effort; a stuck claim only costs one welcome email)
    await admin.from('customer_users').update({ welcome_email_sent_at: null }).eq('id', cu.id).catch(() => {});
    return json({ sent: false, error: 'resend ' + res.status + ' ' + (await res.text()).slice(0, 140) }, 502);
  }
  console.log('welcome email sent to', cu.email);
  return json({ sent: true });
});
