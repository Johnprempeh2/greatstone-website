# Greatstone Commerce Platform — Build Log

Running log of the platform build (full store + real Stripe + Supabase) against `docs/SYSTEM-SPEC.md`.
Newest entries at the bottom. One entry per item: what changed, files, verify result, blockers.

## Build approach
- **Stack:** Vite + React (public store + admin studio, evolving the Puck studio) · Supabase (Postgres + Auth + Storage + Edge Functions) · Stripe Checkout (TEST mode) · money as integer minor units.
- **Contract:** `docs/schema.sql` (28 tables) + `docs/api-contract.md` + `docs/SYSTEM-SPEC.md`.
- **Local validation without Docker/cloud:** a local Homebrew Postgres validates the schema, seed, pricing SQL and data layer autonomously. Supabase-specific bits (Auth, Edge Functions, Storage, auth-scoped RLS) and Stripe need the real stack — gated on John providing Docker / a Supabase project / Stripe test keys.
- **Secrets:** `.env` (gitignored) + `.env.example` (names only). Secret values are set by John, never committed or echoed. Stripe TEST keys only.

## Phases
0 Foundations · 1 Storefront · 2 Admin studio core · 3 Cart + Stripe checkout · 4 Pricing engine + quotes · 5 Bulk Excel round-trip · 6 AI-assist · 7 Content CMS + accounts · then Harden + Deploy.

---

## Phase 0 — Foundations

### Cycle 1 — project scaffolding + local DB
- Added `docs/SYSTEM-SPEC.md` + `docs/schema.sql` + `docs/api-contract.md` (the spec, committed as baseline).
- `.env.example` (all variable names; publishable vs SECRET marked) + `.env` gitignored.
- `supabase/migrations/0001_initial_schema.sql` = the canonical 28-table schema.
- Installed local PostgreSQL 16 (Homebrew, no Docker) to validate the schema/seed/logic autonomously.
- **Validated the schema on real Postgres** — caught + fixed a real bug in the spec DDL (a stray leading comma on `pricing_rules.adjustment_value_pct` made two consecutive commas; would have failed on any Postgres). Re-applies clean: **28 tables · 17 enums · 88 indexes**. Synced the fix back into `docs/schema.sql` so the spec matches reality.
- Installed `@supabase/supabase-js` + the `supabase` CLI (dev dep).
- **Verify:** `psql -f 0001_initial_schema.sql` applies with `ON_ERROR_STOP=1`, zero errors. Frontend `npm run build` unaffected.
- **Gap logged:** only 1/28 tables has RLS enabled in the spec DDL; the spec principle is RLS on every business table → dedicated `0002_rls.sql` is the next item.
- **Blocker (expected):** full Supabase (Auth, Edge Functions, Storage) needs Docker or a cloud project; Stripe needs test keys. Local Postgres covers schema/seed/pricing-logic/data-layer cycles until then.
- Committed: foundation (docs spec, `supabase/migrations/0001`, `.env.example`, `.gitignore`).

### Cycle 2 — seed the real catalogue
- `supabase/seed/build-seed.mjs` generates `supabase/seed/seed.sql` from `greatstone-homepage/assets/products.json` → the unified `offerings` model (products as `type=product`), vendors, functional categories, variants, specs. Money stored as **integer minor units** (pence). Icons/galleries parked in `offerings.attributes` until the media/Storage cycle.
- **2nd real schema bug caught by the local DB:** `uq_variant_edition UNIQUE(offering_id, sku, license_type, billing_period)` is NOT satisfiable by the real feed — editions collide on those three (Aspose +1yr vs +5yr support) AND on `name` (aspose-tex-for-c++ has 6 "Developer, C++" rows). Relaxed: no natural unique key on variants; the bulk importer will REPLACE-per-offering; variant dedup is a bulk/AI cleanup task. Documented in the migration + synced to `docs/schema.sql`.
- **Validated on local Postgres:** schema + seed apply clean. Counts: 10 vendors · 32 categories · 159 offerings · 819 variants · 2,831 specs. Integrity: 159/159 offerings carry both vendor AND category (dual-axis), 146 priced / 13 POA (matches spec), 12 featured, IronPDF £509 / 10 variants, full-text search returns 11 hits for "ocr".
- **Verify:** `node build-seed.mjs` + apply both SQL files with `ON_ERROR_STOP=1` → zero errors; all spot-checks pass.
- Committed.

