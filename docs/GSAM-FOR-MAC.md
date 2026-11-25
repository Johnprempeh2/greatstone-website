# GSAM for Mac: website accounts (P4)

Customers buy GSAM for Mac on the website. The hub side (Greatstone's own GSAM with `GSAM_FLEET_HUB=true`) is in
gs-agentic-manager, `doc/CLIENT-INSTANCES.md`, section "GSAM for Mac: payments and modules (P3)".

## How it works

1. **/my-gsam** (linked from /gs-agentic-manager, "Buy GSAM for Mac"). Signed out, it shows the usual website sign-in
   and create-account form (Better Auth, the one identity source). Signed in, it shows the catalogue: packages,
   modules, and any deal made for this customer only. Monthly or annual.
2. **Checkout** (`POST /api/gsam/checkout`). Stripe Checkout in subscription mode, test keys only, for the company's
   Stripe customer (made on first purchase, as the shop does). One GSAM subscription per customer: a customer who
   already has one is sent to Manage billing instead (409).
3. **Webhook** (`POST /api/gsam/stripe-webhook`, its own Stripe endpoint). Checks Stripe's signature, then forwards
   the raw event unchanged to `<GSAM_HUB_URL>/api/fleet/billing/events`, signed with `GSAM_BILLING_EVENTS_SECRET` in
   Stripe's signature format. On a new customer's checkout the hub returns the licence key (`gsamlk_...`) once; the
   website stores it AES-256-GCM encrypted (bound to the company id) in `gsam_accounts`. Each event id is settled
   once (`gsam_billing_events`). A hub or database failure answers non-2xx, so Stripe sends the event again.
   Shop checkouts are not forwarded, and the shop webhook ignores subscription checkouts.
4. **My GSAM** (`GET /api/gsam/account`). Licence key (hidden until "Show key", then Copy), the DMG link, modules,
   paid-until (the hub's figure, else Stripe's period end), status, and Manage billing (the Stripe customer portal,
   where modules, monthly or annual, card and cancellation change the existing subscription).

**Catalogue source.** The hub's catalogue route is for hub admins only, so the website reads what the hub mirrors to
Stripe: active recurring prices whose product carries `gsam_item_id` metadata. If Stripe has none (or no key is set),
it uses `GSAM_CATALOGUE_JSON`. A deal shows only to the Stripe customer in its `gsam_customer` metadata, and
checkout refuses anything not in that customer's catalogue.

## Settings (Netlify server environment, never `VITE_` variables)

| Variable | What it is |
| --- | --- |
| `STRIPE_SECRET_KEY` | Already set for the shop. Must be `sk_test_...`: every GSAM route refuses a live key until go-live. Use the same Stripe account as the hub's `GSAM_STRIPE_SECRET_KEY`. |
| `GSAM_STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_...`) of the Stripe webhook endpoint `https://<site>/api/gsam/stripe-webhook`. |
| `GSAM_HUB_URL` | The hub's public origin, for example `https://<hub host>`. Funnel must expose `/api/fleet/billing/events`. |
| `GSAM_BILLING_EVENTS_SECRET` | The same value as the hub's `GSAM_BILLING_EVENTS_SECRET`. |
| `GSAM_LICENCE_ENCRYPTION_KEY` | 32 random bytes, 64 hex characters: `node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))'`. Losing or changing it makes stored keys unreadable. |
| `GSAM_DMG_URL` | Optional. The DMG download link. Unset: My GSAM says the download is on its way. |
| `GSAM_CATALOGUE_JSON` | Optional fallback catalogue: `[{"id","kind":"module|package|deal","name","description","customer":"cus_... or null","prices":{"month":{"id":"price_...","amount":1000,"currency":"gbp"},"year":{...}}}]`. |
| `APP_SITE_ORIGIN` | Already set. Checkout's return links and the portal's return URL. |

## Go-live checklist (John)

1. Hub: `GSAM_FLEET_HUB=true`, `GSAM_STRIPE_SECRET_KEY` (test), `GSAM_BILLING_EVENTS_SECRET`, Funnel for
   `/api/fleet/billing/events`. Add the modules and packages with prices on the hub (Settings, Fleet, Catalogue), which
   mirrors them to Stripe.
2. Stripe (test mode): add the webhook endpoint `https://<site>/api/gsam/stripe-webhook` with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Its signing secret is `GSAM_STRIPE_WEBHOOK_SECRET`.
3. Stripe customer portal: allow subscription updates (switch prices among the GSAM products, monthly and annual),
   payment method updates and cancellation at period end.
4. Netlify (staging first): set the settings above, then migration `076_gsam_accounts` runs with the deploy.
5. Test buy on staging with card `4242 4242 4242 4242`: the key appears on My GSAM, the app activates with it, a
   module change in Manage billing reaches the install within 5 minutes.
6. Live only on John's word: live Stripe keys on hub and website, a live webhook endpoint, and lifting the
   `sk_test_` checks in `gsam-checkout`, `gsam-account`, `gsam-webhook` (and the `livemode` check in the webhook).
   greatstoneint.com changes only through John's Deploy button in GSAM.

## Known limits

- The hub returns a licence key once and keeps a hash. If the website cannot store it (database down after the hub
  answered), the retry gets "duplicate" without the key and the function log says so. Hub follow-up: a "new licence
  key" action for an install, so an operator can issue a fresh one.
- Hub follow-up: a read-only catalogue route the website can call server to server (signed like billing events), so
  the website can show each package's modules and limits, which Stripe metadata does not carry.
- The catalogue read takes the first 100 Stripe prices.
- Any member of the customer company can see the company's licence key.

Tests (one file at a time):

```sh
node --test netlify/tests/gsam-webhook.test.mjs
node --test netlify/tests/gsam-checkout.test.mjs
LC_ALL=en_US.UTF-8 node --test netlify/tests/gsam-db.test.mjs   # real Postgres; macOS needs the locale
node --test src/gsam/gsam-model.test.mjs
```
