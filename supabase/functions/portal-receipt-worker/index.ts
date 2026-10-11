// Portal receipt worker (Supabase Edge Function, Deno). GRE-1256; spec GRE-1227 revision 2, section 7.
// Sends the email copy of each portal acceptance, to the signer and to Greatstone, from the queue that
// portal_accept() fills in the same transaction as the acceptance. The browser is not in the path: pg_cron calls
// this every minute (deploy step in 0039), and the portal sends a nudge right after an acceptance so the email
// usually goes within seconds. A nudge only runs the queue; it cannot choose, change or read anything.
// Claim, retry schedule, email and idempotency key: ../_shared/portal-receipt.mjs (covered by node --test).
// Who may call: the cron (header x-portal-worker-secret = PORTAL_WORKER_SECRET) or any signed-in user (nudge).
// Secrets: RESEND_API_KEY, RESEND_FROM, PORTAL_RECEIPT_TO (Greatstone owner address, comma list),
// PORTAL_WORKER_SECRET, optional APP_SITE_ORIGIN. Without the Resend secrets every attempt fails and is retried,
// so nothing is lost; the studio shows the state.
// Deploy: supabase functions deploy portal-receipt-worker --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { runWorker, resendSend } from '../_shared/portal-receipt.mjs';

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(SUPA_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const WORKER_SECRET = Deno.env.get('PORTAL_WORKER_SECRET') ?? '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? '';
const OWNER_TO = (Deno.env.get('PORTAL_RECEIPT_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SITE_ORIGIN = (Deno.env.get('APP_SITE_ORIGIN') || 'https://greatstoneint.com').replace(/\/+$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// constant-time compare, so the cron secret cannot be guessed a character at a time
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function callerAllowed(req: Request): Promise<'cron' | 'nudge' | null> {
  if (sameSecret(req.headers.get('x-portal-worker-secret') || '', WORKER_SECRET)) return 'cron';
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token === ANON_KEY) return null;
  try {
    const userClient = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user } } = await userClient.auth.getUser();
    return user ? 'nudge' : null;
  } catch { return null; }
}

const db = {
  async claim(limit: number) {
    const { data, error } = await admin.rpc('portal_claim_receipt_jobs', { p_limit: limit });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async load(acceptanceId: string) {
    const { data: acceptance, error } = await admin.from('portal_acceptances').select('*').eq('id', acceptanceId).single();
    if (error) throw new Error(error.message);
    const { data: document, error: dErr } = await admin.from('portal_documents')
      .select('id, kind, title, summary, version, body, demos, content_sha256').eq('id', acceptance.document_id).single();
    if (dErr) throw new Error(dErr.message);
    return { acceptance, document };
  },
  // each write is guarded on 'sending', so a job another run has already finished is never changed
  async sent(job: any, providerId: string | null) {
    await admin.from('portal_receipt_jobs').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerId, last_error: null })
      .eq('id', job.id).eq('status', 'sending');
  },
  async retry(job: any, nextAt: Date, error: string) {
    await admin.from('portal_receipt_jobs').update({ status: 'queued', next_attempt_at: nextAt.toISOString(), last_error: error })
      .eq('id', job.id).eq('status', 'sending');
  },
  async failed(job: any, error: string) {
    await admin.from('portal_receipt_jobs').update({ status: 'failed', last_error: error }).eq('id', job.id).eq('status', 'sending');
  },
};

const send = (m: any) => resendSend({ apiKey: RESEND_KEY, from: RESEND_FROM, ...m });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const who = await callerAllowed(req);
  if (!who) return json({ error: 'not allowed' }, 401);
  try {
    const summary = await runWorker({
      db, send, ownerTo: OWNER_TO, siteOrigin: SITE_ORIGIN, studioUrl: SITE_ORIGIN + '/#catalogue/clients',
      limit: who === 'cron' ? 25 : 5,
    });
    console.log('portal-receipt-worker', who, JSON.stringify(summary));
    // a nudge learns only that the queue ran
    return json(who === 'cron' ? summary : { ok: true });
  } catch (e) {
    console.error('portal-receipt-worker failed', (e as Error).message);
    return json({ error: 'worker failed; the next run will try again' }, 500);
  }
});
