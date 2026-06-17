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

### Cycle 2 (next) — seed the 159 products + RLS migration + typed data layer
Generate `supabase/seed/` from `greatstone-homepage/assets/products.json` → vendors/categories/offerings/variants/specs/media; add `0002_rls.sql` (enable RLS + org-scoped policies on every business table); build `src/data/` (supabase client + typed queries). Validate seed + RLS on local Postgres.
