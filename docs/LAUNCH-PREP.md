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
- [ ] Editable legal-page scaffolds (Terms / Privacy / Cookie / Refund), wired to footer/nav.
- [x] Secret hygiene + config reconcile (VITE_SITE_ORIGIN vs VITE_APP_URL; dist secret-grep guard; refresh GO-LIVE-RUNBOOK to 0001–0023).
- [ ] Auth email templates → bundled/CSS logo (no remote image) + single canonical-domain placeholder.
- [ ] FX-rate staleness guard / admin visibility.
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
