# Launch-prep build log

Autonomous build progress on everything that needs no external credential or Ben decision, so it plugs in
once Stripe / production DB / domain / email / legal land. Decisions locked (see docs/LAUNCH-REQUIREMENTS.md):
the new build **fully replaces** the old site (migrate all customers + orders + history), and we **sell live**
at launch with **manual** licence-key fulfilment.

Deferred / Ben-owned (do NOT touch here): live Stripe, production Supabase, domain/DNS, email sender domain,
legal wording.

## Backlog (highest value first)
- [x] **Admin licence-key issuance, order-driven.** Issue the key that fulfils a paid order, from the order.
- [x] **Existing-data migration tooling** (idempotent importer + documented input format + dry-run).
- [x] **Migrated/historical order display** (orders with no Stripe session, marked migrated).
- [x] 301 redirect map from the old-site crawl → public/_redirects (generated + audited; product-exact deferred to Ben's slug map).
- [x] Editable legal-page scaffolds (Terms / Privacy / Cookie / Refund), footer-wired, draft until a solicitor's wording lands.
- [x] Secret hygiene + config reconcile (VITE_SITE_ORIGIN vs VITE_APP_URL; dist secret-grep guard; refresh GO-LIVE-RUNBOOK to 0001–0023).
- [x] Auth email templates → self-contained CSS wordmark (no remote image) + single canonical-domain placeholder.
- [x] FX-rate staleness guard / admin visibility (last-updated signal in the FX editor).
- [x] Staff provisioning validator + read-only verifier CLI + provisioning runbook.

## Log

### Iteration 1 — Order-driven licence-key issuance (fulfilment)
The `licence_keys` table + RLS (0017/0018) and the per-customer `KeyEditor` already existed, but the only
path to issue a key was via Clients, disconnected from the order that needs fulfilling, and "Mark fulfilled"
was a bare status flip. Closed that gap:
- Exported the proven `KeyEditor` from ClientsManager and reused it in OrdersManager.
- Orders admin now loads each order's buyer (`customer_id`/`customer_email`) and its issued `licence_keys`
  (same reverse-embed pattern as `order_items`). New **Keys** column shows issued/purchased (e.g. 1/1) with
  an "issue" nudge when a confirmed order still has unfulfilled items.
- Expanded order detail shows the buyer, an **Issue key** button per line item (pre-fills the product,
  edition and order link, targets the order's customer), and a panel of keys already issued (masked, with
  status). Issuing delivers straight to the buyer's account → Licence keys.
- Guards the case where an order has no linked customer yet (issue from Clients instead).

Verified live in `#catalogue/orders` against the interim DB (4 real orders): Keys column renders (1/1),
expanded detail shows the buyer, the issued key (masked) and the per-item Issue button. 497 tests, build clean.

### Iteration 2 — Legacy-store data migration tooling
For the full-replacement decision: the importer that brings the old store's customers, orders and history
into our schema, ready to run the moment Ben supplies an export. Needs no live service to build or test.
- `src/lib/legacy-migrate.mjs`: pure, unit-tested transforms — maps an export dataset to our
  customers / customer_users / orders / order_items / licence_keys row shapes, maps old order statuses onto
  our enum (paid→confirmed, completed→fulfilled, unknown→confirmed since a migrated order was paid),
  normalises money (minor units, or major→minor), and derives the idempotency keys: companies upsert on
  `slug` ("legacy-<id>"), orders on `reference` ("legacy:<id>", which also marks them no-Stripe-session).
  Validates the whole export up-front and flags orphan orders.
- `scripts/migrate-legacy-store.mjs`: the CLI (I/O + upserts only). `--dry-run` validates + reports the plan
  without writing; apply mode upserts idempotently with the service-role key. Re-runnable safely.
- `docs/MIGRATION-IMPORT.md` + `scripts/legacy-export.sample.json`: documented input format + a working sample.

Verified: 8 new unit tests (mapping, totals, idempotency keys, orphan detection) all green; the CLI dry-run
runs against the sample ("2 companies, 3 users, 2 orders, 3 line items, 1 licence key"). 505 tests, build clean.
Remaining: run against Ben's real export into the production DB (waiting on the export + prod credentials).

### Iteration 3 — Migrated/historical order display
So the imported orders read as real history, not raw data, in both the customer account and the admin.
- `src/lib/order-ref.mjs` (pure, unit-tested): `orderRefDisplay(reference)` → a friendly label and a
  `migrated` flag. Migrated orders (reference `legacy:<id>`) read as "#<id>"; live orders keep the
  Stripe-session truncation. No `orders.metadata` column added (that would break the interim DB's order
  queries until applied) — provenance is read from the reference prefix instead.
- Customer account (AccountDashboard): the order reference now uses the shared label + shows a purple
  **Migrated** tag ("brought over from your previous account"). Invoice links stay gated on invoice_number,
  so migrated orders (no invoice) correctly show none; re-order still works from the stored line items.
- Admin (OrdersManager): reference cell shows the friendly label + a "migrated" tag; the detail line reads
  "Migrated order — no Stripe session (old ref …)" instead of a blank Stripe session.

Verified: 3 new unit tests green; live regression check in #catalogue/orders — existing orders render their
references cleanly, zero false migrated badges. 508 tests, build clean.

### Iteration 4 — Secret hygiene + config reconcile
Housekeeping the audit flagged, all no-external-service:
- **dist secret-scan guard** (`scripts/check-dist-secrets.mjs`, wired as `postbuild` + `npm run check:dist`):
  fails the build if a server-secret shape (sk_/whsec_/sbp_/service_role/postgres URL) reaches the client
  bundle. Ran clean against the current dist (71 files). Publishable/anon keys are intentionally allowed.
- **Config reconcile:** confirmed the app reads only `VITE_SITE_ORIGIN` (src/lib/site-origin.mjs); `VITE_APP_URL`
  is dead config (nothing reads it) — noted in `.env.example`, which is now the complete template (added the
  Resend, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_URL and VITE_VAT_RATE vars that existed only in the live .env).
- **Secret exposure check:** `.env` is gitignored (`.env`, `.env.*`) and was **never committed** (verified via
  git history) — the leak risk is contained to local disk; rotation is still advised at production provisioning.
- **Refreshed GO-LIVE-RUNBOOK** pre-flight: migrations 0001–0010 → 0001–0023, plus the new secret-scan gate.

Verified: `npm run build` runs the guard automatically (clean); 508 tests green.

### Iteration 5 — Auth email templates: remote-image → self-contained wordmark
The five branded auth emails (confirm, reset, magic link, invite, email change) are generated from one
shared shell in `supabase/templates/_build.mjs`. The shell embedded the logo as a **remote PNG** on the
interim host (`greatstone-home.netlify.app/assets/greatstone-logo-web.png`). That is a live launch risk:
the moment that host is retired or the domain cuts over, the logo 404s in every transactional email, and
most clients block remote images by default anyway. Removed the dependency:
- Swapped the `<img>` for a **self-contained CSS text wordmark** — `GREATST`·lime `O`·`NE`, styled inline
  (Arial 800, 3px tracking, cream with the brand lime on the O). Renders identically across Gmail / Outlook /
  Apple Mail, never 404s, needs nothing remote. The brand guide's "embed the real PNG" rule is for HTML
  deliverables; email is the one place a resilient text mark beats an image, so this is a deliberate exception.
- Pulled the host + contact into single `SITE` / `CONTACT` constants at the top of `_build.mjs`, so the
  canonical domain is **one edit** at cutover (nothing else in the templates hardcodes a host).
- Regenerated all five templates.

Verified: generated HTML has **zero** `<img>` tags and **zero** `netlify.app` references (grep); the only
remaining URL is the wordmark's link to the canonical domain and the `{{ .ConfirmationURL }}` action link.
Rendered `confirmation.html` in the browser — wordmark and lime CTA display correctly. 508 tests green, build
clean (secret scan clean). Templates still need applying to the Supabase project (Ben-owned, deferred).

### Iteration 7 — Editable legal-page scaffolds (Terms / Privacy / Cookies / Refunds)
A live store selling to consumers needs Terms, Privacy, Cookies and Refunds reachable from the footer. Built
the structure, routing and wiring now so a solicitor's final wording drops straight into the CMS at launch
(the wording itself stays Ben/counsel-owned). Nothing here commits a legal position: every page opens with a
bold "Draft placeholder, not yet in force" banner, and the pages ship as DRAFT so a real visitor never sees
placeholder wording.
- `store.js`: `LEGAL_SCAFFOLDS` (4 pages, each a compact Hero draft-banner + one Prose section per clause) +
  `seedLegalPages()`. Seeded into fresh stores AND backfilled into existing ones (additive, never overwriting
  an edited page) — so no `SEED_VERSION` bump and no wiped drafts. Pages are `status: 'draft'`, `published:
  null` (a true draft, mirroring `addPageTo`) and flagged `footerOnly`.
- New page flag `footerOnly`: kept out of the primary nav, the footer's main links AND the ⌘K palette, shown
  only in a dedicated footer legal row. Enforced in `nav-order.js` (`publicNavOrder` filter + new
  `footerLegalOrder`) and `Header.jsx` (the order-fallback nav model). The public sees a legal page in that
  row only once its status is `published`; editors see all four (drafts tagged "(draft)") so they're reachable
  to fill in. Gate keys off `status`, never the `published` snapshot (a seeded draft can still carry one).
- `Footer.jsx` renders the `.foot-legal` row; `site.css` styles it quieter than the main links. Cross-links
  between policies use the existing `#go/<slug>` SPA route.

Verified: 7 new `nav-order` unit tests (public vs editor visibility, footerOnly exclusion, draft gating);
522 tests total, build + secret scan clean. Live in the preview: the four pages backfill into the store and
sit in `order`; the public footer shows **no** legal links and the top nav is unchanged (draft-gated); after
locally publishing one, the Terms page renders with its LEGAL kicker, title, bold draft banner, seven clause
sections and a working `#go/refunds` cross-link, and no stray hero CTA/prompt. Zero console errors. Applying
the real wording + publishing is the launch-day plug-in step (counsel-owned).

### Iteration 8 — 301 redirect map (old site → new SPA)
The old greatstonesoftware.co.uk comes fully down, so every inbound link and every indexed URL needs a 301
into the new site or the cutover throws away years of SEO. Crawled the old sitemap (an iCandy reseller
storefront) and built the map, grounded in its real URLs. Key constraint: the new site is a HASH-routing SPA,
so a redirect target must be a route that resolves on FIRST load. That rules out content pages
(about/method/insights/legal are not yet hash-addressable), so those 301 to home for now; the commerce URLs,
which are the ones with buyer intent, map precisely.
- `src/lib/legacy-redirects.mjs` (pure, 10 unit tests): `classifyLegacyPath` maps an old path to a
  load-honoured destination. Vendor pages (`/aspose`) and every product under them (`/aspose/aspose-pdf-for--net`)
  → that vendor's storefront (`/#shop/<slug>`); only `ironsoftware` remaps (→ `iron-software`), the rest are
  identity. Basket/checkout/search → `/#shop`; login/callback/order-confirmation → `/#account`; blog + info +
  legal → home. Emits compact `_redirects` rules (vendor exact + wildcard, so ~200 product URLs collapse into
  10 vendor wildcards) plus an explicit 301 per known content path so nothing soft-404s on the SPA fallback.
- `scripts/gen-legacy-redirects.mjs` writes the block into `public/_redirects` between markers (the
  `/puck-proof` rules and the SPA fallback stay put, fallback LAST). `--check` (CI drift guard), `--audit`
  (coverage report). `scripts/legacy-urls.txt` is the crawled URL list (reference + audit input). npm scripts
  `redirects`, `redirects:check`, `redirects:audit`.
- 70 forced 301 rules written. Audit: 108 known URLs, 72 to a specific destination, 36 to home (blog + info).

Verified: 10 new unit tests; 532 total, build + secret scan clean; `--check` reports in sync; the built
`dist/_redirects` keeps the SPA fallback last. `_redirects` is a Netlify feature (inactive in the dev server),
so I verified the DESTINATIONS resolve: `#shop/aspose` loads the Aspose-filtered storefront (86 results, real
prices) and `#shop/iron-software` activates the Iron Software filter (0 products only because that vendor isn't
seeded in the interim DB — the slug is correct). Remaining for cutover: a fresh crawl (catch any new URLs) and,
when Ben supplies the migrated product-slug map, exact `/vendor/product → /#product/<slug>` lines above the
vendor wildcards. Refining content-page redirects needs hash-addressable content pages (a separate enhancement).

### Iteration 9 — Staff provisioning validator + verifier + runbook
A staff member signs in as a Supabase Auth user; the app then maps `auth.uid()` → a `public.users` profile
(`auth_subject`) to learn their org + role (`app_staff_org()`, migration 0004). If that link, role, org or
active flag is wrong, the person can't sign in or signs in with no powers — a failure invisible until someone
tries it. Built the pieces to provision that reproducibly and catch the faults before launch:
- `src/lib/staff-provision.mjs` (pure, 13 unit tests): `validateStaff(rows, {orgId, authUsers, customerAuthIds})`
  flags, as launch-blocking errors, a profile with no `auth_subject`, an unknown role, the wrong org, duplicate
  `auth_subject`/email, a profile pointing at a missing Auth user, and no active owner/admin; as warnings, an
  inactive/soft-deleted-but-live account, no CMS-capable user, an email mismatch, and a true orphan Auth user.
  Customers (their own Auth users) are excluded from the orphan check via `customer_users.auth_subject`, so it
  stays quiet at production scale. Reuses `staffRoles.mjs` as the single role source of truth.
- `scripts/verify-staff.mjs`: read-only CLI (service-role) that pulls `public.users`, the Auth user list and the
  customer Auth ids, runs the validator and prints a report. Writes nothing; exits 1 on blocking errors so it
  can gate a cutover. `npm run verify:staff`.
- `docs/STAFF-PROVISIONING.md`: the two-step provisioning process (Auth user → linked profile row), the role
  table, an idempotent SQL template, off-boarding, and how to run the verifier.

Verified: 13 new unit tests; 545 total, build + secret scan clean. Ran the verifier read-only against the
interim DB: the 3 seeded staff (1 owner, 1 admin, 1 editor, 2 managers) validate clean; after excluding
customers it surfaces a single genuine orphan Auth user (a personal email that is neither staff nor customer).
This closes the last self-contained launch-prep item; what remains is Ben/counsel/credential-gated.

## Backlog cleared — enhancements

The nine locked items (a–i) are all shipped. Further iterations refine what plugs in at cutover.

### Iteration 10 — Redirect map: product-exact override support
Completed the redirect tooling so Ben's migrated product-slug map drops straight in. Until it lands the vendor
wildcards send every old product URL to the right catalogue; with the map, each old product URL 301s to its
exact new product page.
- `src/lib/legacy-redirects.mjs`: `productRedirectRules(map)` maps `{ "<old product path>": "<new slug>" }`
  → `/#product/<slug>` rules; `renderBlock(paths, map)` emits them ABOVE the vendor wildcards so first-match
  reaches the exact product. Skips `_comment` metadata + blank slugs; tolerates a full `/#product/x` value.
- `scripts/gen-legacy-redirects.mjs`: reads `scripts/legacy-product-map.json` (or `--product-map <file>`) when
  present; `--audit` reports the override count. `scripts/legacy-product-map.sample.json` documents the format.
  With no map present the generated block is byte-identical to before, so nothing changes until the map exists.

Verified: 3 new unit tests (mapping, metadata/blank skipping, product-before-wildcard ordering); 548 total,
build + secret scan clean; `--check` still reports in sync (public/_redirects untouched); `--audit` against the
sample map reports 6 product-exact overrides. Cutover step: save Ben's map as `scripts/legacy-product-map.json`
and run `npm run redirects`.

Still teed up for John's steer (needs a hash-vs-path decision, so not built unsupervised): making CONTENT pages
(about/method/insights/legal) deep-linkable, which would also let the redirect map target them precisely instead
of sending them to home.

### Iteration 11 — Licence-key delivery email (completes item (a)'s email hook)
Item (a) called for a licence-key admin surface AND an email hook; issuance was built (LP1) but the customer
was never told their key was ready. Closed that, in the manual-fulfilment model (staff upload the key, the buyer
is told to collect it). SECURITY: the email never contains the key — email is not a secure channel and the
order-confirmation email already says keys live in the account — it links the customer to their account to view
and copy it there.
- `src/lib/licence-email.mjs` (pure, 8 unit tests): `buildLicenceEmail({customerName, items, orderRef,
  accountUrl})` → `{subject, html, text}`. Self-contained CSS wordmark (no remote image), single canonical
  domain, British voice; singular/plural handling; HTML-escapes product names; a test asserts a stray
  `licence_key` value is never rendered. Rendered a sample in the browser to confirm the branding.
- `supabase/functions/notify-licence-issued/index.ts`: staff-only edge function (verifies the caller is a
  `public.users` row) that loads the order's buyer + issued keys (offering/variant only) and sends via Resend,
  no-op when `RESEND_API_KEY` is unset — mirrors `sendOrderEmail` in stripe-webhook. Its email HTML mirrors the
  pure builder (kept in step, same convention as pricing.mjs ↔ stripe-checkout). Deploy-pending.
- `ClientsManager` KeyEditor: after issuing a key that fulfils an order, best-effort invokes the function
  (non-blocking, failure-tolerant). If it isn't deployed or email isn't configured yet, the key still shows in
  the account and the note is skipped; when live, the toast reads "issued and emailed to the client".
- Runbook: added the function to the deploy list; it reuses the order email's Resend secrets.

Verified: 8 new unit tests; 556 total, build + secret scan clean; sample email rendered on-brand in the preview.
The send path is dormant until the function is deployed + Resend configured (both Ben/credential-gated).

### Iteration 12 — Migration importer: duplicate-key guard (cutover-safety hardening)
Adversarial pass on the highest-stakes cutover artifact — the importer runs ONCE against real customer/order/
money data, upserting on derived keys (customer slug, order reference). Found a real gap: it checked for orphan
orders but NOT for duplicate keys. Two source customers that derive the same slug, or two orders that derive the
same reference (e.g. the same legacy id twice), would upsert onto each other — the second silently overwriting
the first. In a one-shot money migration that is undetected data loss.
- `validateExport`/`summarise` now compute `duplicateCustomerSlugs` + `duplicateOrderReferences`.
- The importer reports them in the dry-run and **refuses to apply** while any remain (before it touches the DB),
  so a data-quality problem in Ben's export is caught up-front, not after a partial write.
- `docs/MIGRATION-IMPORT.md` documents the check.

Verified: 3 new unit tests; 559 total, build + secret scan clean. End-to-end against a crafted duplicate export:
the dry-run names the offending keys (`acme`, `legacy:100`) and apply refuses with exit 1 before the credentials
check; the real sample export stays clean. Content-page routing remains the one deliberately parked item (the
codebase's own seo-files.mjs notes it needs path routing + prerender — John's call).

### Iteration 13 — Migration importer: duplicate customer legacy_id guard (mis-linkage)
Continued the adversarial pass into the importer's I/O flow. Found a second, subtler gap the iteration-12 guard
missed: the apply loop resolves an order's customer via `customerIdByLegacy.set(String(c.legacy_id), id)` —
LAST write wins. Two customers sharing a `legacy_id` but with DIFFERENT slugs slip past the slug check, and every
order for that id then links to the WRONG company (silent money/history mis-attribution).
- `validateExport`/`summarise` now also compute `duplicateCustomerLegacyIds`; the importer warns on it in the
  dry-run and includes it in the refuse-to-apply guard.
Verified: 1 new unit test (asserts the legacy_id dup is caught while the slug check correctly is NOT triggered);
560 total, build + secret scan clean. End-to-end: an export with legacy_id 1 on two differently-slugged customers
is flagged and apply refuses; the real sample stays clean.

Noted-but-not-built (completeness, not correctness): a migrated *refunded* order doesn't carry its refund amount
(`refunded_minor` isn't mapped) — worth adding when Ben's export format is known. [Closed in iteration 14.] The
importer isn't transactional (Supabase JS has no multi-statement tx), but it's idempotent, so a mid-run failure
is safe to re-run — already documented.

### Iteration 14 — Migration importer: carry the refund amount (order-history completeness)
Closed the completeness gap flagged in iteration 13. "Full order history" includes refunds, so `buildOrder` now
maps `refunded_minor` (orders.refunded_minor, migration 0011) from the export. Faithful only: taken from an
explicit `refunded_minor`/`refunded` field, never inferred from the status (inferring a full refund from a
'refunded' status would over/under-state a real money figure), and clamped to the order total since a refund
cannot exceed what was paid. Absent → 0.
- The importer already upserts the whole order object, so no CLI change; and both order displays
  (`OrdersManager`, `AccountDashboard`) already read `refunded_minor` (Track 3), so a migrated refund shows its
  "−£X" badge + a Refunded total line with no further work.
Verified: 1 new unit test (explicit minor + major amounts, clamp-to-total, absent→0, no status inference); 561
total, build + secret scan clean; the sample export still imports clean.

### Iteration 15 — Cutover consolidation: one preflight gate + one ordered checklist
Fourteen iterations produced four separate operational tools (migration importer, redirect generator, staff
verifier, dist secret scan) scattered across docs, plus a GO-LIVE-RUNBOOK that predated them. The remaining
launch risk isn't a missing feature — it's running these out of order or forgetting one on the day. Closed that:
- `npm run preflight` chains the automated gates into one green/red command: `npm test` → `npm run build`
  (SEO files + the dist secret scan) → `npm run redirects:check` (drift guard). Verified: exit 0, ends on
  "public/_redirects legacy block is in sync".
- `docs/CUTOVER-CHECKLIST.md`: the single ordered launch-day runbook — prep (Ben's inputs, migrations, publish
  legal), then the T-0 sequence (freeze old site → preflight → redirects with product map → migration dry-run
  then apply → verify:staff → deploy functions+secrets → front-end deploy → DNS → £1 smoke test → backups),
  with explicit go/no-go gates and rollback. It sequences + cross-references the detailed docs rather than
  duplicating them; GO-LIVE-RUNBOOK now points at it as the master checklist.

This is the operational capstone for the launch-prep work. Everything that remains is Ben/counsel/credential-
gated, and content-page routing stays parked for John (hash vs path).

### Iteration 6 — FX-rate staleness signal (mis-pricing guard)
Whole catalogue is stored in USD and shown in GBP as `USD ÷ rate`, where the rate is a single value set
**by hand** (no automatic feed — a deliberate choice). The gap: if nobody refreshes it while the real
market moves, every price silently drifts and a live order gets charged at a stale rate. Added a clear
staleness signal so a forgotten rate gets caught before it prices a real sale:
- `src/lib/fx-staleness.mjs` (pure, unit-tested): turns the rate's `updated_at` into `{ days, level, label,
  warn }`. `fresh` under 14 days, `ageing` at 14, `stale` at 30 (named constants). Clamps future
  timestamps (clock skew) to 0 and returns `unknown` for a missing/unparseable date rather than throwing.
- `FxRateEditor` now loads `org_settings.updated_at` and shows a banner under the intro: teal when fresh,
  amber/coral with a "check it still matches the market before it prices a live order" nudge once it ages.
  `role="alert"` at the stale tier, `role="status"` otherwise. No schema change — `updated_at` already
  exists on the row; the whole feature is read-only over existing data.
- `admin.css`: `.fx-stale-{fresh,ageing,stale}` reusing the proven `.lk-exp-*` token pattern (teal / warning /
  danger).

Verified: 7 new unit tests green (thresholds, day-floor, skew clamp, labels, unknown); 515 tests total,
build + secret scan clean. Live in `#catalogue/fx`: the banner shows the real interim rate as "last updated
13 days ago" (teal — one day from the amber nudge, so the signal is already doing its job); toggled the class
live to confirm the amber ageing state renders with the full nudge. Zero console errors.
