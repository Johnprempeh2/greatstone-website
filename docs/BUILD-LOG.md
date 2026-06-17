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

### Cycle 5 (next) — typed catalogue data layer
`src/data/` — the Supabase client (`supabase.mjs`, reads VITE_SUPABASE_URL/ANON from env) + a typed catalogue data-access layer per `docs/api-contract.md` §2 (list offerings with pagination/filter[vendor,category,platform,type]/sort/search + computed price, get-by-slug with variants/specs, vendors, categories). Built against the contract; price computed via `pricing.mjs`. Full e2e needs Supabase/PostgREST → **here is the likely PAUSE point**: the storefront UI + auth + checkout need Docker (local Supabase) or a cloud project + Stripe keys. Will build the data-layer code, then pause and report if infra absent.
