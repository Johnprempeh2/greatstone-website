// Stripe Billing Portal session creator (Supabase Edge Function, Deno). TEST MODE.
// The single self-serve surface for invoices/receipts + saved-card management — no card data ever
// touches our front end. Deploy: supabase functions deploy stripe-portal --no-verify-jwt
// NOTE: requires a one-time Customer Portal config in the Stripe dashboard (test mode).
import Stripe from 'https://esm.sh/stripe@17.0.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient(), apiVersion: '2024-06-20' });
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === ANON_KEY) return json({ error: 'Sign in to manage billing.' }, 401);
    const userClient = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Sign in to manage billing.' }, 401);

    // staff have no billing portal here
    const { data: staff } = await supabase.from('users').select('id').eq('auth_subject', user.id).maybeSingle();
    if (staff) return json({ error: 'Staff accounts have no customer billing portal.' }, 403);

    const { data: cu } = await supabase.from('customer_users')
      .select('email, customer:customers(id, name, stripe_customer_id)')
      .eq('auth_subject', user.id).maybeSingle();
    if (!cu || !cu.customer) return json({ error: 'No customer account found.' }, 404);

    let stripeCustomerId = (cu.customer as any).stripe_customer_id as string | null;
    if (!stripeCustomerId) {  // create on first portal visit (e.g. before any purchase)
      const sc = await stripe.customers.create({ email: cu.email || user.email || undefined, name: (cu.customer as any).name || undefined, metadata: { customer_id: (cu.customer as any).id } }, { idempotencyKey: 'gs-cust-' + (cu.customer as any).id });
      stripeCustomerId = sc.id;
      await supabase.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', (cu.customer as any).id);
    }

    const origin = req.headers.get('origin') || '';
    const { returnUrl } = await req.json().catch(() => ({ returnUrl: '' }));
    const ps = await stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: returnUrl || `${origin}/#account` });
    return json({ url: ps.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
