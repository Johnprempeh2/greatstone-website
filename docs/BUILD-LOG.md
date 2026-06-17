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

### Cycle 3 (next) — RLS + typed data layer
`0002_rls.sql`: enable RLS + org-scoped policies (`current_setting('app.current_org')`) on every business table (only 1/28 enabled so far). Then `src/data/` — Supabase client + a typed catalogue data-access layer (list/get offerings with computed price, vendors, categories, search/facets) per `docs/api-contract.md`, runnable against local Postgres. Then Phase 1 storefront.
