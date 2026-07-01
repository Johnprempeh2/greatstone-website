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
- [ ] ~400-URL 301 redirect map from a crawl of the old site → public/_redirects.
- [x] Editable legal-page scaffolds (Terms / Privacy / Cookie / Refund), footer-wired, draft until a solicitor's wording lands.
- [x] Secret hygiene + config reconcile (VITE_SITE_ORIGIN vs VITE_APP_URL; dist secret-grep guard; refresh GO-LIVE-RUNBOOK to 0001–0023).
- [x] Auth email templates → self-contained CSS wordmark (no remote image) + single canonical-domain placeholder.
- [x] FX-rate staleness guard / admin visibility (last-updated signal in the FX editor).
- [ ] Staff provisioning seed/verify.

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
