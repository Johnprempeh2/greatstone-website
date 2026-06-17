# Go-live runbook — Greatstone commerce platform

Everything below moves the platform from Stripe **test** to **live**. Do it in order; nothing here is reversible-by-accident if you follow the rollback notes. Keep test mode running until the live smoke test passes.

## 0. Pre-flight (must be true before starting)
- All migrations 0001–0010 applied to the production Supabase project.
- `npm test` green, `npm run build` green.
- Supabase Auth → **Confirm email = ON** (closes the by-email account-link edge case).
- Stripe **Customer Portal** configured in **both** test and live modes (Dashboard → Settings → Billing → Customer portal). Until live is configured, the account "Manage billing & cards" button errors in live.
- A transactional email sender is ready: a verified domain in Resend (or your provider) and an API key.

## 1. Email (order confirmations)
Set as **function secrets** (not in the client bundle):
```
supabase secrets set RESEND_API_KEY=re_live_... RESEND_FROM="Greatstone <orders@greatstonesoftware.co.uk>" --project-ref <ref>
```
Without these the webhook records the order and logs "email skipped" — no crash, but the customer gets no email.

## 2. Swap Stripe keys (test → live)
1. Client (build-time, in `.env` / Netlify env): `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
2. Function secrets: `supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref <ref>`
3. Redeploy the functions so they pick up the new secret:
   `supabase functions deploy stripe-checkout stripe-webhook stripe-portal --no-verify-jwt --project-ref <ref>`

## 3. Re-register the webhook against LIVE
The test webhook secret does NOT work in live. Create a live endpoint and capture a new signing secret:
```
# in LIVE mode
curl https://api.stripe.com/v1/webhook_endpoints -u sk_live_...: \
  -d url="https://<ref>.supabase.co/functions/v1/stripe-webhook" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.async_payment_failed" \
  -d "enabled_events[]=checkout.session.expired"
# take the returned "secret" (whsec_...) and set it:
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_live_... --project-ref <ref>
```
Redeploy the webhook after setting the secret.

## 4. Front-end deploy
`npm run build` → sync `dist/` into the deploy target → deploy. Verify the live URL returns 200 and serves the new bundle hash.

## 5. Live smoke test (£1)
- Add a low-priced licence to the basket, check out with a **real card**, complete payment.
- Confirm: order appears in `#catalogue` Orders and in the customer's `#account`; the confirmation email arrives; "Manage billing & cards" opens the live portal.
- Refund that test order in Stripe and confirm it reflects back (once Track 3 refund handling is live).

## 6. Backups
Enable **PITR** on the Supabase project and run one restore drill to a scratch project. Record RPO/RTO.

## Rollback
- **Bad deploy:** redeploy the previous function versions / revert the front-end deploy (Netlify keeps deploy history — promote the prior deploy).
- **Payment incident:** switch keys back to test (steps 2–3 in reverse) to stop live charges while you diagnose; orders already captured are unaffected.
- **Data incident:** restore from PITR to the last known-good point.

## Secrets inventory (rotate on a schedule)
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, DB password, `RESEND_API_KEY`. None of these are `VITE_`-prefixed; none reach the client bundle. Rotate quarterly or on staff change.