### Cycle 3 — RLS / tenant isolation
- `supabase/migrations/0002_rls.sql`: an `app_current_org()` helper + `ENABLE`/`FORCE ROW LEVEL SECURITY` + an `org_isolation` policy (`org_id = app_current_org()`, USING + WITH CHECK) on all 26 org-scoped tables; `organisations` scoped by own id; `permissions` global read-only. **28/28 tables now have RLS.**
- Seed now `SET LOCAL app.current_org` so inserts satisfy the WITH CHECK under FORCE RLS (mirrors the app setting the GUC per request).
- **Validated on local Postgres as a non-superuser role** (the real app scenario — superusers bypass RLS, which made the first test misleading): no org set → 0 rows · correct org → 159 offerings / 819 variants · wrong org → 0. Isolation is real.
- **Verify:** 0001 + 0002 + seed apply clean with `ON_ERROR_STOP=1`; isolation test passes as `app_test` (NOSUPERUSER).
- Committed.

### Cycle 4 — pricing/discount engine (pure, fully tested)
- `src/lib/pricing.mjs` — the single `effectivePrice(offering, variant, rules, tier, now)` (+ `pickWinningRule`, `ruleApplies`, `ruleCut`, `offeringFromPrice`, `fmtMoney`, `fmtFrom`). Single-winner (no stacking), floor-clamped, never-negative, never-on-POA, scheduled, scoped (all/vendor/category/offering/tier), tier-gated audience, currency-safe fixed discounts. Pure — runs server-side (edge fn) and for the studio "preview as tier". Money in minor units.
- `src/lib/pricing.test.mjs` — **16 unit tests, all pass** (`npm test` via node's built-in runner, no deps): Aspose.Cells £870→£696, fixed-discount currency match, POA untouched, floor clamp + never-negative, single-winner, tie-break by reduction, schedule windows, tier audience, type gating, draft/inactive ignored, scope matches, lowest-from-price, formatting.
- Added `"test": "node --test"` to package.json.
- **Verify:** `npm test` → 16/16 pass. Zero infra needed.
- Committed.

### Cycle 5 — public-read RLS + grants + PROPER RLS validation
- John provided a **cloud Supabase project** (URL + anon + service_role) and **Stripe test keys** — secured in `.env` (gitignored, never committed/echoed). Project verified live (auth health 200).
- **Correction:** cycle 3 "validated RLS" was tested as the local **superuser**, which *bypasses RLS* — so it proved nothing. The policies were correct but unverified. Now properly validated as the non-superuser `anon` role (mirrors Supabase).
- `0003_public_read.sql`: a storefront needs the anon role to read the **published** catalogue without an org context. Added permissive `public_read` SELECT policies (published + not-deleted; child tables gated on parent published) on vendors/categories/offerings/variants/specs/media/pricing_rules(+targets), plus table **GRANTs** to `anon`/`authenticated` (RLS filters rows; grants gate table access — required or PostgREST 401s).
- `supabase/seed/local-roles.sql`: local-only harness creating `anon`/`authenticated`/`service_role(BYPASSRLS)` so RLS is testable locally.
- **Validated as `anon`:** published offerings → 159; set IronPDF→draft → 158 (hidden) + its variants → 0 (parent-gated); **`customers` → permission denied** (customer/quote/order data does NOT leak to the public). Security boundary holds.
- Committed.

### Cycle 6 — pushed to CLOUD Supabase + typed data layer (live-verified)
- John provided the **Session-pooler** (IPv4) connection string (eu-west-2). The direct host is IPv6-only and unreachable from this machine; the pooler works.
- Applied `0001 + 0002 + 0003 + seed` to the **live cloud Supabase** (Postgres 17). Cloud counts: 10 vendors · 32 categories · 159 offerings · 819 variants · 2,831 specs.
- **Live security check via anon REST** (the storefront's actual path): published offerings readable (159); IronPDF returns 10 variants + 24 specs in one relational read; all 10 vendors load; **customers/quotes/orders/users return empty to anon** — RLS holds on the real backend.
- Built the data layer: `src/lib/supabase.mjs` (Vite+Node dual client) + `src/data/catalog.mjs` (`listOfferings` with vendor/category/platform/type/search/sort/pagination, `getOffering`, `listVendors`, `listCategories`, `relatedOfferings`, `getActiveRules`; prices decorated via `pricing.mjs`).
- **Verified live:** listings 159; vendor=ironsoftware→10; search pdf→30; platform=.NET→47; price-sort (Readiris £63 first); getOffering(ironpdf)→10 variants/24 specs; related→4. All against the live project.
- Committed.

**PHASE 0 COMPLETE** — schema, RLS (incl. public-read), seed, pricing engine, and the data layer, all verified against the live cloud Supabase the production app will use.

### Phase 1a — storefront LISTING (live, browser-verified)
- `src/store/StoreBrowse.jsx` + `src/store/store.css`: the public catalogue listing, reads the live data layer. Faceted by vendor (10) / platform / category (32) + debounced search + sort (featured/A–Z/price) + load-more + result count + empty state. Lazy-loaded (`#shop` route, code-split so the public bundle stays lean).
- Wired an additive `#shop[/<vendor>]` hash route in `App.jsx` (readShopHash + state + onHash + a render branch; nothing existing touched).
- Copied the 10 logos + 153 icons into `public/catalog/`; paths mapped via `BASE_URL`.
- **Browser-verified against live Supabase** (dev server :5180): 159 results, 3-col grid, real icons/vendor-logos/prices (Able2Extract £80, Aspose.Pdf £870, Apryse POA), vendor filter (Aspose→86), search (ocr→11), console clean.
- Fixes during verify: debounced search + out-of-order-response guard (caught a real race); a fixed scrim so the decorative 3D Stage doesn't bleed through the near-transparent cards.
- Committed.

### Phase 1b — live product detail page (browser-verified)
- `src/store/StoreProduct.jsx` + `sp-*` styles: live PDP via `getOffering()`. Breadcrumb, gallery (prev/next + thumbs), vendor logo + platform badges, price box, **editions/variants table** with per-edition prices, key features (specs), related products, Request-a-quote + free-trial CTAs (→ `#book` contact), SEO `<title>`, graceful not-found.
- `App.jsx`: `#product/<slug>` now renders the live `LazyStoreProduct` (code-split) instead of the old localStorage `ProductDetail` block.
- **Verified live** (dev :5180): IronPDF → £509 + VAT, 10 editions, 24 features, 9-image gallery, 4 related, breadcrumb + SEO title correct. Production build green (2.62s).

### Phase 1c — nav glue (verified)
- `Header.jsx`: a "Shop" entry in the nav (inline + collapsed dropdown) → `goShop()` (`#shop`), active-state aware. `App.jsx` `navigate()` now clears `location.hash` + shop/product state so page-nav cleanly leaves the store.
- Verified: Shop appears in the nav; click → `#shop` (159 results); clicking a page from the store clears the hash and returns to the page.
- **Note (cleanup later):** there's still a legacy "Products" Puck page (old localStorage Storefront block) alongside the new live "Shop". Retire or redirect the old page once the live store is canonical.

### Phase 2a — admin auth + write RLS foundation (RESUMED, verified)
John provided a Supabase **personal access token** (in `.env`, gitignored) and created the admin auth user **john@greatstonesoftware.co.uk** (uid `079636cf…`).
- Provisioned John as `owner` in `public.users` (auth_subject → uid). *(One-off data, not committed — auth uids are environment-specific. To add staff: insert a `public.users` row with their auth uid + role; see this entry.)*
- `0004_admin_writes.sql`: `app_staff_org()` (SECURITY DEFINER, resolves the signed-in user's org iff they're owner/admin/editor) + `staff_all` RLS policies (FOR ALL, authenticated) on catalogue/pricing/quotes/orders/imports/ai/content tables + `self_read`/`staff_users` on users + grants to `authenticated`.
- **Verified on the cloud DB** (simulating the Supabase JWT GUCs): admin `UPDATE offerings` → 1 row (allowed) + SELECT sees drafts; **anon → 0 rows, non-staff JWT → 0 rows** (denied). Secure write boundary holds.

### Phase 2b — catalogue admin: Supabase sign-in + offerings manager v1 (verified)
- `src/store/adminAuth.mjs`: Supabase Auth helpers (signIn/out, session, `getStaffUser` → public.users role). Additive — does NOT touch the legacy Puck-pages prototype auth.
- `src/store/CatalogueAdmin.jsx` + `admin.css`: a new `#catalogue` surface — sign-in gate → offerings manager (searchable live list incl. drafts, edit drawer: name/short-desc/status/featured, saving via the authenticated client gated by `staff_all` RLS). Non-staff signed-in users get "not authorised".
- `App.jsx`: additive `#catalogue` route (lazy/code-split), cleared by page nav.
- **Verified** (dev :5180): sign-in form renders on-brand; a wrong password is rejected with "Invalid login credentials" (proves the live Supabase Auth integration); console clean; production build green. **Per my security boundary I did not sign in as John** — the happy-path sign-in + live edit is his to test (his password); the write RLS itself is DB-verified (Phase 2a).
- **John: to use the admin** — run the dev server and open `/#catalogue`, sign in with the Supabase admin account (john@greatstonesoftware.co.uk).

### Phase 2c — pricing/discount rules UI + bulk Excel round-trip (verified)
- `PricingRules.jsx` (admin tab): create a discount rule (scope all/vendor/category, %/fixed, badge, live toggle) with a LIVE before→after preview over the real catalogue; saves `pricing_rules` (+ targets). List + toggle + soft-delete. **Preview verified vs live data: 20% off Aspose → 86 products, Aspose.Cells £870→£696.** Commit 51e6bf2.
- `bulkCsv.mjs` (pure) + `bulkCsv.test.mjs` (**7 tests**): export offerings → CSV; parse (RFC4180-ish, quoted commas/newlines); dry-run diff by slug (editable: name/short_description/status/featured; validates status; flags unknown slugs). `BulkImport.jsx` (admin tab): export download, CSV upload → dry-run diff table → apply (writes via authenticated client). 
- **All 23 tests pass** (16 pricing + 7 bulk); build green. Signed-in apply is John's to test.

### Phase 2c — (was) deeper offerings editor + pricing rules UI
Flesh out the offerings editor (variants/editions table with prices, specs, platforms/tags, vendor/category, media), add vendor/category managers, then the **pricing & mass-discount rules UI** (create rule → scope vendor/category/product/tier → %/fixed → schedule → live before/after preview, writing `pricing_rules`). Then bulk Excel import/export, AI-assist, and the Stripe checkout (edge functions, now deployable via the access token).

### (was) ⏸ PAUSED — Phase 1 (public storefront) complete; Phase 2+ needs admin auth
**Done & live:** Phase 0 (schema/RLS/seed/pricing engine/data layer) + Phase 1 (storefront listing, live product pages, nav glue) — all against the real cloud Supabase, browser-verified, build green. Commits c0ce787…c864f2d.

**Why paused:** everything remaining writes to the DB and is admin-gated:
- offerings manager (edit products/variants/prices), vendor/category managers
- pricing & mass-discount rules UI
- bulk Excel import/export, AI-assist
- cart + real Stripe test checkout
Secure DB writes need **Supabase Auth** (an admin signs in; RLS gates writes by `users.org_role`) — the prototype localStorage session can't gate real DB writes. And deploying the checkout/admin **edge functions** needs a Supabase **personal access token**.

**To resume Phase 2+, from John:**
1. A Supabase **personal access token** (Dashboard → Account → Access Tokens) → unlocks edge-function deploys (Stripe checkout + admin writes) + CLI project management. Stored in `.env`, never committed.
2. Create an **admin user** (Dashboard → Authentication → Users → Add user) — I can't create accounts; I'll wire admin sign-in to it and gate catalogue/pricing writes to it.

Then: admin sign-in (Supabase Auth) → offerings manager → pricing/discount rules → bulk Excel → AI-assist → Stripe checkout, all against the live backend, verified each step.

### Phase 3 — Stripe checkout (cart → secure session → confirmation) · LIVE backend, verified
**2026-06-17.** The customer-facing buy path, end-to-end, against the real cloud Supabase + Stripe **test** keys.

- **`supabase/functions/stripe-checkout/index.ts`** (Deno edge function) — **deployed** to project `melnjvwmayjukpyngolv` via the access token (`functions deploy --no-verify-jwt`, no Docker needed). SECURE: takes `[{variantId, quantity}]` only; **never trusts client prices** — looks up `base_price_minor` by id (service_role), re-applies active `pricing_rules` server-side (a compact mirror of `src/lib/pricing.mjs`: single-winner, floor-clamped, public-audience-only), adds 20% UK VAT as a line item, creates the Checkout Session. POA / unpublished / unknown variants are dropped (quote-only). `STRIPE_SECRET_KEY` + `VAT_RATE` set as function secrets (not in the bundle).
- **`src/store/cart.mjs`** — live-store basket singleton (separate from the legacy prototype `CartContext`, which keys by old ids + never pays). localStorage-backed, `useSyncExternalStore` hook, `startCheckout()` posts the basket to the edge function and returns the Stripe URL.
- **`src/store/StoreCart.jsx`** — floating basket FAB + badge, slide-over drawer (line items, qty steppers, remove, subtotal/VAT/total, optional receipt email, "Checkout securely" → redirect), and the post-payment confirmation panel (clears the basket, shows the session ref). On-brand (lime/charcoal/Montserrat, reduced-motion safe).
- **`StoreProduct.jsx`** — "Add to basket" per priced edition; POA editions keep "Request a quote".
- **`App.jsx`** — lazy `LazyStoreCart`; new `#order-confirmed[?session=…]` route → confirmation; FAB mounted on `#shop`/`#product`.
- **`store.css`** — basket FAB/drawer/confirmation styles.

**Verified (dev :5180, real Supabase + Stripe test):**
- Server-side curl: variant £290 ×2 → +VAT → real `cs_test_…` session created.
- Browser: added 2 IronPDF editions → drawer math exact (£1,798 sub / £359.60 VAT / £2,157.60 total); `startCheckout()` from the page origin returned `https://checkout.stripe.com/c/pay/cs_test_…` (CORS + gateway + anon key all good).
- `#order-confirmed` renders the on-brand "Payment received" panel and clears the basket. **Zero console errors. Production build green** (cart 2.55KB / StoreCart 4.91KB chunks, both lazy — public bundle unchanged).

**Not yet (next):** Stripe **webhook → `orders`** edge function (persist the order on `checkout.session.completed`; create the Stripe webhook endpoint + signing secret via the Stripe API). Then guest/account linking on orders, and an orders view in the admin. **Checkpoint for John before any go-live:** swap test keys → live, and confirm fulfilment (licence-key issuing) process.

### Phase 3b — Stripe webhook → orders (persistence) · LIVE backend, verified
**2026-06-17.** Completes the payment loop: cart → checkout → Stripe → **webhook → order row**.

- **`supabase/functions/stripe-webhook/index.ts`** (Deno edge function) — **deployed** to `melnjvwmayjukpyngolv`. Verifies the Stripe signature with `constructEventAsync` (Deno SubtleCrypto). On `checkout.session.completed`: lists line items (`expand price.product`), reads the `variant_id` stamped on each product's metadata by `stripe-checkout`, resolves real offering/variant names + `org_id` from the DB (service_role — never trusts Stripe's product names), and writes `orders` + `order_items`. **Idempotent**: `orders.reference = session.id` with `UNIQUE(org_id, reference)` + `ON CONFLICT DO NOTHING`, so a re-delivered event is a no-op. Non-variant lines (VAT) count toward `total_minor` but aren't order items. Always 200s except on bad signatures (400) — no retry storms.
- **Stripe webhook endpoint** registered via the Stripe API (test mode) → `we_1TjHsp…`, event `checkout.session.completed`. Signing secret captured, set as the `STRIPE_WEBHOOK_SECRET` function secret + persisted to `.env` (gitignored). `APP_ORG_ID` set as a fallback org.

**Verified (real Supabase + Stripe test):**
- Unsigned POST → **400** ("missing signature") — verification path live.
- Real test session (£290 variant) → crafted + HMAC-signed `checkout.session.completed` → **200**; order written: `status=confirmed`, `subtotal_minor=29000`, `total_minor=34800` (£290 + £58 VAT), 1 order item with DB-resolved names (Aspose TeX for C++ · Developer, C++).
- **Idempotency**: re-delivering the same event → still exactly 1 order (no duplicate). Test order then deleted (orders table clean: 0 rows).

**Payment loop is now complete and solid.** Remaining: an **orders view in the catalogue admin** (list orders + items), guest→customer linking, and fulfilment status (`confirmed`→`fulfilled`). **Go-live checkpoint for John:** swap Stripe test keys → live keys + re-register the webhook against live, and confirm the licence-key issuing process.

### Phase 3c — orders view in the catalogue admin · verified (build + data + RLS)
**2026-06-17.** A fourth admin tab so staff can see what's sold.

- **`src/store/OrdersManager.jsx`** + **`#catalogue` "Orders" tab** — lists orders (most recent first) with date, short reference, item count, total, status badge; expand a row for line items + ex/inc-VAT totals + the Stripe session ref. One write action: **Mark fulfilled** (confirmed → fulfilled, for when licence keys are issued). Refund/cancel are recorded-only (money moves in Stripe, not here). Reads/writes via the authenticated client; `staff_all` RLS gates to the signed-in staff org.
- **`admin.css`** — order status colours (confirmed=teal, fulfilled=lime, cancelled=grey, refunded=coral) + detail-row styling.

**Verified:** production build green (CatalogueAdmin 24.5KB). Against the live DB with a seeded order: the component's exact embedded select returns the order + items (no column/embed typos); **anon read returns 0 rows** (orders are staff-only, not public); the fulfilled update works; seed cleaned up (table back to 0). Per the security boundary I did not sign in as John — the in-admin visual is his to test (same as the pricing/bulk tabs); query validity + RLS are DB-verified.

**Commerce platform status:** catalogue + pricing/discounts + bulk CSV + storefront + cart + Stripe checkout + webhook→orders + orders admin — all built and live-verified on the interim Supabase. Open follow-ups: guest→customer record linking, customer accounts/order history on the storefront, services (type='service') when data exists. **Go-live checkpoint for John unchanged:** test→live Stripe keys + webhook re-register + licence-key fulfilment process.

### Phase 3d — payments hardening pass · verified
**2026-06-17.** Bug-hunt over the fresh payment code before review; three fixes, all re-deployed + re-verified.

- **webhook: retry-safe errors.** Handler errors now return **500** (was 200-swallow) so Stripe retries with backoff — safe because the order write is idempotent on the session id, so a transient DB/network failure recovers on a later delivery instead of silently losing the order.
- **webhook: skip unpaid sessions.** `checkout.session.completed` can fire for async payment methods still `unpaid`; we now skip those (a later `async_payment_succeeded` would book them). Card payments arrive `paid` and proceed.
- **checkout: single-currency guard.** Line items are charged in GBP; a non-GBP variant (none today, but possible later) is now skipped rather than mischarged as GBP.

**Re-verified (live Supabase + Stripe test):** checkout still creates a session; signed **unpaid** event → 200, **0** orders written; signed **paid** event → 200, **1** order written; test data cleaned up (0 rows). No client changes this pass (edge-function only).

This closes the planned commerce build. The money path (cart → secure checkout → Stripe → idempotent webhook → orders → admin view) is built, hardened, and verified end-to-end on the interim Supabase. Larger follow-ups (end-customer accounts + order history, guest→customer linking, services type) are product decisions to take with John, not autonomous work.

### Phase 3e — cart.mjs unit tests · 33 tests green
**2026-06-17.** `src/store/cart.test.mjs` (**10 tests**) covers the checkout math that was untested: add/dedup-and-accumulate (qty clamped to 100), ignore items with no variantId, currency default, `setQty` clamp+round to [1,100], remove/clear, `cartCount`/`cartSubtotalMinor` sums, localStorage persistence, and the two `startCheckout` guard rejections (empty basket / unconfigured). In-memory localStorage stub so the singleton loads under `node --test`. **Full suite: 33 pass / 0 fail** (16 pricing + 7 bulk + 10 cart).

**Commerce build closed out.** Catalogue, pricing/mass-discounts, bulk CSV, storefront, cart, Stripe checkout, webhook→orders, orders admin — built, hardened, and tested/verified on the interim Supabase. Next steps are John's calls (end-customer accounts + order history, guest→customer linking, services type, then the test→live go-live checkpoint), not autonomous work — so the build loop winds down here.

## COMMERCE-V2 (17 Jun 2026) — customer accounts + USD/FX + SKU bulk import
Greenlit by John. Design pass run as a 3-agent workflow (FX / accounts / SKU), reconciled into one
coherent architecture: **USD is the single stored source of truth; GBP is computed at read time** from
one global rate (no stored GBP mirror — cleaner than the trigger approach, no drift, instant reprice).

### Migrations 0005–0008 (applied + verified on live Supabase)
- **0005_fx_settings** — `org_settings` (one editable USD→GBP rate/org, NUMERIC, 0.10–100 guardrail, seeded 1.30) + `fx_rate_history` audit + log trigger + RLS (org_isolation/staff_all/public_read). No reprice trigger needed (GBP is read-time).
- **0006_relabel_usd** — relabel the 159 demo prices' currency to USD (numbers unchanged); 819 variants + 146 offerings now USD.
- **0007_variant_sku_unique** — de-collide the feed's repeating SKUs (suffix -2/-3…) then partial `UNIQUE(org_id, sku)`. SKU is now the match key.
- **0008_customer_accounts** — `customers.stripe_customer_id`; `orders.customer_email`+`customer_user_id`; `uq_customer_users_auth`; `app_customer_id()` SECURITY DEFINER; `ensure_customer_account()` provisioning RPC (idempotent, staff-collision guard); `customer_self` RLS on orders/order_items/customers/customer_users/customer_tiers.

### FX core — DONE, verified
- `pricing.mjs` `usdToGbpMinor(usd, rate)=round((usd/100)/rate)*100` (whole pound) + 2 tests. Engine unchanged otherwise — it receives the converted GBP.
- `catalog.mjs` `getFxRate()` + converts USD→GBP on every read (cards, product, related); sort-by-price unchanged (GBP monotonic in USD).
- `stripe-checkout` recomputes GBP server-side from stored USD + live rate (mirror helper) — charges exactly what the customer saw, ignores client prices.
- `FxRateEditor.jsx` (new "Currency (FX)" admin tab) — edit the rate, live before→after preview, rate history.
- `PricingRules.jsx` preview + `build-seed.mjs` updated for USD.
- **Verified live:** $63→£48, $67→£52, currency GBP; checkout charged £1,338 for a $1,740 variant with a tampered client price ignored (+VAT); rate 1.30→1.50 repriced £392→£339 instantly with no reseed, audit-logged, reverted. Full suite 35 green; build green.

### Customer accounts (hybrid B2B-ready + full self-serve portal) — DONE, verified
- **`customerAuth.mjs`** — signUp/signIn/reset/updatePassword/getSession/onAuth + `ensureAccount()` (calls the `ensure_customer_account` RPC; idempotent; no-ops pre-confirmation) + `getCustomerProfile()`.
- **`AccountDashboard.jsx`** (`#account`, lazy 12KB) — sign in / create account / forgot-password gate + recovery-password panel; profile editor (company/name/phone via `customer_self_update`); order history (customer_self RLS → own orders only) with licence-key placeholder; **Manage billing & cards** (Stripe portal); **one-click re-order** (rebuilds basket from order_items → `#shop`).
- **`stripe-checkout`** — forwards the buyer JWT, validates via `getUser()`, resolves the customer (service_role), **creates/reuses a Stripe Customer on the company** + `setup_future_usage:'off_session'` to save the card, stamps `customer_id/customer_user_id/customer_email` into session metadata. Guests unchanged (Stripe rejects customer + customer_email together — sends exactly one). Staff/forged tokens degrade to guest.
- **`stripe-webhook`** — stamps `orders.customer_id/customer_user_id/customer_email` from metadata (idempotency unchanged).
- **`stripe-portal`** (new edge fn) — Billing Portal session for the signed-in buyer. **Needs a one-time Stripe dashboard Customer Portal config (test mode) before it returns a URL.**
- **`cart.mjs`** forwards the access token; **App.jsx** `#account` route + lazy chunk; **Header** Account link.
- **Verified live (Supabase + Stripe test, full cleanup):** confirmed signup → provision (idempotent) → 0 own orders pre-purchase (RLS) → checkout attached Stripe customer + matching metadata → webhook linked order → **customer reads only their own order via RLS** → staff-collision guard raises. Build green.

### SKU bulk import (USD price book) — DONE, verified
- **`bulkCsv.mjs`** — SKU pipeline (pure): `SKU_COLS`, `parseUsdPriceToMinor`, `normalizeSku`, `variantsToSkuCsv`, `buildSkuPlan(objects, current)`. One CSV row = one variant; **SKU is the match key**. Classifies into creates / updates / unchanged / invalid (missing sku, bad price, bad status, **new product with no vendor**) / duplicates (same sku ≥2× in file). Field-level diff incl. USD price.
- **`BulkImport.jsx`** — export SKU CSV → edit → re-import with a **pre-commit preview** (records · update · new · invalid · duplicate · unchanged + diff table). Commit: resolve/auto-create parent offerings (+ auto-create vendor/category by name), bulk-insert new SKUs, chunked parallel price/text updates by SKU, recompute each touched offering's `from_price` (min USD), write an `import_jobs` audit row. New products land as **draft** (reviewable). Updates are USD-only — GBP recalculates from the live FX rate automatically.
- **Caught + fixed a real bug:** products require a vendor (`chk_product_has_vendor`). New-product rows with no vendor are now flagged invalid in the preview (not a commit crash), and a named-but-unknown vendor is auto-created.
- **Verified live:** round-trip of all 673 real SKUs → 0 false diffs (stable); price update + create-under-existing + create-new-product-with-auto-vendor + from_price/GBP recompute all correct; 14 bulk unit tests. Full suite 40 green.
