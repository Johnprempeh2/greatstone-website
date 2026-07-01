// notify-licence-issued — emails a customer that the licence key(s) staff just issued against their order are
// ready to collect (manual fulfilment: Greatstone buys the key, uploads it, the buyer is told to collect it).
// STAFF ONLY (verifies the caller is a public.users row). SECURITY: the email never contains the key itself —
// it links the buyer to their account to view it (the email HTML mirrors src/lib/licence-email.mjs, which is
// unit-tested; keep the two in step, same convention as src/lib/pricing.mjs ↔ stripe-checkout).
//
// No-ops cleanly when RESEND_API_KEY is unset, so issuing a key never depends on email being configured
// (mirrors sendOrderEmail in stripe-webhook). Deploy:
//   supabase functions deploy notify-licence-issued --project-ref <ref>
// and set RESEND_API_KEY + RESEND_FROM (+ optional APP_SITE_ORIGIN) as function secrets to switch it on.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(SUPA_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const SITE_ORIGIN = (Deno.env.get('APP_SITE_ORIGIN') || 'https://greatstonesoftware.co.uk').replace(/\/+$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const itemLabel = (it: any) => (it.offering_name || 'Your licence') + (it.variant_name ? ' · ' + it.variant_name : '') + (it.qty && it.qty > 1 ? ' ×' + it.qty : '');

// Mirror of src/lib/licence-email.mjs buildLicenceEmail (keep in step). Never renders the key value.
function buildEmail(opts: { customerName?: string; items: any[]; orderRef?: string; accountUrl: string }) {
  const items = opts.items && opts.items.length ? opts.items : [{ offering_name: 'Your licence' }];
  const many = items.length > 1;
  const greeting = opts.customerName ? 'Hi ' + esc(opts.customerName) + ',' : 'Hello,';
  const orderLine = opts.orderRef ? `This is for order <b style="color:#f5f5f5">${esc(opts.orderRef)}</b>.` : '';
  const rows = items.map((it) => `<li style="margin:0 0 6px">${esc(itemLabel(it))}</li>`).join('');
  const html = `<div style="background:#1f1f1f;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:#c8ff00">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">${many ? 'Your licence keys are ready' : 'Your licence key is ready'}</h1>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 8px">${greeting}</p>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 14px">${many ? 'Your licence keys are ready to collect.' : 'Your licence key is ready to collect.'} ${orderLine} Sign in to your account to view and copy ${many ? 'them' : 'it'}. For your security we never send ${many ? 'keys' : 'a key'} by email.</p>
    <ul style="color:#f5f5f5;font-size:14px;padding-left:18px;margin:0 0 18px">${rows}</ul>
    <a href="${esc(opts.accountUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:#c8ff00;text-decoration:none;border-radius:100px">${many ? 'View your licence keys' : 'View your licence key'}</a>
    <p style="color:#707070;font-size:12px;margin-top:22px">Questions? Just reply to this email. Greatstone International · The Foundation of Digital Excellence</p>
  </div>`;
  return { subject: many ? 'Your Greatstone licence keys are ready' : 'Your Greatstone licence key is ready', html };
}

// Only a signed-in staff user (a public.users row) may trigger a customer email.
async function callerIsStaff(req: Request): Promise<boolean> {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === ANON_KEY) return false;
    const userClient = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return false;
    const { data: staff } = await admin.from('users').select('id').eq('auth_subject', user.id).is('deleted_at', null).maybeSingle();
    return !!staff;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await callerIsStaff(req))) return json({ error: 'staff only' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const orderId = body.order_id;
  if (!orderId) return json({ error: 'order_id required' }, 400);

  // Load the order's buyer + the keys just issued (offering/variant only — never the key value).
  const { data: order, error } = await admin.from('orders')
    .select('id, reference, customer_email, customer_id, licence_keys(offering_name, variant_name)')
    .eq('id', orderId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ error: 'order not found' }, 404);

  const to = order.customer_email as string | null;
  if (!to) return json({ sent: false, skipped: 'no customer email on the order' });

  const KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM') || 'Greatstone <onboarding@resend.dev>';
  const { subject, html } = buildEmail({
    items: (order as any).licence_keys || [],
    orderRef: order.reference || '',
    accountUrl: SITE_ORIGIN + '/#account',
  });
  if (!KEY) { console.log('licence email skipped — RESEND_API_KEY not set'); return json({ sent: false, skipped: 'RESEND_API_KEY not set' }); }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) return json({ sent: false, error: 'resend ' + res.status + ' ' + (await res.text()).slice(0, 140) }, 502);
  console.log('licence email sent to', to);
  return json({ sent: true });
});
