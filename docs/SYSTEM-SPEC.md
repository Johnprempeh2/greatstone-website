# Greatstone Commerce Platform — System Specification

> The blueprint for the system that replaces greatstonesoftware.co.uk for Ben: a backend-agnostic data contract, the CMS capability spec, and the transition plan. Generated 2026-06-17 by an 8-agent design workflow, grounded in live inspection of the current site and the real 159-product/819-variant catalogue.
> Companion files: **`docs/schema.sql`** (28-table Postgres DDL) · **`docs/api-contract.md`** (REST `/api/v1` + Inertia contract).

---

# Greatstone International — Unified Commerce Platform

## System Specification

> **Status:** Implementation-ready architecture spec. This is the front-matter that binds eight detailed chapters (Capability Audit, Schema, Pricing Engine, Bulk & AI Ops, API Contract, CMS UX, Services Unification, Transition) into one coherent contract. It is simultaneously (a) the build brief for an interim in-house implementation, (b) the contract the agency's Laravel 12 + Inertia backend must satisfy, and (c) the rubric against which the agency's Sprint-1 code is graded.
>
> **Ground truth.** Every number in this document is verified against the live catalogue at `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json`: **159 products, 10 vendors, 32 categories, 819 variants**, all GBP, `discountPct: 0` and `minOrderQty: 1` on every variant, `pricingGroups: []` (empty by design), **13 null-price (POA) products**, **12 featured**, min variant **£63**, max variant **£12,534,195** (the BIGINT outlier). The system being replaced is the live Laravel/"Syrup" reseller storefront at `https://www.greatstonesoftware.co.uk`.
>
> **Document order.** This front-matter (sections 1–8) precedes the chapters. Where this front-matter and a chapter appear to differ, **the chapter is authoritative for its own domain** (the Schema chapter owns table shapes; the Pricing chapter owns the compute function; the API chapter owns the wire contract) and this front-matter is authoritative for **cross-cutting decisions, naming, and sequencing**. Section 8 (Coherence Review) records every place the two were reconciled.

---

## 1. Executive Summary

Greatstone International is replacing `greatstonesoftware.co.uk` — a competent but closed, dated Laravel/"Syrup" reseller webshop — with a **unified, API-first commerce platform** that resells ten software vendors' products **and** sells Greatstone's own services through one system, one pricing engine, one quote pipeline, and one component-based CMS.

The incumbent gets the commerce primitives right (real per-edition GBP prices, a real basket, a Stripe/VAT checkout, social-login accounts, a 44-post blog) and the modern reseller value-add wrong (no discovery — vendor-only grouping, name-match search; no exposed bulk tooling; flat manual pricing; no headless API; no AI; a card-checkout that over-commits enterprise licence sales while quietly running parallel lead forms). We match every working capability so the replacement is a net gain, never a regression, and we decisively out-class the rest.

**What we are building, in one paragraph.** A multi-tenant catalogue of **offerings** — reseller products *and* Greatstone services in one table — each with real editions/variants priced in integer minor units, browseable on two axes (vendor **and** functional category) with full-text faceted search; a **rules-based pricing engine** (scoped to all/vendor/category/offering/customer-tier, percentage or fixed, scheduled, single-winner, floor-clamped, never negative, never on POA) that overlays prices at read time without mutating them; a **browse-and-enquire / quote-led** commerce model that replaces the misleading cart, snapshotting prices onto immutable quotes; **bulk Excel/CSV round-trip** (export → edit → re-import as idempotent upsert) gated by dry-run + diff + validation + rollback + audit; **Claude-assisted operations** that always propose → human-preview → admin-approve and never auto-apply destructive change; and a **Puck-based visual CMS** with draft→publish, versioning, and a `ProductGrid`/`OfferingGrid` block that surfaces catalogue slices on any page — all behind real roles/permissions, attributed in a universal audit log, reversible by soft-delete and rollback, and built to stay fast at 200+ offerings and 800+ variants. The contract is **backend-agnostic**: it is satisfied identically by the agency's Laravel 12 + Inertia backend or an interim Postgres/Supabase, which is precisely what de-risks the keep-vs-rebuild decision.

**For Ben (Greatstone CEO).** This is the modern replacement for the storefront the business runs today. It keeps everything that works — product pages with real editions and GBP prices, search, accounts, content — and fixes the three things customers and the team feel most: *finding the right tool across ten vendors* (real filters and capability search instead of an A–Z brand wall), *running the catalogue without the agency or a locked back-office* (edit prices in Excel, run a vendor-wide sale as a toggle, generate copy with AI — all with a one-click undo), and *quoting enterprise buyers properly* (a quote/PO motion, not a card swipe). It is API-first, so the same catalogue powers the website, sales tooling, and AI — and it is built so we can hand it to the agency's Laravel backend or run it ourselves, deciding that on evidence rather than guesswork.

---

## 2. Guiding Principles & Best Practices

These ten principles are the contract every chapter honours and the first lens of the Sprint-1 review.

1. **Contract-first / backend-agnostic.** The API contract (Chapter: API Contract) and the canonical schema (Chapter: Schema) are the seam. The same REST `/api/v1` surface and the same table shapes are implemented identically by the agency's **Laravel 12 + Inertia** backend or an interim **Postgres/Supabase**. No business rule lives only in a UI; the contract is the source of truth, and it doubles as the grading rubric.

2. **Money is integer minor units + an ISO-4217 currency code — always, everywhere.** No floats, no `'From £870'` strings. Stored as **BIGINT** (the feed already carries a £12,534,195 variant; int4 is a latent overflow bug). Price and currency travel as a **both-or-neither pair** (`CHECK ((price IS NULL) = (currency IS NULL))`); `NULL` means **POA / "Contact for licence"**, never an empty field.

3. **Draft → publish on every surface.** Catalogue entities use `status ∈ {draft, published, archived}` + `published_at`, public reads scoped to `status='published'`; content pages hold `draft_data`/`published_data` side by side (public reads `published_data`). The same status pill, the same publish gate, the same "needs attention" math appear everywhere — learned once, applied everywhere.

4. **Audit everything; nothing is silently lost.** A universal `audit_log` carries before/after for every mutation, attributed to a user or a system actor (import job, AI action). Soft-delete (`deleted_at`) makes deletion reversible; optimistic concurrency (`row_version`) makes concurrent edits safe; `page_versions` give point-in-time restore.

5. **Admin-only sensitive ops, gated and visible.** Publish, pricing publish, import apply, role change, and AI-destructive apply are gated behind named `permissions` (e.g. `pricing.publish`, `import.apply`, `ai.approve`). For users who lack a permission the control is **visibly disabled with a tooltip**, not hidden — the operator learns the system's shape.

6. **Never fake auth or payments.** Authentication is delegated to an IdP via `auth_subject`; **no password hash lives in this schema**. Checkout/payment is **out of scope** — `orders`/`order_items` exist so the contract is complete and a quote can be converted later, but no card flow, no Stripe call, no faked confirmation is ever wired. The reseller business is **browse-and-enquire**, quote-led by design.

7. **Idempotent, reversible imports.** Every bulk mutation funnels through one pipeline (`import_jobs`/`import_job_rows`): dry-run → diff → admin confirm → transactional apply → `rollback_token` → audit. Re-importing the same file (matched on `source_checksum`) is a no-op. Upserts key on stable business keys: offerings on `(org_id, slug)`, variants on `(offering_id, sku, license_type, billing_period)`.

8. **AI proposes, humans approve.** Every AI operation produces an `ai_actions` proposal with a previewable diff and materialises (on approval) as a normal `import_job` — inheriting the same validation, audit, and rollback. `chk_ai_approved` makes "applied without an approver" structurally impossible; destructive changes are double-gated (`is_destructive` + `ai.approve` + typed confirmation). No AI fast-path bypasses human review.

9. **Accessibility by construction.** Every interactive control carries `title` + `aria-label`; dialogs trap focus; lists use `role="grid"/"list"/"listbox"`; state is conveyed by class *and* ARIA (and never by colour alone); async results announce via `aria-live`/`aria-busy`; irreversible actions never sit under a default-focused Enter. WCAG 2.1 AA is the floor.

10. **Tenant isolation as a backstop, not a hope.** Every business table carries `org_id → organisations(id)` and an identical RLS policy keyed off `current_setting('app.current_org')` (from the JWT on Supabase, from DB middleware on Laravel). The app already filters by org; RLS guarantees that a query which *forgets* the org filter returns zero cross-tenant rows. Unique keys are `(org_id, slug|sku|reference)`.

**Do-better-than-the-old-site themes** woven through all of the above: **discovery** (dual-axis taxonomy + faceted, typo-tolerant, capability search vs. the A–Z brand wall and name-match cliff); **bulk** (Excel round-trip + AI ops vs. an opaque locked back-office); **pricing** (a scoped, scheduled, single-winner rules engine vs. flat manual per-edition prices); **headless** (an API-first catalogue/content surface vs. `/api → 404`); and **coherent commerce** (one quote-led offerings model vs. a card checkout running beside parallel lead forms).

---

## 3. The Unified-Offerings Decision

**Recommendation: unified. One `offerings` table, `type ∈ {product, service}`. Not a separate section, not a separate subsystem.** (Argued in full in the Services Unification chapter; restated here crisply.)

A reseller licence and a Greatstone engagement are the same *shape* of commercial object: a slugged, categorised, described, spec-listed, gallery-bearing thing with one or more priced (or POA) line items and a quote-or-buy path. The schema encodes the equivalence with two CHECK constraints and one behavioural switch:

- `chk_product_has_vendor` — a **product** requires a `vendor_id`.
- `chk_service_no_vendor` — a **service** forbids one (`vendor_id IS NULL`). A vendor-scoped pricing rule therefore *structurally cannot* discount a Greatstone service, and the storefront vendor facet naturally excludes services — no guard code.
- `fulfilment_mode` (`license | subscription | engagement | enquiry`, constrained per type by `chk_fulfilment_for_type`) is the behavioural switch that replaces a type split.
- Type-specific fields that don't deserve columns live in `offerings.attributes` JSONB (`{duration_weeks, delivery_mode, day_rate_minor, cta_mode, …}` for services; `{trial_url}` for products) — keeping the shared table narrow, not sparse-wide.

Service variants reuse `offering_variants` verbatim: a fixed package (`billing_period='one_time'`, real price), a day-rate (`min_order_qty` as the minimum engagement length), a retainer (`billing_period ∈ {monthly, annual}`), or POA (null base, un-discountable). `license_type` carries the engagement model label; `sku` carries a Greatstone engagement code.

**Trade-offs, decisively.** Unification costs two CHECK constraints and one JSONB column. A separate services subsystem "avoids" that cost and re-pays it many times over: a forked pricing engine, a second importer, a second AI integration, a second quote pipeline, duplicated search/SEO/media/audit/RLS, and two contracts for the agency to implement. Worse, the highest-value Greatstone sale — **a reseller licence bundled with the build engagement that deploys it** — is only expressible if both live in one `offerings`/`quote_items` graph. The brief is explicit ("both are one system"), the data is identical in shape, and the operational saving is large. **Build it once.** (The self-vendor alternative — a fake `vendors.greatstone` row — was considered and rejected: it pollutes the vendor facet and lets careless vendor-scoped rules bleed onto services. The `NULL` path is what the constraint enforces.)

Presentation stays distinct over one data model: shared catalogue chrome and facets, a top-level `type` filter (`Software · Services · All`), and a `type`-selected detail template (editions table for products; deliverables + outcomes + package cards for services). Routing: `/{vendor}/{slug}` for products, `/services/{slug}` for services, both resolving to the same `Offering` API resource.

---

## 4. Architecture & Interim-DB Strategy

### 4.1 The seam: a backend-agnostic contract

The platform is three layers with a single, explicit seam between them:

```
   ┌─────────────────────────────────────────────────────────────┐
   │  PRESENTATION                                                 │
   │  • Public storefront (catalogue, PDP, services, quote)       │
   │  • Greatstone Studio (the CMS admin app — Puck + managers)   │
   └───────────────▲─────────────────────────────────────────────┘
                   │   THE SEAM
                   │   REST /api/v1  (+ Inertia-prop twin per endpoint)
                   │   • Money = BIGINT minor units + currency
                   │   • Pricing computed server-side, single-winner
                   │   • Auth via IdP; org from session, never a param
                   │   • One error envelope, cursor+offset paging,
                   │     If-Match concurrency, Idempotency-Key
   ┌───────────────▼─────────────────────────────────────────────┐
   │  CONTRACT  (the API Contract chapter — authoritative wire)   │
   └───────────────▲─────────────────────────────────────────────┘
                   │   Each endpoint cites its backing table
   ┌───────────────▼─────────────────────────────────────────────┐
   │  IMPLEMENTATION — interchangeable, behind the same contract  │
   │  ┌────────────────────────┐    ┌──────────────────────────┐ │
   │  │ Agency: Laravel 12 +   │ OR │ Interim: Postgres /       │ │
   │  │ Inertia + (their DB)   │    │ Supabase (DB+API+auth+RLS)│ │
   │  └────────────────────────┘    └──────────────────────────┘ │
   │  Both implement the canonical schema (Schema chapter) and    │
   │  satisfy the contract identically.                           │
   └─────────────────────────────────────────────────────────────┘
```

The **canonical Postgres schema** (Schema chapter) is the data contract; the **REST `/api/v1` surface** (API chapter) is the wire contract. Together they are implementation-agnostic: the same `offerings`/`offering_variants`/`pricing_rules`/`import_jobs` shapes and the same endpoints are honoured by Laravel-over-their-DB or by Supabase-over-Postgres. Sensitive logic — price computation, audience/tier resolution, publish gating, RLS — lives **server-side** in either implementation, never in the client.

### 4.2 Why an interim Postgres/Supabase de-risks the keep-vs-rebuild decision

The open strategic question (per memory: keep-their-backend-vs-rebuild + hosting still OPEN after the 16-Jun pivot) is exactly the kind of decision John's style says to *not barrel ahead on*. The contract-first seam lets us avoid betting:

- **Build the contract and the Studio against an interim Supabase now.** Supabase gives Postgres (the canonical schema runs as-is), an auto-generated API, IdP auth, and RLS — so the front end and the admin app are real, the pricing engine and importer are exercised against real data, and the product is demonstrable to Ben on Friday **without waiting on the agency**.
- **The agency's Laravel build slots in behind the same seam.** If their Sprint-1 code satisfies the contract, we point the Studio at it and retire the interim DB — zero front-end rewrite. If it doesn't, we keep running on the interim DB and the decision was never blocked on them.
- **The bet is reversible either way.** Because no business logic leaked into the client and no table shape diverged from the canonical schema, "keep theirs" and "run ours" are both one-config-change destinations, not rewrites.

### 4.3 Evaluating the agency's Sprint-1 code against this spec

The Capability Matrix (Capability Audit chapter) and the principles in §2 are the rubric. Grade Sprint-1 on:

1. **Money model** — BIGINT minor units + currency as a both-or-neither pair, no float/string prices anywhere. *(Pass/fail gate.)*
2. **Schema fidelity** — `offerings` unified (product+service, the two CHECK constraints present), variants on the composite key, real FKs + indexes, soft-delete, `row_version`, audit columns. The `pricing_rule_targets` **join table**, not a `scope_ids[]` array.
3. **Pricing correctness** — single-winner, floor-clamped, never-negative, never-on-POA, `active` defaults FALSE; computed server-side; a non-persisting preview endpoint exists.
4. **Tenant isolation** — `org_id` on every business table + RLS policy; unique keys `(org_id, …)`.
5. **Draft→publish + audit** — status/published_at on catalogue, draft/published split on pages, universal audit log with rollback grouping.
6. **Bulk pipeline** — dry-run/diff/validate/apply/rollback with idempotent upsert on stable keys; the export round-trips (export → immediate re-import = all no-op).
7. **AI discipline** — propose→preview→approve→apply, `chk_ai_approved`, destructive double-gating.
8. **No fake auth/payments** — IdP-delegated, no password hashes, no wired checkout.
9. **API conformance** — the `/api/v1` endpoints exist with the specified envelopes, paging, concurrency, and error shape; each is backed by the cited table.
10. **Accessibility + observability + tests** — WCAG AA on admin surfaces, audit observability, automated tests as standard.

Any Sprint-1 deliverable is accepted only when items 1, 3, 4, and 8 pass outright (they are safety/correctness gates) and the remainder are met or have an agreed, ticketed gap.

---

## 5. Transition Plan off greatstonesoftware.co.uk

The live site is a **working transactional system** (cart, Stripe checkout, accounts, 44-post blog, ~186 product pages, 289 sitemap URLs). The transition must preserve parity, not just swap a catalogue. Six stages:

1. **Data export & reconciliation.** The catalogue is already mirrored to `assets/products.json` (159 products of the live ~186; the remainder 404 on the live origin). Reconcile the gap: crawl the remaining live `/{vendor}/{slug}` pages and the 289 sitemap URLs, capture editions + GBP prices + content, and import via the bulk pipeline (dry-run → diff → apply) so every imported row is auditable and reversible from day one. Blog posts (44) and marketing pages (`who-we-work-with`, `why-choose-us`, `assessment-framework`) migrate as `content_pages` (§5.4).

2. **Slug → 301 redirect mapping.** The live URL space is `/{vendor}/{slug}` for products, `/blog/{slug}` for posts, plus curated marketing paths. Build a redirect table mapping every live URL to its new home: products keep `/{vendor}/{slug}` (the convention is preserved verbatim — no redirect needed where the slug is unchanged), services move to `/services/{slug}`, retired/renamed slugs get explicit **301**s (and the importer's `_action: rekey` writes a redirect record so a genuine re-key never orphans a URL). Preserve `sitemap.xml` and `robots.txt` semantics. **No live URL is allowed to 404 post-cutover** — the redirect map is a cutover gate.

3. **Parallel run.** Stand the new platform up on a staging domain against the interim DB (or the agency backend once it conforms). Run it **alongside** the live site: same catalogue, same prices, real search/facets, the quote flow live. Validate price parity per edition (new computed price === live published price when no rule is active), content parity, and account/auth parity before any traffic moves.

4. **Content migration.** Blog + marketing pages become Puck `content_pages` with `draft_data`/`published_data`; the `ProductGrid`/`OfferingGrid` block lets a migrated marketing page surface real catalogue slices. Media (10 vendor logos, 153 product icons, galleries) imports into `media_assets` with checksum dedupe, fixing the incumbent's broken-logo and blank-alt-text debt.

5. **Cutover.** Once parity is signed off: point the apex domain at the new platform, activate the 301 redirect map, submit the refreshed sitemap. Keep the old origin reachable read-only for a defined window as a fallback. **Auth/account parity is non-negotiable at cutover** — social SSO (Google/Microsoft/LinkedIn via real OAuth) and password reset must work, because we are replacing working accounts, not adding new ones.

6. **Ben's day-one.** Ben signs in to the **Studio launcher** (not a canvas, not the public site): six clickable stat tiles (Live pages, In review, Unpublished pricing, Offerings, Open quotes, Team) and a task grid (Offerings, Pricing, Bulk import, AI assist, Media, Content, Quotes, Vendors/Categories, Team, View live). Day-one he can: filter to all 86 Aspose offerings in two keystrokes; open IronPDF and see its 10 editions with real GBP prices; run a vendor-wide sale as a preview-then-toggle rule; export prices to Excel, edit, and re-import with a dry-run diff and one-click rollback; triage an incoming quote; and publish a page — every action gated by his role, attributed in the audit log, reversible.

---

## 6. Phased Build Plan

Each phase is independently shippable and demonstrable. The interim DB underpins Phases 1–3; AI-assist and full bulk land where they add most leverage.

| Phase | Goal (shippable outcome) | Lands here | Depends on |
|---|---|---|---|
| **0 — Foundations** | Canonical schema migrated on interim Postgres/Supabase; org + RLS + auth (IdP) + roles/permissions seeded; audit log live; **real data loaded** (159 products, 10 vendors, 32 categories, 819 variants) via a first bulk import. | Schema, tenancy, audit, seed import. | — |
| **1 — Read-only storefront + API** | Public catalogue: dual-axis browse, faceted + full-text search, PDP with editions, services template, `/api/v1` catalogue reads. **Replaces discovery — the incumbent's biggest failure.** | API contract (reads), search, taxonomy. | Phase 0 |
| **2 — Studio core (catalogue management)** | The launcher + Offerings Manager (list/detail, variants, specs, media, SEO), Vendors/Categories managers, Media library. Draft→publish on catalogue. **Replaces the locked back-office for everyday editing.** | CMS UX, draft→publish, optimistic concurrency. | Phase 1 |
| **3 — Pricing engine + quotes** | Pricing-Rules Manager with live before/after + "preview as tier"; server-side single-winner compute on card/PDP/quote; quote capture with price snapshotting; Quotes inbox. **Replaces flat manual pricing and the misleading cart.** | Pricing engine, quotes. | Phase 2 |
| **4 — Bulk round-trip** | Excel/CSV export → edit → re-import as idempotent upsert; dry-run + diff + validation + rollback + audit; price-only sheet for mass reprices. **Replaces "no exposed bulk tooling."** | Bulk & AI Ops (bulk half). | Phase 2 (uses the import pipeline that Phase 0's seed import established) |
| **5 — AI-assist** | Claude ops on the same pipeline: NL bulk edits, messy-spreadsheet→schema mapping, description/SEO generation, dedupe — propose→preview→approve→apply, destructive double-gated. **The differentiator the incumbent has zero of.** | Bulk & AI Ops (AI half). | Phase 4 (AI materialises as import jobs) |
| **6 — Content CMS + transition** | Puck pages (draft/published, versions, restore), `OfferingGrid` block; blog + marketing migration; 301 redirect map; parallel run; cutover. | Content pages, transition. | Phases 1–5 |
| **7 — Backend convergence** | If/when the agency's Laravel build conforms to the contract, repoint the Studio + storefront at it behind the same seam; retire or keep the interim DB per the keep-vs-rebuild decision (now made on evidence). | Architecture §4.2. | Sprint-1 conformance |

Sequencing logic: **discovery first** (Phase 1 fixes the most-felt customer pain and is pure read); **everyday editing before pricing** (you must be able to manage a catalogue before you discount it); **bulk before AI** (AI rides the bulk pipeline, so the pipeline must exist first); **content + cutover last** (it depends on everything being real). The interim DB makes Phases 1–6 deliverable independent of the agency, and Phase 7 is the convergence point, not a blocker.

---

## 7. Key Decisions Needing John's Input

Each with the recommendation, so John can weigh and confirm (per his decision style: surface the trade-off, don't barrel ahead).

| # | Decision | Options | **Recommendation** |
|---|---|---|---|
| **D1** | **Interim DB vs. wait for the agency** | (a) Build now on Supabase behind the contract; (b) wait for the Laravel Sprint-1. | **(a).** Build on the interim DB now. It de-risks keep-vs-rebuild, makes Friday's review real, and converges to the agency backend behind the same seam if their code conforms. Reversible either way. |
| **D2** | **Keep agency backend vs. rebuild in-house** | Adopt their Laravel 12 backend; or run our own on the interim DB long-term. | **Defer, decide on evidence.** Grade Sprint-1 against §4.3. The contract-first seam means this need not be decided now — and shouldn't be, until their code is gradable. |
| **D3** | **Checkout: stay quote-led, or add self-serve card later?** | Quote-only; or quote-led with optional Stripe self-serve for low-value fixed packages. | **Quote-led now; `orders` modelled but no payment wired.** Enterprise licence buyers want quote/PO/VAT-invoice; the card path over-commits. Revisit self-serve only if data shows demand for small fixed packages. |
| **D4** | **Hosting** | Netlify (current homepage host) + Supabase; or align with the agency's hosting. | **Netlify + Supabase for the interim build** (matches the existing homepage deploy flow), revisit at D2. Keep it portable. |
| **D5** | **Public discount badging tone** | Loud "20% OFF" flags; or quiet "Offer / Preferred pricing" on an enquire-framed site. | **Quiet, configurable per rule (`pricing_rules.label`).** Matches the consultative, browse-and-enquire positioning; loud retail flags read wrong for enterprise dev tooling. Admin can override per campaign. |
| **D6** | **Customer-tier pricing at launch?** | Ship tier pricing in Phase 3; or defer until real tiered customers exist. | **Build the capability in Phase 3, seed one or two tiers, but only activate tier rules when a real Partner/Enterprise account exists.** The engine and "preview as tier" cost little to include; activating prematurely invents pricing we don't have. |
| **D7** | **Rounding policy** | Honest (`round_to: 'none'`, default); or charm pricing (`…99`). | **Default to honest; leave charm as a per-org/per-rule opt-in.** Quote-framed B2B reads as straightforward; charm pricing is a retail signal. Floor-clamp protects either way. |
| **D8** | **Services catalogue scope at launch** | Model 2–3 flagship services (Deep Dive, Build, Retainer); or a fuller service catalogue. | **Launch with the 3–4 flagship services** modelled in the Services chapter (Deep Dive, AI/Automation Build, Foundation Retainer, + a POA programme). Proves the unified model end-to-end without over-investing in service copy before demand. |

---

## 8. Coherence Review

Resolving conflicts, overlaps, and gaps **between** the chapters. Decisive rulings; where a chapter is authoritative, that is stated.

### 8.1 Resolved naming & terminology

- **Offerings vs. products/services.** Canonical term is **offering** (`offerings` table, `type ∈ {product, service}`). "Product" and "service" are *values of `type`*, not separate entities. The API resource is `Offering`; the Puck block is **`OfferingGrid`** (the homepage's existing `ProductGrid` block generalises to it with an optional `type` prop — the CMS UX and Services chapters both say this; confirmed consistent). The storefront `type` filter labels these `Software · Services · All` for end-users, which is presentation only.
- **Variant vs. edition.** One concept, table `offering_variants`. "Edition" is the customer-facing word on a PDP; "variant" is the schema/engineering word. No third term is introduced.
- **Quote vs. inquiry vs. enquiry.** One concept: a `quotes` row (with `quote_items`). The handoff's `inquiries` intent, the trial form, the "talk to an expert" lead, and "book a call" all resolve to a `quotes` row distinguished by `source` and `metadata.type` — **not** separate tables. The CMS Quotes Inbox, the Pricing chapter's capture step, and the Services CTAs all agree on this.
- **`from_price` (camel, feed) vs. `from_price_minor` (snake, schema).** The feed field `fromPrice` (whole GBP units) imports into `offerings.from_price_minor` (BIGINT pence) — the importer multiplies by 100. The cached value is **derived**, read-only on export, recomputed on variant change. The Bulk chapter's importer rule and the Schema's "cached lowest active price" are the same mechanism.

### 8.2 `scope_ids[]` vs. join table — settled

Multiple chapters reference how a pricing rule targets vendors/categories/offerings/tiers. **Authoritative answer (Schema + Pricing chapters, consistent): a join table, `pricing_rule_targets`, never a `scope_ids[]` array.** Real FKs with `ON DELETE CASCADE`, `chk_exactly_one_target` per row, indexed both directions. `scope_type='all'` carries **no** target rows. The Sprint-1 rubric (§4.3 item 2) checks for this explicitly. Any chapter prose implying an array is superseded by this ruling.

### 8.3 Where price is computed — single source, three call sites

Reconciling the Pricing, API, CMS, and Services chapters: **price is computed by one pure server-side function, `effectivePrice(...)`**, called at exactly three sites — catalogue card, PDP, and quote capture — and **never on the client**. The card uses the cached `from_price_minor` for sort/"from" then runs the function on the representative variant; the PDP runs it per variant; quote capture runs it **and snapshots** the result onto `quote_items` (`list_price_minor`, `captured_price_minor`, `applied_rule_id`), making the quote immutable. The API chapter's price-preview endpoint and the CMS "preview as tier" both call the *same* function with a substituted `previewTierId` — a read-only, server-validated, audited projection, never a faked session. There is no second pricing implementation anywhere.

### 8.4 Two ways to change a price — never conflated

A persistent source of confusion across Pricing, Bulk, and CMS chapters, resolved uniformly:

- **A pricing rule** never mutates `base_price_minor`. It is a read-time overlay (`pricing_rules` + `pricing_rule_targets`), reversible by toggling `active`. Use for promos, tiers, scheduled sales. Authored in the Pricing-Rules UI (structured config), not a spreadsheet.
- **A one-off bulk reprice** rewrites `base_price_minor` via the import pipeline (dry-run → diff → approve → `rollback_token`), never a blind UPDATE. Use for vendor price-book changes, corrections, re-base.
- **`list_discount_pct`** (the feed's `discountPct`, 0 today) is a **third, separate** concept: the manufacturer's baked-in list discount on a variant. It is edited only on the full Variants sheet and **never** stacks with a Greatstone rule into one number by accident. All three chapters now state this identically; the CMS UI enforces the distinction with the rule of thumb *"Changing what something costs → sheet. Offering a discount on it → rule."*

### 8.5 One mutation pipeline — bulk and AI converge

Reconciling Bulk & AI Ops with CMS and API: **there is exactly one bulk-write path** (`import_jobs`/`import_job_rows`), and **AI is not a second one**. Every AI operation (`ai_actions`) materialises on approval as an `import_job` and inherits its validation, diff, transactional apply, `rollback_token`, and audit. `ai_actions.import_job_id` links the two. `chk_ai_approved` forbids `applied` without `approved_by`. The CMS AI console, the API AI endpoints, and the Bulk chapter all describe this single convergence.

### 8.6 Draft→publish modelled two ways — intentional, not a conflict

The Schema, CMS, and Capability chapters model publishing differently for catalogue vs. content, and this is deliberate (recorded so no reviewer flags it as inconsistency): **catalogue entities** use `status` + `published_at` with public reads scoped to `status='published'` and history from `audit_log`; **content pages** hold `draft_data`/`published_data` side by side with full snapshots in `page_versions` and a `page_status_history` trail. The split matches volatility — high-volume catalogue rows shouldn't carry per-row snapshot tables; designer-edited pages need point-in-time restore. The *operator-facing ritual* (status pill, publish gate, attention math) is identical across both, which is what matters for learnability.

### 8.7 Identity & auth — one ruling across chapters

`users` (internal Greatstone staff/operators) and `customer_users` (buyer-side contacts) are **deliberately separate tables**, governed independently. **No password hash lives anywhere in the schema** — auth is IdP-delegated via `auth_subject`. Tier resolution for pricing is server-side, rooted in the session, never a query param or client flag. The "preview as tier" feature substitutes a server-validated `previewTierId` into the pure function and never mints a session. Schema, Pricing, CMS, and API chapters are consistent; this is the single ruling.

### 8.8 SKU is not unique — composite variant key everywhere

Confirmed against real data (SKU `ASPOSE-230` repeats across all five `aspose-tex-for-c++` editions): the variant upsert/uniqueness key is the composite **`(offering_id, sku, license_type, billing_period)`** (`uq_variant_edition`), never `sku` alone. The Schema's constraint, the Bulk importer's upsert key, and the CMS variant editor's identity check all use this exact tuple. A reviewer must reject any implementation keyed on bare SKU.

### 8.9 POA / null-price — one behaviour, enforced structurally

The 13 null-price products and any POA variant behave identically everywhere: `base_price_minor IS NULL` ⇒ `currency IS NULL` (the both-or-neither CHECK) ⇒ structurally **excluded from the pricing engine** (no base to clamp) ⇒ rendered "Contact for licence" with no strike and no badge ⇒ skipped by `pct_change` mass reprices. Pricing, Bulk, CMS, and Services chapters all state this; it is invariant #3 in the Pricing chapter and is non-negotiable.

### 8.10 Checkout/orders — modelled, never wired

`orders`/`order_items` exist in the schema and the API references quote-conversion, but **every chapter agrees no payment is faked and checkout is out of scope**. The columns exist so the contract is complete and a quote *can* be converted if real purchasing is later enabled (Decision D3). No Stripe call, no card form, no faked confirmation appears in any chapter. A reviewer should confirm no chapter's implementation wires a payment.

### 8.11 Gaps surfaced and assigned

Items not fully owned by any single chapter, now assigned so nothing falls through:

1. **Search infrastructure choice.** The Schema provides `search_tsv` + `pg_trgm` (good for launch); the Capability chapter benchmarks Algolia/Typesense-class search. **Ruling:** ship on Postgres FTS + trigram in Phase 1 (sufficient for 159–200 offerings); treat an external search index as a Phase 5+ enhancement, not a launch dependency. Owned by Architecture.
2. **Webhooks / external integrations (Pipedrive CRM routing).** The API chapter defines signed/retried webhooks (`quote.created`, `import.completed`); memory notes a Pipedrive gateway for quote/inquiry routing. **Ruling:** quote → CRM routing rides the `quote.created` webhook; Pipedrive is a consumer, not a schema concern. Owned by API + Transition.
3. **Currency.** Catalogue is 100% GBP today; schema and engine are multi-currency-safe (currency travels with every price; cross-currency fixed rules are non-candidates). **Ruling:** GBP-only at launch, no multi-currency UI; the safety is latent capability, not a Phase-1 feature.
4. **`order_confirmation`/email + invoice templates.** Out of scope with checkout (D3). Quote acknowledgement email is in scope (Quotes inbox "Reply"); a templated VAT invoice is deferred with purchasing.
5. **Category hierarchy.** `categories.parent_id` exists (all `NULL` in the feed today). Rules cascade to child categories via ancestor-walk (Pricing chapter); the CMS Categories manager is hierarchy-aware. **Ruling:** model depth now, populate it only as real sub-categories emerge — no forced taxonomy restructuring at launch.

**Net:** no unresolved conflict remains between chapters. Every overlap (price computation, the two repricing paths, the single mutation pipeline, the dual publish models, identity, POA, the composite variant key) has one ruling that all chapters obey, and every gap has an owner and a phase.

---

*Chapters follow. This front-matter governs cross-cutting decisions, naming, and sequencing; each chapter is authoritative within its own domain as noted above.*

---

# Part 1 — Capability audit: greatstonesoftware.co.uk → our target

---

# CHAPTER — CAPABILITY AUDIT: greatstonesoftware.co.uk as it exists today

*Grounded in live HTTP inspection of `www.greatstonesoftware.co.uk` on 2026-06-17 (all-products listing, three product detail pages — `ironsoftware/ironpdf`, `aspose/aspose-total-for-net`, `apryse/apryse-server-sdk` — plus `/basket`, `/checkout`, `/login`, `/search`, `/sitemap.xml`, `/robots.txt`, and response headers), cross-referenced with `CATALOG-HANDOFF.md` and the prior CMS analysis in `/tmp/cms-*.md`.*

The live site is a **Laravel reseller storefront** (encrypted `greatstone_session` + `XSRF-TOKEN` cookies, CSRF `_token` fields, `/form/submit`, Cloudflare in front). It is a *real transactional e-commerce system* — not a brochure. That is the single most important framing fact for everything that follows: **we are replacing a working cart-and-checkout, not a static catalogue.** Where we go "browse-and-enquire" we are making a deliberate *business-model* change, not merely matching a lesser system. The audit must be honest about both directions: the live site does several things our prototype does not (a real basket, real checkout via Stripe, real customer accounts with social login, a 44-post blog), and it does many things badly that we will beat.

---

## 1. What the live system actually does today

### 1.1 Catalogue: browse, structure, search

| Capability | Live behaviour (verified) | Evidence |
|---|---|---|
| **Catalogue size** | ~186 product detail pages enumerated; **289 URLs** in `sitemap.xml`. Our mirror captured **159** (the rest 404 on the live origin). | `sitemap.xml` (289 `<loc>`); `CATALOG-HANDOFF.md` coverage note |
| **Vendor structure** | **10 vendors**, each a top-level URL segment: `activepdf, apryse, aspose, conholdate, devexpress, groupdocs, investintech, iris, ironsoftware, pdflib`. Sitemap distribution: aspose 108, groupdocs 33, ironsoftware 11, devexpress 10, apryse 9, iris/conholdate 7, activepdf 6, pdflib 5, investintech 2. | per-vendor `<loc>` counts |
| **Category structure** | **None on the storefront.** There is no functional category axis (PDF / OCR / Spreadsheets) exposed anywhere in browse. Products are grouped **only by vendor**. The 32 functional categories in our feed are *our enrichment*, not the live site's. | `/all-products` markup |
| **Listing page (`/all-products`)** | A single long page. Products are grouped under **vendor `<h3>` headings, A–Z by brand** (`<h3 class="d-inline text-white m-0">ActivePDF</h3>` … `PDFlib`). **No facets, no filters, no sort controls, no price filter, no platform filter** — zero filter/facet UI in the markup. | grepped for filter/facet/sort/price-range → **no matches** |
| **Search** | A **select2 product-name dropdown** (`product-title-select2`) plus a `<form action="/search">`. `/search?q=pdf` returns a server-rendered page that falls back to **"No results"** — i.e. near-exact product-name matching, **not** full-text or faceted search. No autosuggest beyond the curated dropdown list, no search across descriptions/specs/vendors. | `/search` page; select2 control |
| **Mobile / responsive** | Bootstrap grid (`col-md-*`, `col-lg-*`), `<meta name="viewport">` present. Responsive in the basic Bootstrap sense; "pushy" off-canvas mobile menu. Not a modern app-shell experience. | grid classes; viewport meta |

### 1.2 Product detail page (`/{vendor}/{slug}`)

A real, content-rich template. Sections (from IronPDF): **`<h1>` product name → Overview → Features → Media → "Start your free trial" → "Talk to an Expert"**.

| Capability | Live behaviour (verified) |
|---|---|
| **Editions / variants** | **Real, fully-priced editions table.** IronPDF exposes **10 editions** spanning **£509.00 – £4,753.00**. Licence dimensions are real and multi-axis: **Lite / Plus / Professional / Unlimited**, **Perpetual** vs **Subscription**, **+1 Year / +5 Year** support terms, and licence-scope flags **Developer / Location / Project**, plus **Royalty-free / OEM / SaaS** add-ons. |
| **Real GBP prices** | Yes — published, per-edition, real money (`£509.00`, `£780.00`, `£1,019.00`, `£1,561.00`, `£2,037.00`, `£2,580.00`, `£3,395.00`, `£4,753.00` …). |
| **Add to basket** | Each edition is its **own `<form method="post" action="/basket/add/{id}">`** (IronPDF = id `236`) with a **quantity `<input type="number" min="1" max="10">`**. This is a genuine cart-add, server-side, per-edition. |
| **Lead-capture (parallel to cart)** | **"Start your free trial"** posts to `/form/submit` (`trial_form`: first/last name, email, telephone, company, newsletter opt-in, hidden `product_name`). **"Talk to an Expert"** lead path. So the live site already runs *both* a transactional cart **and** a quote/trial lead channel side by side. |
| **Content** | Overview prose, Features list, **Media** (screenshots/video). Rich enough that our crawler reconstructed `description`, `specs[{label,value}]`, `gallery[]` from it. |

### 1.3 Basket → checkout → order

| Capability | Live behaviour (verified) |
|---|---|
| **Basket** | `/basket` (200) — real server-side basket, line items + quantities, `/basket/add/{id}`. |
| **Checkout** | `/checkout` (200) and `/checkout-login` exist. Checkout markup references **Stripe** and **VAT** (`vat` ×4, `stripe` ×1, "card" heavily). So: **real card payment via Stripe, VAT-aware.** |
| **Order completion** | `/order-confirmation` and `/order-confirmation/basket` in sitemap → a completed-order flow exists. |
| **This is a true B2B software-licence webshop**, not a catalogue. A buyer can configure an edition, set quantity, pay by card, and receive an order confirmation **without talking to anyone.** |

### 1.4 Customer accounts / auth

| Capability | Live behaviour (verified) |
|---|---|
| **Login** | `/login` (200). |
| **Social SSO** | **Google, LinkedIn, Facebook** social login (link counts: linkedin ×8, google ×3, facebook ×2) via `/callback` (OAuth). |
| **Password reset** | `/password/reset` (in sitemap + login page). |
| **Registration** | "Create an Account" CTA present; bare `/register` returns 404 (registration likely gated behind checkout-login or a different route). |
| **Session** | Laravel encrypted session cookie (`greatstone_session`), 2-hour `Max-Age`. |

### 1.5 Pricing / discount administration

- **No visible discount mechanics on the storefront.** Prices are flat per-edition. No sale flags, no struck-through prices, no "X% off", no customer-tier pricing surfaced to anonymous visitors.
- The **per-customer/per-tier pricing is almost certainly an admin/back-office capability** of the underlying reseller CMS (resellers of Aspose/Apryse/etc. negotiate tiered margins), but **none of it is exposed or inspectable from the public site** — so from an outside-in audit it is, at best, opaque and manual.
- **Net:** whatever pricing flexibility exists today lives in a back-office we cannot see and cannot evaluate; the public evidence is *flat, manually-set, per-edition GBP prices*.

### 1.6 Content / CMS ("Syrup")

- **Blog:** a real content section — **44 blog posts** in the sitemap (`/blog/{slug}`, e.g. `what-is-devexpress-and-how-does-it-work`, `digital-transformation-tools-software-developers`).
- **Marketing pages:** `who-we-work-with`, `why-choose-us`, `assessment-framework` (×4 URLs) — curated content pages.
- **"Syrup"** is the reseller CMS/platform the site runs on (Laravel-based). It is a **vendor-feed-driven reseller catalogue engine** (it ingests Aspose/Apryse/etc. product + edition + price feeds) wrapped around a basic blog/pages CMS. The site emits no public "powered by Syrup" generator tag; the fingerprint is the Laravel stack + the reseller-catalogue shape.
- **No headless API.** `/api` and `/api/products` both **404**. Content and catalogue are **server-rendered HTML only** — there is no JSON content API, no GraphQL, no preview API, nothing a separate frontend or app could consume. This is a fully coupled monolith.

---

## 2. Where it is outdated / weak (honest assessment)

| # | Weakness | Why it matters |
|---|---|---|
| **W1** | **Discovery is broken.** No filters, no facets, no sort, no functional categories. To find "an OCR library for Java" you must already know the product name (select2) or scroll an A–Z-by-vendor wall of ~186 items. | A reseller's entire value-add is *helping a buyer find the right tool across vendors*. Vendor-only grouping forces the buyer to already know the brand — the opposite of cross-vendor discovery. This is the single biggest UX failure. |
| **W2** | **Search is name-match, not search.** `/search` is a curated dropdown + exact-ish match with a "No results" cliff. No full-text over descriptions/specs, no typo tolerance, no synonyms, no faceted search. | Buyers search by *capability* ("merge PDF", "barcode", "watermark"), not exact product titles. The live search can't serve that. |
| **W3** | **No bulk catalogue management — and no exposed admin at all.** 186 products × ~10 editions each = thousands of priced rows, all maintained through the opaque Syrup back-office. No evidence of CSV/Excel round-trip, no mass-price tooling, no import/export, no dry-run/diff/rollback. | A 20% vendor-wide price change or a feed refresh is, at best, a manual or vendor-feed-locked operation. No spreadsheet round-trip = no fast, auditable bulk editing. (Mirrors the prototype's gap, but the live system's is hidden behind a closed CMS we can't even improve.) |
| **W4** | **Pricing is flat and rigid.** No scheduled promotions, no scoped rules (vendor / category / tier), no campaign pricing, no struck-through "was/now". Tiered/negotiated pricing is back-office and manual. | A modern reseller runs time-boxed campaigns and tier-based pricing as *configuration*, not as manual per-row edits. |
| **W5** | **Mobile/UI is dated.** Bootstrap grid, off-canvas "pushy" menu, long-scroll listing. Functional but not a modern, fast, app-shell storefront; no instant filtering, no skeleton loading, no progressive enhancement. | First impressions and conversion on enterprise dev tooling increasingly happen on mobile/tablet. |
| **W6** | **Performance / coupling.** Fully server-rendered Laravel monolith; product pages 84–122 KB of HTML each; Cloudflare `cf-cache-status: DYNAMIC` (not edge-cached). Every browse interaction is a full page load. | No SPA/instant navigation, no edge-cached catalogue, no client-side faceting. Slower than a headless/ISR storefront. |
| **W7** | **Content authoring is basic.** A blog + a handful of marketing pages on a closed CMS. No structured content modelling, no reusable component blocks, no in-context/visual editing, no draft→preview→publish workflow visible, no versioning. | Marketing can publish a blog post but cannot compose rich, component-based industry/landing pages — which is exactly what Greatstone's positioning needs. |
| **W8** | **No headless / API surface.** `/api*` → 404. Content and catalogue cannot be consumed by another frontend, a mobile app, an AI agent, partner integrations, or our own React studio. Total lock-in to the Laravel render layer. | A 2026 platform must be API-first so the catalogue/content can power many surfaces (web, sales tooling, AI, partner feeds). |
| **W9** | **Commerce model mismatch with the business.** The live site sells enterprise dev licences via a self-serve card checkout *and* runs trial/expert lead forms in parallel — two half-committed channels. Enterprise licence buyers almost always want a **quote/PO/VAT-invoice**, not a card swipe. | The cart-and-Stripe path over-commits the transaction for high-value B2B licences; the parallel lead forms admit the real motion is *enquire*. The model is incoherent. (Our deliberate move: unify on quote-led commerce — see matrix.) |
| **W10** | **No AI-assisted operations** anywhere — no NL bulk edits, no spreadsheet→schema mapping, no description/SEO generation, no dedupe. All catalogue and content ops are manual. | The differentiator we're building. The incumbent has none of it. |
| **W11** | **No unified offerings model.** The live system sells *reseller products only*. Greatstone services (the consultancy/method) are separate marketing pages with their own lead forms — not part of one purchasable/quotable catalogue with shared pricing/discount/quote infra. | Our target unifies products + services into one offerings system; the incumbent has two disconnected worlds. |
| **W12** | **Governance/ops invisible.** No exposed roles/permissions model, audit log, soft-delete, versioning, optimistic concurrency, draft→publish, or tenant isolation that we can verify. Money is rendered as `£X.XX` strings, not auditable integer minor units + currency code. | A multi-tenant org with admin-only sensitive ops and full auditability is a hard requirement we cannot confirm the incumbent meets — and the prototype's string-price model is the same defect. |

---

## 3. Benchmark — best-in-class B2B/reseller commerce + headless CMS

The bar we should match or beat, drawn from modern B2B commerce (BigCommerce B2B Edition, Shopify Plus B2B, commercetools, Spryker, Adobe Commerce/Magento B2B) and headless CMS (Storyblok, Sanity, Contentful, Builder.io, Puck):

- **Faceted, full-text catalogue search** (Algolia/Typesense-class): instant, typo-tolerant, synonym-aware, filterable by vendor **and** functional category **and** platform **and** licence type **and** price band, with relevance ranking and "search by capability."
- **Dual-axis taxonomy:** browse by vendor **and** by function (PDF, OCR, spreadsheets, reporting, document-viewing…) with cross-vendor comparison.
- **Configurable variant/edition selector** on the PDP (edition × term × scope × add-ons) with live price, comparison table, and "what's the difference" guidance.
- **Quote-led B2B commerce:** request-a-quote, multi-product quote basket, PO checkout, VAT invoicing, negotiated/tiered pricing per customer company, approval workflows. (Self-serve card optional, not the only path.)
- **Rules-based pricing engine:** scoped (all / vendor / category / offering / customer-tier), percentage **or** fixed, scheduled (start/end), single-winner (no stacking), floor-clamped, never negative, never discounts POA/null prices — as configuration, with preview.
- **Bulk operations:** Excel/CSV round-trip (export → edit → re-import as upsert keyed on stable slug/sku), mass price changes, with **dry-run + diff + validation + rollback + idempotency + audit**.
- **AI-assisted ops:** NL bulk edits, messy-spreadsheet→schema mapping, description/SEO generation, dedupe — always *propose → human preview → admin approve*, never auto-applying destructive change, fully audited.
- **Headless, API-first:** JSON content + catalogue API, preview API, webhooks — so one backend powers web, mobile, AI agents, partner feeds, and our own studio.
- **Component/visual CMS:** structured content, reusable blocks, in-context editing, draft→preview→publish, versioning/rollback, scheduling, multi-tenant roles.
- **Performance:** edge-cached catalogue, instant client-side faceting, SPA-grade navigation, image optimisation.
- **Engineering hygiene:** money as integer minor units + currency code, slugs, soft-delete, created/updated/by, FKs + indexes, optimistic concurrency/versioning, tenant isolation/RLS, validation, pagination/filter/sort, accessibility, audit log, observability, tests.

---

## 4. CAPABILITY MATRIX

`P0` = launch-critical (must match/beat to replace the live site credibly) · `P1` = important, fast-follow · `P2` = differentiator/later.

| # | Capability | Live site today (verified) | Our target (better) | Priority |
|---|---|---|---|---|
| **Catalogue & discovery** |||||
| 1 | Catalogue size | ~186 products, **10 vendors**, vendor-only grouping | 159+ products, **10 vendors × 32 functional categories**, both axes first-class; feed-refreshable to ~200 | **P0** |
| 2 | Browse / facets | **None** — A–Z-by-vendor long scroll, zero filters | Faceted browse: vendor + category + platform + licence type + price band; instant client-side filtering | **P0** |
| 3 | Search | select2 **name-match**, "No results" cliff | Full-text, typo-tolerant, capability-based, faceted, ranked (Typesense/Algolia-class) | **P0** |
| 4 | Taxonomy | Vendor only | **Dual-axis** (vendor **and** functional category) + cross-vendor compare | **P0** |
| 5 | Mobile / UI | Bootstrap grid, "pushy" menu, dated | Modern app-shell, instant nav, skeletons, accessible (WCAG AA) | **P1** |
| 6 | Performance | SSR monolith, `cf-cache DYNAMIC`, 84–122 KB/page, full reloads | Edge-cached catalogue, client-side faceting, SPA nav, image optimisation | **P1** |
| **Product detail & variants** |||||
| 7 | Editions/variants | **Real**, e.g. IronPDF **10 editions £509–£4,753**, multi-axis licence dims | Same fidelity + structured variant model (sku, name, licenseType, platform, price, currency, minOrderQty, discountPct) + comparison table + difference guidance | **P0** |
| 8 | Real GBP prices | **Yes**, per-edition published | Yes — stored as **integer minor units + currency code**, displayed quote-framed | **P0** |
| 9 | Rich content | Overview / Features / Media / gallery | Same + structured `specs[{label,value}]`, platforms/tags, SEO fields, component-composed PDPs | **P0** |
| 10 | Specs/structured data | Prose + feature list | Structured specs, filterable + comparable across products; JSON-LD | **P1** |
| **Commerce model** |||||
| 11 | Basket | **Real server basket** `/basket/add/{id}`, qty 1–10 | **Multi-product quote basket** (re-framed: "Add to quote", no misleading order total) | **P0** |
| 12 | Checkout / payment | **Real Stripe card checkout, VAT-aware**, `/order-confirmation` | **Quote-led**: request-a-quote, PO, VAT invoice; self-serve card optional, not the only path | **P0** |
| 13 | Lead / trial capture | `/form/submit` trial + "Talk to Expert" (parallel to cart) | **Unified** into one offerings + inquiry model: quote / trial / contact as typed inquiries with product+variant context, CRM-routed (Pipedrive) | **P0** |
| **Accounts & auth** |||||
| 14 | Customer accounts | `/login`, password reset, registration | Multi-tenant accounts with **company tier**, order/quote history, roles | **P0** |
| 15 | Social SSO | **Google + LinkedIn + Facebook** via `/callback` | SSO retained (Google/Microsoft/LinkedIn) — **never fake auth**; real OAuth + tenant isolation/RLS | **P1** |
| **Pricing & discounts** |||||
| 16 | Discount mechanics | **None public** — flat per-edition; tiers manual/back-office | **Rules engine**: scope all/vendor/category/offering/tier, %/fixed, scheduled, **single-winner, floor-clamped, never negative, never discounts POA/null** | **P0** |
| 17 | Tiered / negotiated pricing | Opaque, manual back-office | Customer-company-tier pricing as **config** (studio preview, backend-authoritative); no fake per-tier client-side | **P1** |
| 18 | Campaigns / scheduling | None | Scheduled start/end promotions, quote-framed display ("offer price"), configurable badge tone | **P1** |
| **Bulk & data ops** |||||
| 19 | Bulk catalogue mgmt | **None exposed**; feed/back-office locked | **Excel/CSV round-trip** export→edit→import-as-upsert (keyed on slug/sku) | **P0** |
| 20 | Mass price changes | Manual / feed-locked | Spreadsheet mass-edit + rule-based mass change | **P0** |
| 21 | Safety rails | None visible | **Dry-run + diff + validation + rollback + idempotent upsert + audit** | **P0** |
| **AI-assisted ops** |||||
| 22 | NL bulk edits | **None** | Claude-driven NL bulk edits → propose → preview → admin approve, audited | **P2** |
| 23 | Spreadsheet→schema mapping | **None** | AI maps messy vendor spreadsheets to our schema, human-confirmed | **P2** |
| 24 | Description / SEO generation | Manual | AI-generated descriptions/SEO with human review | **P2** |
| 25 | Dedupe / cleanup | Manual | AI dedupe/cleanup, never auto-destructive | **P2** |
| **Content / CMS** |||||
| 26 | Blog / articles | **44 posts** live | Match + structured content model, component blocks | **P1** |
| 27 | Marketing pages | `why-choose-us`, `who-we-work-with`, `assessment-framework` | **Component/visual CMS (Puck)**: reusable blocks, `ProductGrid` block surfacing catalogue slices on any page | **P0** |
| 28 | Authoring workflow | Basic, no visible draft/preview/version | **Draft→preview→publish, versioning/rollback, scheduling, in-context editing** | **P1** |
| 29 | Unified offerings | **Products only**; services separate | **One offerings model**: reseller products **and** Greatstone services, both purchasable/quotable, shared pricing/discount/quote infra | **P0** |
| **Platform / engineering** |||||
| 30 | Headless API | **`/api` → 404, none** | **API-first**: JSON catalogue + content API, preview API, webhooks; one backend → web/mobile/AI/partners/studio | **P0** |
| 31 | Backend-agnostic contract | N/A (closed Laravel/"Syrup") | Contract works on agency **Laravel 12 + Inertia** *or* interim **Postgres/Supabase**; also the rubric to grade Sprint-1 code | **P0** |
| 32 | Money model | `£X.XX` **strings** | **Integer minor units + currency code** everywhere | **P0** |
| 33 | Multi-tenant + roles | Not verifiable | **Greatstone International org**, roles/permissions, **admin-only sensitive ops**, RLS/tenant isolation | **P0** |
| 34 | Audit / soft-delete / versioning | Not verifiable | Audit log, soft-delete, created/updated/by, optimistic concurrency/versioning | **P1** |
| 35 | Observability / testing | Unknown | Observability + automated tests as standard | **P1** |

---

## 5. Bottom line for the chapter

The incumbent is a **competent but closed, dated reseller webshop**: it gets the *commerce primitives right* (real editions, real GBP prices per edition, a real basket with quantities, a real Stripe/VAT checkout, social-login accounts, a 44-post blog) but gets the *modern reseller value-add wrong* (no discovery — vendor-only grouping, no facets, name-match search; no exposed bulk tooling; flat manual pricing; no headless API; no AI; a card-checkout model that over-commits enterprise licence sales while quietly running parallel lead forms).

Two honest caveats we must carry forward: (1) **we are replacing working transactional features** (cart, checkout, accounts, blog) — our "browse-and-enquire / quote-led" stance is a deliberate business-model improvement, and we must consciously preserve account/auth/content parity so the replacement is a net gain, not a regression; and (2) the incumbent's pricing-tier and bulk capabilities live in a **back-office we cannot inspect** — we should assume some manual capability exists there and make sure our **rules engine + spreadsheet round-trip + AI ops** decisively out-class whatever it is, rather than assume it is empty.

The capability matrix above is the spec for "match, then beat," and doubles as the rubric for evaluating the agency's Sprint-1 Laravel build.

---

**Files read/created for this audit (absolute):** sources — `/Users/johnprempeh/Desktop/Code/greatstone-homepage/CATALOG-HANDOFF.md`, `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json`, `/tmp/cms-design.md`; live captures saved at `/tmp/gs-all-products.html`, `/tmp/gs-ironsoftware_ironpdf.html`, `/tmp/gs-aspose_aspose-total-for-net.html`, `/tmp/gs-apryse_apryse-server-sdk.html`, `/tmp/gs-login.html`, `/tmp/gs-checkout.html`, `/tmp/gs-search.html`, `/tmp/gs-sitemap.xml`, `/tmp/gs-robots.txt`.

---

# Part 2 — Data model

The full DDL lives in **`docs/schema.sql`** (28 tables). Design narrative and decisions:

I have everything. The data is fully grounded: 10 vendors (slug ids like `aspose`), 32 categories (ids like `cat-annotation`, all `parentId: null` but the field exists for hierarchy), 159 products with `vendorId`+`categoryId`, 819 variants with real GBP prices (min £63, max £12,534,195 — note that confirms integer minor-unit storage matters: that max is `12534195` pence = ~£125k, or a real outlier I'll handle with bigint), `discountPct: 0`, `minOrderQty: 1`, currency `GBP`, `status: published`, 12 featured, 13 null-price, specs as `[{label,value}]`, seo `{metaTitle, metaDescription, socialImage}`.

Now I'll write the complete Postgres DDL plus narrative. This is the schema chapter — the source of truth other chapters reference.



## Narrative — key modelling decisions and trade-offs

**Unified offerings (one table, not products + services side-by-side).** `offerings` carries `type ∈ {product, service}` and is the single hub every commercial table (variants, specs, media, quote_items, pricing targets) points at. Products require a `vendor_id`; services forbid it — enforced by `chk_product_has_vendor` / `chk_service_no_vendor`, so the unified model can't drift into invalid states. `fulfilment_mode` (`license|subscription|engagement|enquiry`) is the behavioural switch that replaces a type split: a reseller licence and a Greatstone consulting engagement live in the same table and share the same pricing, discount, and quote machinery. Type-specific fields that don't deserve columns live in `offerings.attributes` JSONB, keeping the shared table narrow rather than sparse-wide. Trade-off: a few CHECK constraints and a JSONB escape hatch in exchange for one set of pricing/quote/import code paths instead of two — the right call given the brief's explicit "both are one system" requirement.

**`scope_ids[]` vs a join table — I chose the join table (`pricing_rule_targets`), and it's the right call.** An array of mixed-meaning IDs on `pricing_rules` (a vendor id here, a category id there) cannot be foreign-keyed, so a deleted vendor leaves a dangling string in every rule, and "which rules touch Aspose?" becomes an array-scan with no referential guarantee. The join table gives real FKs with `ON DELETE CASCADE` (delete a vendor → its rule targets vanish cleanly), a `chk_exactly_one_target` constraint that makes each row unambiguous, and ordinary indexed lookups in both directions ("rules for this vendor" / "targets of this rule"). `scope_type='all'` needs no target rows (it matches every offering implicitly), so the table only holds the finite, scoped cases. The cost is one extra table and a join at price-compute time; the payoff is referential integrity on the most safety-critical subsystem in the platform.

**Money is always BIGINT minor units + a 3-char currency code, stored as a both-or-neither pair.** Every price column is integer pence (`base_price_minor`, `from_price_minor`, `captured_price_minor`, line/order totals) — no floats, no strings, killing the prototype's `'From £870'` free-text disease at the root. I used `BIGINT` not `INTEGER` deliberately: the live feed already contains a variant priced at 12,534,195 (in minor units that's far past int4's ~£21m ceiling for some currencies, and site/OEM enterprise licences trend high), so int4 would be a latent overflow bug. Every price is paired with a currency via `chk_*_price_pair` CHECKs that force `(price IS NULL) = (currency IS NULL)` — so a number can never exist without its currency, and `NULL` cleanly means **POA / "Contact for licence"** (13 such products in the feed). Pricing rules respect this: a fixed reduction carries its own currency; a null-priced offering is structurally un-discountable because there's no base to clamp.

**Pricing-rule safety is encoded in the schema, not just the app.** `floor_fraction` (final ≥ base × fraction) plus the non-negative CHECKs on every price column make a runaway `−£100 on an £80 product` impossible to persist as a negative. `active` defaults FALSE so a new rule never goes live on insert. `priority` (lower wins) plus the single-winner resolution in the compute layer guarantee no stacking/compounding. `chk_rule_schedule` rejects an end-before-start window, and the `audience`/`audience_tier_id` pairing CHECK keeps per-tier rules well-formed. The schema makes the dangerous states unrepresentable rather than relying on UI discipline.

**Versioning is split by entity volatility — and that's intentional.** Catalogue rows (offerings, variants, vendors, pricing rules, pages) carry `row_version` for optimistic concurrency: two editors saving the same offering collide on a stale `row_version` instead of silently last-write-wins (the trigger bumps it; a Laravel/Supabase `UPDATE … WHERE row_version = ?` is the lock). Page *content* additionally gets full snapshots in `page_versions` (the Puck history requirement) because designers need point-in-time restore, whereas catalogue rows get their before/after history from `audit_log` rather than a heavy per-row snapshot table. Draft→publish is modelled two ways to match the two domains: pages hold `draft_data`/`published_data` side by side (public reads `published_data`); catalogue entities use `status` + `published_at` with public queries scoped to `status='published'` — which is exactly the migration target the prior analysis prescribed (per-row published flag, not the prototype's whole-array snapshot).

**Soft-delete everywhere mutable, with partial indexes that ignore the dead.** `deleted_at` on every editable domain row preserves referential history (a deleted offering still resolves on old quotes/orders/audit entries) and makes deletes reversible. Crucially, every "live" index is `WHERE deleted_at IS NULL`, so soft-deleted rows cost nothing at query time and unique constraints behave for the active set. Child snapshots (quote_items, order_items, audit before/after) denormalise name/price so a quote stays truthful even after its offering is deleted or repriced — the historical record is immutable by construction.

**RLS / tenancy: one tenant column, one policy pattern, defence-in-depth.** Every business table carries `org_id → organisations(id)` and gets the identical RLS policy keyed off `current_setting('app.current_org')` (set from the JWT on Supabase, or DB middleware on Laravel). The app already filters by org, but RLS is the backstop: a query that forgets the `WHERE org_id` returns zero cross-tenant rows instead of leaking. The unique constraints are all `(org_id, slug|sku|reference)` so two orgs can hold the same slug, and the platform is genuinely multi-tenant from day one even though Greatstone International is the only tenant today. Internal staff (`users`) and customer-side people (`customer_users`) are deliberately separate tables so staff identity/roles are governed independently of buyer contacts — and no password hashes live in this schema at all; authentication is delegated to the IdP via `auth_subject`, never faked.

**Import & AI are first-class, auditable, and reversible.** `import_jobs` + `import_job_rows` capture the full Excel/CSV round-trip: `dry_run` computes a `diff_summary` and per-row `before`/`after` with no mutation; apply is idempotent via `source_checksum` and upsert keys (`offerings` on `(org_id, slug)`, variants on `(offering_id, sku, license_type, billing_period)` since SKUs repeat across editions in the feed); and a `rollback_token` ties every applied change in `audit_log` together for one-click revert. `ai_actions` enforces the propose→preview→approve→apply discipline structurally: `chk_ai_approved` forbids reaching `status='applied'` without an `approved_by`, and `is_destructive` flags the changes that must not auto-apply — so Claude can draft mass edits and SEO copy, but a human admin is always the gate before anything lands, with the proposed diff retained for audit.

**Files referenced (all absolute):** real data at `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json` (159 products, 10 vendors, 32 categories, 819 variants, GBP, `discountPct:0`, `minOrderQty:1`, 12 featured, 13 null-price, specs `[{label,value}]`, seo `{metaTitle,metaDescription,socialImage}`) and `/Users/johnprempeh/Desktop/Code/greatstone-homepage/CATALOG-HANDOFF.md`; prior current-state analysis at `/tmp/cms-map-store-data.md`, `/tmp/cms-map-commerce-pricing.md`, `/tmp/cms-map-products-cms.md`, `/tmp/cms-assess-mass-discount.md`, `/tmp/cms-assess-product-mgmt.md`, `/tmp/cms-design.md`.

---

# Part 3 — Pricing & discount engine

All grounded. Key facts confirmed: 819 variants all priced (the 13 null-price are at the *product* `fromPrice` level — POA products whose variants carry no usable price, modelled as `base_price_minor = NULL`), min £63, max £12,534,195 (the bigint outlier), all GBP, all `discountPct: 0`, all `minOrderQty: 1`, 12 featured. Aspose.Cells £870 and IronPDF £509 verified.

Now I have everything I need to write the chapter.

---

# Chapter — Pricing & Discount Engine

> *Source-of-truth tables referenced throughout: `pricing_rules`, `pricing_rule_targets`, `customer_tiers`, `offering_variants`, `offerings`, `quote_items`, `audit_log`, `import_jobs` — all defined in the Schema chapter. This chapter does not redefine them; it specifies the **behaviour** layered on top: how a rule resolves to a single winning price, where that price is computed and shown, how mass repricing works, and the invariants an admin can trust.*

This is the most safety-critical subsystem in the platform. A bug here doesn't render a wrong pixel — it quotes a customer the wrong money, or persists a negative price, or silently double-discounts an enterprise OEM licence. The whole design philosophy is therefore **make dangerous states unrepresentable** (CHECK constraints in the schema), and **make the live price deterministic** (one pure function, single-winner, no stacking). Everything below is the contract the agency's Laravel engine must satisfy and the rubric we grade their Sprint-1 code against.

A note on the ground truth before we start. The live feed is `discountPct: 0` on every one of its 819 variants, `pricingGroups: []` is an empty placeholder, and `minOrderQty: 1` everywhere. **There is no discount data to migrate** — this engine is greenfield, which is a gift: we get to define the rules model correctly from the first row rather than retrofit around a legacy pricing table. The `list_discount_pct` column on `offering_variants` exists to faithfully carry the feed's `discountPct` (a *manufacturer* list discount baked into the published price), and is deliberately **separate** from the Greatstone rule engine below — a vendor's list discount and a Greatstone promotion are different concepts and must never be conflated.

---

## 1. The pricing-rules model and the five scopes

A `pricing_rules` row answers four questions: **what does it change** (`adjustment_type` + `adjustment_value_pct` / `adjustment_value` + `currency`), **what does it apply to** (`scope_type` + rows in `pricing_rule_targets`), **who sees it** (`audience` + `audience_tier_id`), and **when is it live** (`active` + `starts_at`/`ends_at` + `status`). `priority` (lower wins) and `floor_fraction` govern conflict and safety. That's the entire surface.

The brief calls for "all / vendor(brand) / category(product-type) / specific offerings / customer company-tier." `scope_type` is the enum that selects the *kind* of target; the concrete targets live in `pricing_rule_targets` (real FKs, `ON DELETE CASCADE`, `chk_exactly_one_target`) rather than a `scope_ids[]` array — so a deleted vendor cleanly removes its rule targets instead of leaving a dangling id, and "which rules touch Aspose?" is an indexed join, not an array scan. `scope_type='all'` carries **no** target rows (it matches every offering implicitly).

The five scopes, each with a real worked configuration against catalogue data:

| # | Scope | `scope_type` | Targets (`pricing_rule_targets`) | Worked example with real data |
|---|-------|--------------|----------------------------------|-------------------------------|
| 1 | **Brand / vendor, percentage** | `vendor` | one row, `vendor_id` = Aspose | "Aspose Summer Sale −20%": `adjustment_type='percentage'`, `adjustment_value_pct=20.00`. Aspose.Cells for .NET Developer Small Business £870 → **£696**. The Site OEM variant £12,165 → **£9,732**. Every Aspose offering, every variant, in one rule. |
| 2 | **Category / product-type, fixed** | `category` | one row, `category_id` = `cat-pdf` | "PDF tooling, £50 off": `adjustment_type='fixed'`, `adjustment_value=5000` (pence), `currency='GBP'`. IronPDF Lite £509 → **£459**. Applies across vendors — any offering whose `category_id` is `cat-pdf` (IronPDF, Apryse PDF SDKs, etc.). |
| 3 | **Specific offerings** | `offering` | one row per offering, e.g. `offering_id` = IronPDF | "IronPDF launch promo −15%": targets exactly the IronPDF offering. £509 → **£432.65** (clamped/rounded per §3). Add more `pricing_rule_targets` rows to extend the same rule to a hand-picked set. |
| 4 | **Customer company-tier** | `tier` (audience) | `audience='tier'`, `audience_tier_id` = Partner; optionally also a vendor/category target row | "Partner preferred pricing −10% on Aspose": `scope_type='vendor'` + Aspose target **and** `audience='tier'`, `audience_tier_id`=Partner. A logged-in Partner-tier customer sees Aspose.Cells £870 → **£783**; the public sees £870. |
| 5 | **Time-boxed site-wide** | `all` | none | "Black Friday −12% everything": `scope_type='all'`, `adjustment_type='percentage'`, `adjustment_value_pct=12.00`, `starts_at='2026-11-27T00:00Z'`, `ends_at='2026-12-01T00:00Z'`. Live only inside the window; matches every published, priced offering. POA offerings are untouched (§8). |

Two important modelling points the agency must honour:

- **`applies_to_offering_type`** (nullable) lets a rule say "products only" or "services only" or both (NULL). A site-wide product clearance shouldn't accidentally discount a consulting engagement.
- **`audience`** is orthogonal to `scope_type`. Scope answers *which offerings*; audience answers *which buyers*. A `tier` rule with a `vendor` scope target is the normal shape of a partner deal (scope = Aspose, audience = Partner). A pure `scope_type='tier'` rule (target row is just the tier, audience also tier) means "this tier gets X across everything" — equivalent to a site-wide rule gated to one tier.

`active` defaults **FALSE** and `status` defaults **`draft`**: a freshly inserted rule is inert twice over. It goes live only when an admin with `pricing.publish` flips `active=true` and `status='published'`. This is deliberate — no rule ever discounts a customer the moment a row lands in the table.

---

## 2. The compute function — `effectivePrice(...)`

This is the heart of the engine: one **pure, deterministic** function, called identically on the catalogue card, the detail page, and at quote capture. Same inputs → same output, always.

```
effectivePrice(offering, variant, rules, customerTier, now) → {
  base,          // integer minor units (variant.base_price_minor), or null = POA
  final,         // integer minor units after the winning rule + clamp + rounding, or null = POA
  appliedRule,   // the winning pricing_rules row, or null
  currency,      // ISO-4217, copied from variant.currency
  display        // { kind: 'priced' | 'poa', label, strikeBase?, badge? }  — see §7
}
```

### 2.1 Selection — single winner, no stacking

A variant may be matched by several active rules at once (a vendor rule, a site-wide rule, a tier rule). **Exactly one wins.** Never stack, never compound. The selection is a filter then a sort:

**Step 1 — eligibility filter.** A rule is a candidate iff *all* hold:

1. `active = true` AND `status = 'published'` AND `deleted_at IS NULL`
2. **In schedule:** `(starts_at IS NULL OR starts_at <= now) AND (ends_at IS NULL OR ends_at > now)`
3. **Type match:** `applies_to_offering_type IS NULL OR applies_to_offering_type = offering.type`
4. **Scope match:**
   - `all` → always matches
   - `vendor` → a target row with `vendor_id = offering.vendor_id`
   - `category` → a target row with `category_id = offering.category_id` *(or any ancestor of it, walking `categories.parent_id` — so a rule on a future parent category cascades to children)*
   - `offering` → a target row with `offering_id = offering.id`
   - `tier` → handled as audience (below); its target row is the tier
5. **Audience match:**
   - `audience = 'public'` → matches everyone (logged-out and logged-in)
   - `audience = 'tier'` → matches **only** if `customerTier` is non-null AND `customerTier.id = audience_tier_id`. A logged-out visitor, or a customer in a different tier, never sees a tier rule.
6. **Discountable base:** `variant.base_price_minor IS NOT NULL`. A POA variant has no base to reduce → it is structurally excluded, never "discounted to a number."

**Step 2 — pick the winner** from the candidate set, by this total order:

1. **Lowest `priority`** (lower number = higher precedence). This is the admin's explicit override knob.
2. Tie → **largest actual reduction** (compute each candidate's `base − provisionalFinal` in minor units; pick the biggest saving for the customer).
3. Tie → **newest** (`created_at DESC`) — the most recently authored rule reflects the latest commercial intent.
4. Tie → lowest `id` (a final, fully deterministic backstop so the function is referentially transparent).

The winner is `appliedRule`. If the candidate set is empty, `appliedRule = null` and `final = base`.

### 2.2 Application — compute, clamp, round, guard

Given the winning rule and `base = variant.base_price_minor`:

```
rawCut   = rule.adjustment_type == 'percentage'
             ? round_half_up(base * rule.adjustment_value_pct / 100)   // minor units
             : rule.adjustment_value                                    // already minor units

provisionalFinal = base - rawCut

floor    = ceil(base * rule.floor_fraction)        // never below this fraction of base
final    = max(provisionalFinal, floor, 0)         // floor clamp AND hard zero guard

final    = applyRounding(final, currency, offering)  // §3 — rounding is the LAST step
```

Three guards, layered so no single failure produces a bad price:

- **Floor clamp** — `final ≥ base × floor_fraction`. A `floor_fraction = 0.50` means "never sell below half list," so a fixed −£50,000 rule mistakenly attached to a £509 product clamps to the floor, not to a negative.
- **Hard zero guard** — `max(…, 0)`. Belt-and-braces; the schema's `CHECK (… >= 0)` is the database backstop, this is the application backstop.
- **Currency guard** — a `fixed` rule's `currency` must equal `variant.currency` to apply; a GBP-only catalogue makes this trivially true today, but a EUR fixed rule must never subtract its number from a GBP price. Mismatch → the rule is **not a candidate** (silently skipped, logged once).

### 2.3 Reference implementation

```ts
// Pure. No DB, no clock side-effects — `now` and `rules` are passed in.
function effectivePrice(offering, variant, rules, customerTier, now) {
  const base = variant.base_price_minor;            // bigint | null
  const currency = variant.currency;

  // POA: no base → never priced, never discounted.
  if (base == null) {
    return { base: null, final: null, appliedRule: null, currency,
             display: poaDisplay(offering) };
  }

  const candidates = rules.filter(r =>
       r.active && r.status === 'published' && r.deleted_at == null
    && (r.starts_at == null || r.starts_at <= now)
    && (r.ends_at   == null || r.ends_at   >  now)
    && (r.applies_to_offering_type == null || r.applies_to_offering_type === offering.type)
    && scopeMatches(r, offering)                    // all|vendor|category(+ancestors)|offering|tier
    && audienceMatches(r, customerTier)             // public, or tier===audience_tier_id
    && (r.adjustment_type !== 'fixed' || r.currency === currency)
  );

  if (candidates.length === 0)
    return { base, final: base, appliedRule: null, currency,
             display: pricedDisplay(base, base, null, currency) };

  // provisional final per candidate, for tie-break #2
  const scored = candidates.map(r => ({ r, prov: clampFinal(base, computeCut(base, r), r) }));

  scored.sort((a, b) =>
       a.r.priority - b.r.priority                          // 1: lowest priority wins
    || (base - a.prov) - (base - b.prov) > 0 ? -1 :         // 2: largest reduction
       (base - a.prov) - (base - b.prov) < 0 ?  1 :
       b.r.created_at - a.r.created_at                      // 3: newest
    || (a.r.id < b.r.id ? -1 : 1));                         // 4: id backstop

  const win = scored[0];
  const final = applyRounding(win.prov, currency, offering);   // round LAST
  return { base, final, appliedRule: win.r, currency,
           display: pricedDisplay(base, final, win.r, currency) };
}

function computeCut(base, r) {
  return r.adjustment_type === 'percentage'
    ? roundHalfUp(base * Number(r.adjustment_value_pct) / 100)
    : Number(r.adjustment_value);
}
function clampFinal(base, cut, r) {
  const floor = Math.ceil(base * Number(r.floor_fraction));
  return Math.max(base - cut, floor, 0);
}
```

Note `applyRounding` runs **once, on the winner, last** — never inside the tie-break loop. Rounding is a presentation transform on the final number; doing it earlier would let psychological rounding distort the "largest reduction" comparison.

---

## 3. Rounding and currency rules

**Money is integer minor units (pence) + an ISO-4217 currency code, everywhere — never a float, never a string.** This is the single most important defect-prevention decision: it kills the prototype's `'From £870'` free-text disease at the root, and `BIGINT` (not `INTEGER`) is mandatory because the live feed already carries a £12,534,195 variant (`12534195` is comfortably inside int4, but minor-unit storage of large site/OEM licences in higher-precision currencies, and headroom against future repricing, make int4 a latent overflow bug — the schema uses bigint deliberately).

**Currency:** the engine is currency-aware but currency-pure: a price's `currency` flows untouched from `variant.currency` to `final`; a `fixed` rule that doesn't match the variant's currency is not a candidate (§2.2). The catalogue is 100% GBP today, so all examples are GBP, but the contract is multi-currency-safe.

**Percentage maths in minor units.** `base * pct / 100` with `round_half_up` to the nearest pence. Worked: £870 = `87000`p, −20% → cut `= round_half_up(87000 * 20 / 100) = 17400`p → final `69600`p = **£696.00**. IronPDF £509 = `50900`p, −15% → cut `= round_half_up(50900 * 15 / 100) = 7635`p → final `43265`p = **£432.65**.

**Psychological rounding — optional, off by default, never breaks the floor.** `applyRounding(final, currency, offering)` supports a per-org / per-rule policy in `organisations.settings` or `pricing_rules` (e.g. `round_to: 'charm_99'` → land on `…99`p; `round_to: 'whole'` → nearest whole pound). It is **always a downward-only nudge bounded by the floor**: charm-rounding £432.65 → £429.99 is allowed (still ≥ floor); it may never round *up* past the computed final, and may never round *below* the floor or below zero. Default policy is `round_to: 'none'` — what you compute is what you show. This keeps quoted numbers honest unless an admin opts into charm pricing.

---

## 4. Mass price-change operations — rules vs. one-off reprices

Two distinct mechanisms, deliberately not the same thing:

### 4.1 Apply a rule (non-destructive, reversible, live-computed)

A `pricing_rules` row **never mutates `base_price_minor`.** It is an overlay evaluated at read time by `effectivePrice`. Activating "Aspose −20%" reprices all ~? Aspose variants *instantly and reversibly* — toggle `active=false` and every price returns to list with zero data migration. This is the right tool for sales, promotions, tier pricing, scheduled campaigns: the underlying list price is preserved, the discount is auditable, and "undo" is one boolean. Worked: one rule, `scope_type='vendor'`, Aspose target, `−20%` — every Aspose offering's every variant is now quote-priced at 80% of list, the struck base price still shows, and the rule's `label` drives the sale badge.

### 4.2 One-off bulk reprice (destructive, list-price edit, via import)

Sometimes the **list price itself** changes — a vendor's annual price increase, a currency re-base, a catalogue correction. That is *not* a rule; it's an edit to `offering_variants.base_price_minor`, and it goes through the **import pipeline** (`import_jobs` / `import_job_rows`), never a blind UPDATE:

1. **Export** the current variants to Excel/CSV (one row per variant, keyed on the stable `(offering slug, sku, license_type, billing_period)` upsert key, with `base_price_minor` and a human `base_price` column).
2. **Bulk-edit in Excel** — e.g. multiply a column by 1.08 for an 8% vendor increase, or paste new numbers.
3. **Re-import as updates.** The job runs **dry-run first**: it computes a `diff_summary` and per-row `before`/`after` with **zero mutation**, validates every cell (non-negative, currency present, parses to integer minor units), and shows the admin exactly which variants change and by how much.
4. **Admin approves** → apply is **idempotent** (same file, same `source_checksum`, re-running is a no-op) and **upserts** on the stable key. Every changed row writes a `before`/`after` pair to `audit_log` under a shared `rollback_token`.
5. **Rollback** — one click on the `rollback_token` reverts every row in the job from its `before` snapshot.

| | **Pricing rule** | **One-off bulk reprice** |
|---|---|---|
| Touches `base_price_minor`? | No (read-time overlay) | Yes (writes the list price) |
| Reversible by | toggling `active` | rollback token from the import |
| Use for | promos, tiers, scheduled sales | vendor price rises, corrections, re-base |
| Stacking | single-winner at compute time | n/a — it's the new base the rules then act on |
| Audit | rule row + `appliedRule` on each quote | `audit_log` before/after per variant |
| Shows struck price? | Yes (base vs. final) | No — the new number *is* list |

The two compose cleanly: a vendor price rise lands as a bulk reprice (new base), and an active rule then discounts off that new base on the next page render — no recompute job needed, because rules are live.

---

## 5. Where price is computed and applied

`effectivePrice` is the **single** entry point; it runs in three places, with one critical difference in the third.

- **Catalogue card** (listing/grid). For sort and the "from" figure, the card uses `offerings.from_price_minor` — a **cached lowest active price** maintained off the variants — then runs `effectivePrice` on that representative variant (with the **public** audience, no tier, unless a customer is logged in) to render the struck/final pair and any sale badge. Cards are read-heavy, so the cache plus a lightweight per-card compute keeps listing fast. The cache is recomputed when a variant's base changes or a rule that targets the offering flips active.
- **Detail page.** Runs `effectivePrice` per variant across the full editions table — so each of IronPDF's Lite/Plus/Professional editions, or each of Aspose.Cells' four licence tiers, shows its own base, final, and badge. The logged-in customer's tier flows in here, so a Partner sees partner pricing on every row.
- **Quote capture** (the enquiry — this is the business; the cart was the wrong model). When a line is added to a quote, the engine computes `effectivePrice` **and snapshots the result onto `quote_items`**: `list_price_minor` (base), `captured_price_minor` (final), `applied_rule_id` (the winning rule), plus denormalised `offering_name` / `variant_name` / `currency`. **The quote is immutable from that moment.** If the rule later expires, the offering is repriced, or the vendor pulls the product, the quote still reflects exactly what the customer was shown — the historical record is truthful by construction. This is why `quote_items` carries its own price columns rather than recomputing from the live catalogue.

The same snapshot discipline applies to `order_items` if/when a quote is converted (checkout is out of scope; the columns exist so the contract is complete — no payment is ever faked).

---

## 6. Per-customer-tier resolution and the studio's tier preview

**Resolution at request time (real customer):** an authenticated buyer (`customer_users.auth_subject` ← IdP) resolves to their `customers` row → `customers.tier_id` → `customer_tiers`. That `customerTier` is passed into `effectivePrice`. A `tier` audience rule matches only when `customerTier.id === audience_tier_id`. A logged-out visitor has `customerTier = null` → sees public pricing only; tier rules are invisible to them. Tier resolution is server-side and trust-rooted in the session — never a query param, never a client flag.

**Studio preview without faking auth.** Admins need to answer "what does a Partner-tier customer see on this page?" *before* publishing a tier deal — and they must do it **without impersonating a real login or minting a fake session.** The mechanism: the studio's price-preview control sets an explicit, server-validated **`previewTierId`** that is passed into `effectivePrice` *in place of* the resolved session tier, but **only**:

- when the operator holds `pricing.preview` (admin/editor), checked server-side;
- as a **read-only projection** — preview never writes a `quote_item`, never creates a session, never sets `app.current_org` to anything but the operator's real org;
- visibly **banner-flagged** in the UI ("Previewing as: Partner tier — not your live view"), so no one mistakes a preview for production;
- audited: the preview request is logged (`audit_log`, action `update` context `{preview_tier_id}` is overkill — a lightweight read-event suffices) so we can see who previewed what.

So the studio renders the Partner view by *parameterising the pure function*, not by pretending to be a Partner. Same code path as production, one substituted argument, zero auth theatre. This is the only honest way to preview audience-scoped pricing.

---

## 7. Quote-framed display copy, struck base, sale label

The reseller business is **browse-and-enquire**, not checkout. Display copy must invite a quote, show the saving honestly, and never imply an "add to cart → pay" flow for products. `display` from `effectivePrice` drives this:

**Priced, no rule:**
> **£870.00** — *Request a quote*

**Priced, rule applied (struck base + final + badge):**
> ~~£870.00~~ **£696.00** · `Aspose Summer Sale −20%` — *Request a quote*

The struck `£870.00` is `display.strikeBase` (only rendered when `final < base`), `£696.00` is `display.label`, and the badge text is the rule's `label` column (`pricing_rules.label` — e.g. "Summer Sale", "Partner price"), never the internal rule name. For a tier rule the badge reads e.g. `Partner price` and only the matching tier sees it.

**POA / null-price (13 products in the feed):**
> **Contact for licence** — *Request a quote*

No strike, no number, no badge — a POA offering is structurally un-discountable (§8), so we never show a struck price next to "Contact for licence." The CTA across all states is the same enquiry action; nothing on a product page promises payment.

`display.kind` is `'priced'` or `'poa'`; the rendering layer reads only `display`, so card, detail, and quote line share one copy contract. Currency formats from `currency` (`GBP` → `£`, two-decimal).

---

## 8. Edge cases and the one-sentence invariants

**Edge cases the engine handles explicitly:**

| Case | Behaviour |
|------|-----------|
| **POA / null base** (13 feed products) | Excluded from candidacy; `final = null`; "Contact for licence"; no rule can ever produce a number. |
| **−£50,000 fixed rule on a £509 product** | `provisionalFinal` negative → floor clamp + zero guard → `final = max(…, base×floor_fraction, 0)`. Never persists negative (schema CHECK is the final backstop). |
| **Two overlapping rules** (vendor −20% AND site-wide −12%) | Single winner by priority → reduction → newest → id. **Never** −32%, never compounded. |
| **Tier rule + logged-out visitor** | `customerTier = null` → tier rule not a candidate → public price shown. |
| **Rule scheduled in the future / already expired** | Schedule filter excludes it; `chk_rule_schedule` already forbids `ends_at ≤ starts_at` at write time. |
| **Currency mismatch** (EUR fixed rule, GBP variant) | Rule not a candidate; logged once; GBP price unaffected. |
| **Rule inserted but not activated** | `active=false` / `status='draft'` default → inert; appears nowhere until an admin with `pricing.publish` flips both. |
| **Manufacturer `discountPct` vs Greatstone rule** | `list_discount_pct` is the vendor's baked-in list discount on the variant; the rule engine acts on `base_price_minor` and is wholly separate — they never stack into one number by accident. |
| **£12.5M outlier variant** | Bigint storage; −% and floor maths are integer-exact at that magnitude; no float drift. |
| **Quote captured, then rule expires** | Quote unchanged — `captured_price_minor` + `applied_rule_id` are snapshots; the historical price is immutable. |

**Invariants the admin can trust — each in one sentence:**

1. **A customer is never quoted a negative or sub-floor price** — every final is `max(base − cut, base × floor_fraction, 0)`, enforced again by `CHECK (… >= 0)` at the database.
2. **Discounts never stack** — exactly one rule wins per variant, chosen by priority → largest reduction → newest → id, deterministically.
3. **A POA / "Contact for licence" offering can never be discounted to a number** — null base is structurally excluded from the rule engine.
4. **No rule goes live by being created** — `active` and `status` both default to off, and only `pricing.publish` flips them.
5. **The same pure function produces the price on the card, the detail page, and the quote** — what the customer sees is what gets snapshotted, byte-for-byte.
6. **A quote is immutable** — `list_price_minor`, `captured_price_minor`, and `applied_rule_id` are frozen on `quote_items` the instant a line is captured, regardless of later catalogue changes.
7. **Activating a rule never alters a stored list price, and deactivating it fully reverts** — rules are read-time overlays, so promotions are reversible with one boolean and zero data migration.
8. **A list-price change is always auditable and reversible** — it flows through the import pipeline (dry-run → diff → approve → `rollback_token`), never a blind UPDATE.
9. **Previewing a tier never fakes a login or writes data** — the studio substitutes a server-validated `previewTierId` into the pure function as a read-only, banner-flagged, audited projection.
10. **Money is always integer minor units + a currency code** — no floats, no price-as-string, bigint headroom for the £12.5M+ outliers.

---

**Files grounding this chapter (all absolute):** real catalogue `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json` — verified live: 159 products / 10 vendors / 32 categories / **819 variants all GBP**, `discountPct: 0` and `minOrderQty: 1` on every variant, `pricingGroups: []` (empty — engine is greenfield), min variant **£63**, max **£12,534,195** (the bigint outlier), 12 featured, **13 null-`fromPrice` POA products** (`docconverter`, `meridian`, `server`, `toolkit`, `webgrabber`, the six `apryse-for-*` low-code connectors, `apryse-mobile-sdk`, `apryse-server-sdk`, `apryse-web-sdk`); **Aspose.Cells for .NET** (`aspose-cells-for--net`, `cat-spreadsheets`) base **£870** with variants £870 / £2,610 / £4,345 / £12,165; **IronPDF** (`ironpdf`, `ironsoftware`, `cat-pdf`, featured) base **£509**. Handoff `/Users/johnprempeh/Desktop/Code/greatstone-homepage/CATALOG-HANDOFF.md`. Schema chapter is the source of truth for all tables referenced (`pricing_rules`, `pricing_rule_targets`, `customer_tiers`, `offering_variants`, `offerings`, `quote_items`, `order_items`, `import_jobs`, `audit_log`). Prior current-state analysis: `/tmp/cms-map-commerce-pricing.md`, `/tmp/cms-assess-mass-discount.md`, `/tmp/cms-map-store-data.md`.

---

# Part 4 — Bulk operations & AI-assist

All grounded. The data confirms: SKU `ASPOSE-230` repeats across all five editions of one product (so `sku` alone is not a unique key — the schema's `(offering_id, sku, license_type, billing_period)` is right), the £12,534,195 outlier is real (vendor `iris` exists for the "set all IRIS products to draft" example), `docconverter` is a real null-price product, and prices like 290 are stored as whole GBP units in the feed (so the importer must multiply by 100 to land in `_minor`). Now I'll write the chapter.

# Chapter 5 — Bulk Operations & AI-Assist

> **Where this sits.** This chapter operationalises the schema defined in the source-of-truth DDL (`offerings`, `offering_variants`, `offering_specs`, `offering_media`, `pricing_rules`/`pricing_rule_targets`, `import_jobs`/`import_job_rows`, `ai_actions`, `audit_log`). It does not redefine any table — it specifies the *file formats*, *flows*, *validation*, and *AI safety model* that drive them. Every bulk mutation in the platform funnels through **one pipeline** (`import_jobs`) and **one safety gate** (dry-run → diff → admin confirm → transactional apply → rollback token → audit). AI is not a second mutation path: every AI operation **materialises as an `import_job` proposal** that an admin previews and approves. There is exactly one way to change data in bulk, and it is always reversible and always audited.

The numbers cited throughout are the live feed at `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json`: **159 products, 10 vendors, 32 categories, 819 variants**, GBP, `minOrderQty:1`, `discountPct:0`, 13 null-price products, 12 featured. A representative real row I cite repeatedly: product `aspose-tex-for-c++` (vendor `aspose`, category `cat-typesetting`), whose five editions **all share SKU `ASPOSE-230`** — which is exactly why the variant upsert key is the composite `(offering_id, sku, license_type, billing_period)`, never `sku` alone.

---

## A. Excel / CSV round-trip

### A.0 The core idea — flatten, edit, re-import as upsert

The catalogue is a graph (offering → many variants → many specs → many gallery images). Spreadsheets are flat. The round-trip is therefore a **lossless projection** of that graph into rows an admin can edit in Excel, plus deterministic rules for folding the edited rows back into the graph as an **idempotent upsert**. "Idempotent" is non-negotiable: re-importing the *same* file a second time must produce **zero** changes (all rows `noop`). That property is what makes the whole thing safe to retry.

We ship **three sheet shapes**, each a separate worksheet/tab in one `.xlsx` workbook (or three CSVs). An admin uses whichever matches the job:

| Sheet | Grain | Use it to… | Upsert key |
|---|---|---|---|
| **`Offerings`** | one row per offering | edit names, descriptions, category, vendor, status, featured, tags, platforms, SEO | `slug` |
| **`Variants`** | one row per variant/edition | edit prices, license terms, MOQ, billing period, add/remove editions | `offering_slug` + `sku` + `license_type` + `billing_period` |
| **`Specs`** | one row per spec line | edit the feature/spec table | `offering_slug` + `sort_order` |

Galleries are handled inline on the `Offerings` sheet (a pipe-delimited URL list — see A.3), because per-image rows are overkill for the edit operations admins actually perform.

> **Why three sheets and not one giant denormalised sheet?** A single "one row per variant with the offering's 20 columns repeated" sheet means editing the offering's description requires editing it identically on 8 rows — and an importer must then detect and reconcile contradictions ("which of these 8 differing descriptions wins?"). Splitting by grain makes each edit unambiguous and each row's intent obvious. The trade-off — an admin who wants "everything about product X" looks in two tabs — is handled by a shared `offering_slug` column and Excel's filter, and is far cheaper than reconciling fan-out conflicts.

### A.1 The `Offerings` sheet — exact columns

One row per offering. Column order is fixed (the importer maps by **header name**, not position, so admins may reorder/hide columns, but this is the canonical export order):

| Column header | Maps to | Required on import? | Format / notes |
|---|---|---|---|
| `slug` | `offerings.slug` | **Yes (key)** | Stable business key. Blank ⇒ treated as a NEW offering; importer generates a slug from `name` and reports it. Never edit a slug to "rename" — that creates a new row + orphans the old (see A.5). |
| `type` | `offerings.type` | Yes for inserts | `product` \| `service`. Defaults to `product` if blank on a known product slug. |
| `name` | `offerings.name` | Yes | Plain text. |
| `vendor_slug` | resolved → `offerings.vendor_id` | Yes for `product` | Must match an existing `vendors.slug` (e.g. `aspose`). **Blank required for `service`.** FK-validated. |
| `category_slug` | resolved → `offerings.category_id` | No | Must match `categories.slug` (e.g. `typesetting` for `cat-typesetting`) or blank. |
| `status` | `offerings.status` | No | `draft` \| `published` \| `archived`. Blank ⇒ unchanged (existing) / `draft` (new). |
| `featured` | `offerings.featured` | No | `TRUE`/`FALSE`/`1`/`0`/`yes`/`no` — normalised. |
| `fulfilment` | `offerings.fulfilment` | No | `license`/`subscription`/`enquiry`/`engagement`. CHECK-validated against `type`. |
| `short_description` | `offerings.short_description` | No | Plain text. |
| `description` | `offerings.description` | No | Markdown/plain. Long cells are fine in `.xlsx`; CSV exports quote-escape. |
| `platforms` | `offerings.platforms` (TEXT[]) | No | Pipe-delimited: `.NET\|Java\|C++\|Python`. Empty ⇒ `{}`. |
| `tags` | `offerings.tags` (TEXT[]) | No | Pipe-delimited. |
| `seo_meta_title` | `offerings.seo->>metaTitle` | No | |
| `seo_meta_description` | `offerings.seo->>metaDescription` | No | |
| `seo_social_image` | `offerings.seo->>socialImage` | No | URL or media key. |
| `gallery` | `offering_media` (rebuilt) | No | Pipe-delimited ordered URL/asset-key list (A.3). |
| `from_price_minor` | `offerings.from_price_minor` | **Read-only (export only)** | Derived/cached. Exported greyed-out for reference; **ignored on import** (recomputed from variants). |
| `row_version` | `offerings.row_version` | No (concurrency) | Exported so re-import does optimistic-lock checks (A.6). Don't touch. |
| `_action` | — | No | Control column: blank/`upsert` (default), or `delete` (A.4). |

**Example exported rows** (real data, `from_price_minor`/`row_version` shown):

```
slug,type,name,vendor_slug,category_slug,status,featured,fulfilment,short_description,platforms,tags,from_price_minor,row_version,_action
aspose-tex-for-c++,product,Aspose.TeX for C++,aspose,typesetting,published,FALSE,license,"Typeset TeX/LaTeX to PDF/XPS/images from C++.",C++,aspose|typesetting|C++,29000,7,
aspose-html-for-java,product,Aspose.HTML for Java,aspose,conversion,published,TRUE,license,"Render and convert HTML in Java.",Java,aspose|conversion|Java,,12,
docconverter,product,DocConverter,activepdf,conversion,published,FALSE,enquiry,"Server-side document conversion.",.NET,activepdf|conversion,,3,
```

(Note `docconverter` exports a blank `from_price_minor` — it's a real null-price/POA product. `aspose-html-for-java` is the one carrying the £12,534,195 outlier edition; its offering-level `from_price` may be POA while a variant holds the big number.)

### A.2 The `Variants` sheet — the price substrate

One row per edition. This is the sheet a pricing admin lives in.

| Column header | Maps to | Required? | Notes |
|---|---|---|---|
| `offering_slug` | parent `offerings.slug` | **Yes (key part)** | FK-resolved to `offering_id`. |
| `sku` | `offering_variants.sku` | Key part | May be blank (some live variants have `''`); may repeat across editions (e.g. all five `aspose-tex-for-c++` rows are `ASPOSE-230`). |
| `name` | `offering_variants.name` | Yes for inserts | e.g. `Developer, C++`. |
| `license_type` | `offering_variants.license_type` | Key part | e.g. `Developer OEM - Single Developer, Unlimited Deployment`. Disambiguates same-SKU editions. |
| `billing_period` | `offering_variants.billing_period` | Key part | `one_time`/`perpetual`/`monthly`/`quarterly`/`annual`/`multi_year`. Default `perpetual`. |
| `base_price_minor` | `offering_variants.base_price_minor` | No | **Integer minor units (pence).** Blank ⇒ POA (and `currency` must also be blank). See A.7 on the price-as-major-units convenience column. |
| `base_price` | helper (major units) | No (convenience) | **Either** `base_price_minor` **or** `base_price` (e.g. `870.00`); importer multiplies major→minor and rejects rows that set both inconsistently. Export fills both (`base_price` greyed). |
| `currency` | `offering_variants.currency` | Cond. | `GBP`. **Required iff price present**; the both-or-neither CHECK is enforced pre-import with a clear error. |
| `min_order_qty` | `offering_variants.min_order_qty` | No | Default `1`. |
| `list_discount_pct` | `offering_variants.list_discount_pct` | No | The feed's `discountPct` (0 today). This is the *manufacturer list* discount, **not** a Greatstone pricing rule — see B.3. |
| `sort_order` | `offering_variants.sort_order` | No | Edition display order. |
| `row_version` | concurrency | No | |
| `_action` | — | No | `upsert`/`delete`. |

**Example exported rows** (the real `aspose-tex-for-c++` editions — note the repeating SKU disambiguated by `license_type`):

```
offering_slug,sku,name,license_type,billing_period,base_price_minor,base_price,currency,min_order_qty,list_discount_pct,sort_order,row_version,_action
aspose-tex-for-c++,ASPOSE-230,"Developer, C++","Developer Small Business - Single Developer, ≤4 deployments",perpetual,29000,290.00,GBP,1,0,0,2,
aspose-tex-for-c++,ASPOSE-230,"Developer, C++","Developer OEM - Single Developer, Unlimited Deployment",perpetual,87000,870.00,GBP,1,0,1,2,
aspose-tex-for-c++,ASPOSE-230,"Developer, C++","Site Small Business - Up to 10 Developers",perpetual,145000,1450.00,GBP,1,0,2,2,
```

### A.3 Representing nested data (variants, specs, gallery)

- **Variants** → their own `Variants` sheet (above). One row each; child-of relationship carried by `offering_slug`.
- **Specs** → their own `Specs` sheet: `offering_slug, sort_order, label, value, _action`. IronPDF-class products have ~24 spec lines; one row each. `value` defaults to `✓`. The `(offering_slug, sort_order)` pair is the key, so editing the *label* of spec #5 is an update, not an insert-and-orphan.
  ```
  offering_slug,sort_order,label,value,_action
  ironpdf,0,"Generate PDFs from HTML",✓,
  ironpdf,1,"Edit existing PDFs",✓,
  ironpdf,2,"Digitally sign PDFs",✓,
  ```
- **Gallery** → inline `gallery` column on `Offerings`, **pipe-delimited, order-significant**:
  ```
  gallery
  https://cdn/.../hero.png|https://cdn/.../screen-1.png|https://cdn/.../screen-2.png
  ```
  On import the importer **rebuilds** `offering_media` for that offering to match the list exactly (resolving/creating `media_assets` rows by URL+checksum, idempotently). A blank `gallery` cell means "leave gallery unchanged"; an explicit `[]` literal (or the sentinel `__EMPTY__`) means "clear the gallery". This distinction — blank = untouched vs. sentinel = clear — is uniform across every multi-value column and is documented on the template's `README` tab.

### A.4 Supported edit operations

| Operation | How to do it in the sheet | Resulting row action |
|---|---|---|
| **Edit a field** | Change the cell, leave the key columns intact | `update` (only changed fields) |
| **Add a new offering** | New row, blank `slug`, fill `name`/`type`/`vendor_slug` | `insert` (slug generated, reported in diff) |
| **Add a new edition** | New row on `Variants`, existing `offering_slug`, new `license_type`/`sku` | `insert` |
| **Add a spec line** | New row on `Specs`, next `sort_order` | `insert` |
| **Mark delete** | Put `delete` in `_action` (soft-delete: sets `deleted_at`) | `update`→ soft-delete |
| **No-op** | Leave a row exactly as exported | `noop` (idempotency proof) |
| **Reorder** | Edit `sort_order` | `update` |

**Renames are deliberately *not* "edit the slug".** The slug/sku are the identity. To rename a *display name*, edit `name`. To genuinely re-key (rare), there's a dedicated **`_action: rekey`** with a `new_slug` column, which performs an atomic update of the key plus a redirect record — never a silent insert+orphan. Editing `slug` in place is rejected with a hard error: *"`slug` is the stable key and cannot be changed by overwriting; use `_action: rekey` with `new_slug`."*

### A.5 Template download

`Catalogue → Bulk → Download template` offers four presets, each a real `.xlsx` with: a frozen header row, data-validation dropdowns (the `type`, `status`, `fulfilment`, `billing_period`, `currency`, `_action` columns become Excel dropdowns sourced from the enum values), a greyed read-only style on derived columns, and a `README` tab documenting keys/sentinels/units:

1. **Blank template** — headers only, validations wired, zero data rows.
2. **Full export** — every live row (the round-trip starting point). Generated from the exact data above.
3. **Vendor/category-scoped export** — e.g. "all `aspose` offerings + their variants" (the common edit unit).
4. **Price-only sheet** — the slim mass-price sheet (Section B.1).

Exports are produced by the same serializer the importer reads, guaranteeing a clean round-trip (export → immediate re-import = all `noop`).

### A.6 Idempotent upsert — the precise key rules

On apply, each row resolves to one action by its key:

- **Offerings:** key = `slug`. Found ⇒ `update` (diff fields); not found & `slug` blank ⇒ `insert`; not found & `slug` present ⇒ **error** (*"slug X not found; blank it to create new, or fix the typo"* — protects against a typo silently creating a duplicate).
- **Variants:** key = `(offering_id, sku, license_type, billing_period)` — the schema's `uq_variant_edition`. This is why `ASPOSE-230` repeating five times is fine: each row's `license_type` differs.
- **Specs:** key = `(offering_id, sort_order)`.
- **Optimistic concurrency:** if a row carries a `row_version` that's **stale** (someone edited that offering in the UI after the export), the row becomes an `error` in the diff (*"row changed since export: v2→v5; re-export and redo"*) rather than clobbering. The admin can override per-row with `_action: force` if they truly mean last-write-wins. The `touch_row()` trigger bumps `row_version` on every apply, keeping the next export's baseline correct.

### A.7 Money handling on the sheet (the one trap worth calling out)

The DDL stores **`base_price_minor` as BIGINT pence**. Humans edit **pounds**. The sheet therefore exports *both* `base_price_minor` (authoritative, greyed) and `base_price` (editable, major units), and the importer's rule is:

- If only `base_price` is set → `minor = round(base_price × 100)`.
- If only `base_price_minor` is set → used verbatim.
- If **both** set and they disagree → **error** (no guessing).
- Either blank → POA, and `currency` must be blank too (the both-or-neither CHECK), else error.

This kills the prototype's `'From £870'` string disease at the import boundary: a price can only enter the system as a validated integer-pence + currency pair, or as an explicit, structural POA.

---

## B. Mass price change — spreadsheet vs. pricing rule

There are **two** mechanisms and they are not interchangeable. Choosing the wrong one is the most common way a price system rots, so the platform makes the distinction explicit in the UI.

### B.1 The price-only sheet (permanent base-price change)

For **changing the actual list price of editions** — e.g. a vendor reissues their price book, or you correct a data-entry error. This **rewrites `base_price_minor`**; it is a *fact change*, persisted, and reflected everywhere with no time bound.

The slim sheet has **only what's needed to identify a variant and restate its price**:

```
offering_slug,sku,license_type,billing_period,new_base_price_minor,new_base_price,pct_change,currency,_action
aspose-tex-for-c++,ASPOSE-230,"Developer Small Business - Single Developer, ≤4 deployments",perpetual,30450,,,GBP,
aspose-tex-for-c++,ASPOSE-230,"Developer OEM - Single Developer, Unlimited Deployment",perpetual,,,+5%,GBP,
aspose-tex-for-c++,ASPOSE-230,"Site Small Business - Up to 10 Developers",perpetual,,1522.50,,GBP,
```

Three ways to state the new price, one per row, mutually exclusive (importer errors if >1 set):

- `new_base_price_minor` — absolute pence (`30450` = £304.50).
- `new_base_price` — absolute major units (`1522.50`); ×100 internally.
- `pct_change` — relative, `+5%` / `-10%` applied to the current `base_price_minor`, rounded to pence (rounding rule documented: banker's rounding to nearest pence; surfaced in the diff).

POA rows (`base_price_minor IS NULL`) are **skipped with a notice** under `pct_change` (you can't take 5% of nothing) — they only change if an absolute value is supplied. The dry-run diff shows old→new pence and the per-row delta; apply writes through the normal pipeline (transaction + `audit_log` + rollback token), so a botched mass change is one click to revert.

### B.2 A pricing rule (non-destructive, scoped, scheduled discount)

For **promotions, tier pricing, and time-boxed offers** — "20% off everything Aspose for the summer", "Enterprise tier sees −£100 on perpetual licences". This **does not touch `base_price_minor`**. It's a `pricing_rules` row (+ `pricing_rule_targets`) evaluated at display/quote time by the single-winner, floor-clamped engine. The base price is preserved; the rule can be scheduled, switched off, or expired, and the original price returns automatically.

You create it in the **Pricing Rules** UI (not a spreadsheet), because a rule is structured config (scope, audience, schedule, floor, priority) not row data — and because `active` defaults FALSE so it never goes live by accident.

### B.3 When to use which — the decision the UI enforces

| Question | Price-only sheet | Pricing rule |
|---|---|---|
| Is this the **real new list price** forever? | ✅ | ❌ |
| Is it a **temporary** offer / sale? | ❌ | ✅ (`starts_at`/`ends_at`) |
| Scoped to a **customer tier**? | ❌ | ✅ (`audience='tier'`) |
| Need to **un-do on a date** automatically? | ❌ | ✅ |
| Vendor **reissued their price book**? | ✅ | ❌ |
| Should the original price **come back** later? | ❌ (it's gone) | ✅ |
| Apply **% across a whole vendor/category** as a standing discount? | ❌ (would bake it into base, losing the original) | ✅ (scope=`vendor`/`category`) |

Rule of thumb shown in the UI: **"Changing what something costs → sheet. Offering a discount on what it costs → rule."** The list-level `discountPct` field on variants (the feed's `0`) is a *third, separate thing* — a manufacturer's published list discount that travels with the edition — and is edited only on the full `Variants` sheet, never confused with a Greatstone pricing rule.

---

## C. The import pipeline

One pipeline backs **every** bulk mutation (round-trip imports, price sheets, *and* applied AI proposals). It is the only code path that writes catalogue data in bulk.

### C.0 Stages and the tables they touch

```
 UPLOAD ──► AUTO-MAP ──► VALIDATE ──► DRY-RUN DIFF ──► [ADMIN CONFIRM] ──► APPLY ──► (ROLLBACK?)
   │           │            │             │                 │                │           │
import_jobs  column_     import_job_   diff_summary    permission        transaction  rollback_token
(uploaded)   mapping     rows.errors   + per-row       gate (import.     + import_job  → reverse from
+ checksum   (JSONB)     (validating→  before/after    apply)            (applied)     audit_log.before
                          validated/    (validated)                      + audit_log   (rolled_back)
                          failed)
```

Each `import_jobs` row carries `status` (`uploaded→validating→validated→applying→applied`, or `failed`/`rolled_back`), `dry_run`, `source_checksum`, `column_mapping`, `diff_summary`, `total_rows`, and a `rollback_token`. Per-row state lives in `import_job_rows` (`raw`, `mapped`, `action`, `errors[]`, `before`, `after`).

### C.1 Upload

Admin drops an `.xlsx`/`.csv` (or it arrives via an AI proposal, Section D). The system:
- Stores the file, computes `source_checksum` (SHA-256).
- **Idempotency guard:** if a *previously applied* job has the identical checksum, it warns *"This exact file was applied on 14 Jun by Jane (job #1182). Re-importing will produce no changes."* — preventing accidental double-applies.
- Detects sheet shape (`Offerings`/`Variants`/`Specs`/`price-only`/`unknown`) → sets `import_type`.
- Creates `import_jobs(status='uploaded', dry_run=true)`.

### C.2 Column auto-map (+ manual remap)

Headers are matched to schema fields by exact name, then by a normalised/fuzzy match (case-insensitive, snake/space-insensitive, synonym table: `price→base_price`, `sku code→sku`, `vendor→vendor_slug`, `description long→description`). The proposed `column_mapping` is shown as a **two-column review UI** (spreadsheet header → schema field, with a dropdown to remap and an "ignore this column" option). Unmapped required fields block progress with a clear list. For genuinely messy supplier sheets, the **AI mapper** (D.2) proposes the mapping — but it lands here, in the *same* review UI, for human confirmation. The confirmed `column_mapping` is persisted on the job (re-runnable, auditable).

### C.3 Validate

Per row, into `import_job_rows.errors[]` (never throws the whole job for one bad cell):

- **Types/units:** `base_price_minor` is a non-negative integer; `base_price`×100 is integral; `min_order_qty ≥ 1`; booleans normalise; enums (`status`, `type`, `fulfilment`, `billing_period`, `_action`) are in range.
- **Required:** inserts have `name`; products have `vendor_slug`; services have *no* `vendor_slug`.
- **FKs:** `vendor_slug`/`category_slug` resolve to live rows; unknown vendor ⇒ error with the closest match suggested (*"unknown vendor 'aspos' — did you mean 'aspose'?"*).
- **Currency pairing:** `(price set) = (currency set)` — the both-or-neither CHECK, surfaced before it ever hits the DB.
- **Unified-model invariants:** `chk_product_has_vendor` / `chk_service_no_vendor` / `chk_fulfilment_for_type` pre-checked.
- **Concurrency:** stale `row_version` (A.6).
- **Key integrity:** slug-not-found-but-present (A.6); duplicate keys *within the file* flagged.

Job → `validated` (or `failed` if structurally unreadable). A row with errors gets `action='error'` and is excluded from apply.

### C.4 Dry-run diff — the heart of the safety model

The dry-run **mutates nothing**. It computes, per row, the `before` (current DB state) and `after` (proposed), classifies the action, and rolls up `diff_summary`:

```
diff_summary = {
  "inserts": 4, "updates": 37, "noops": 770, "deletes": 2, "errors": 6,
  "byEntity": { "offering": {...}, "variant": {...}, "spec": {...} },
  "priceImpact": { "rowsRepriced": 33, "avgDeltaPct": +4.9, "maxIncreasePct": +5.0,
                   "anyBelowFloor": false, "newlyPOA": 0 }
}
```

The UI renders a **per-row, field-level diff** — old value struck through, new value highlighted, errors in red with the reason. A price example:

```
✎ UPDATE  aspose-tex-for-c++ / ASPOSE-230 / "Developer OEM …"
          base_price_minor:  87000  →  91350   (+5.0%, +£43.50)   GBP
✎ UPDATE  aspose-tex-for-c++ / ASPOSE-230 / "Developer Small Business …"
          base_price_minor:  29000  →  30450   (+5.0%, +£14.50)   GBP
✚ INSERT  ironpdf-suite       (new offering, slug generated: "ironpdf-suite")
✗ ERROR   somevendor-thing    vendor_slug 'aspos' not found — did you mean 'aspose'?
∅ NOOP    docconverter         (POA, pct_change skipped)
```

Filters (`show only changed / only errors / only price increases > X%`), a CSV download of the diff, and a top-line plain-English summary (*"4 new, 37 updated, 2 deleted, 6 errors, 770 unchanged — 33 prices change, avg +4.9%, none below floor"*) make a 800-row job reviewable in seconds.

### C.5 Admin confirm + apply

Apply requires the `import.apply` permission (admin/owner only — the `role_permissions` matrix). On confirm:

- One **DB transaction**: every `insert`/`update`/`delete`/`rekey` row applied; `error` rows skipped; `noop` rows touched not at all.
- `import_jobs.status='applied'`, `applied_at=now()`, `dry_run=false`, and a fresh `rollback_token` (UUID) stamped.
- For **each** mutated entity, an `audit_log` row with `before`/`after`, `action` (`import_apply`), `actor_id`, and `context.rollback_token` + `context.import_job_id`.
- Derived caches recomputed inside the txn (each touched offering's `from_price_minor` re-derived from its live variants).
- If anything fails mid-apply, the whole transaction rolls back — the job goes `failed`, nothing partial lands.

### C.6 Rollback — revert a whole job

Any applied job shows **"Revert this import"** (permission-gated). Rollback:
- Loads every `audit_log` row whose `context->>'rollback_token'` matches (the partial index `idx_audit_rollback` makes this fast).
- In a single transaction, restores each entity's `before` (re-inserts soft-deleted rows, restores prior field values, re-derives caches).
- Sets the job `status='rolled_back'`, `rolled_back_at=now()`, and writes a **new** `audit_log` batch (`action='import_rollback'`) so the revert is itself audited (you can see who reverted what, when).
- **Conflict handling:** if a row was edited *after* the import (its current state ≠ the import's `after`), rollback flags it and offers *"force restore to pre-import value"* or *"skip (keep current)"* per row — never silently overwriting newer human edits.

### C.7 Audit

Every stage writes to `audit_log` (universal `before/after`, `actor`, `context`). The job page shows a full timeline: uploaded by X → mapped (3 columns remapped) → validated (6 errors) → applied by admin Y (43 rows) → reverted by Y (43 rows restored). This is the same audit surface the AI actions and the manual UI edits write to, so the catalogue has **one** unified history regardless of how a change entered.

---

## D. AI-assisted operations (Claude)

AI is a **proposal generator**, never an executor. Every AI op produces an `ai_actions` row with a `proposed_changes` diff that an admin previews and approves; on approval it **materialises as an `import_job`** and flows through the *exact same* dry-run→confirm→apply→rollback pipeline above. There is no AI fast-path that bypasses human review, and `chk_ai_approved` makes "applied without an approver" structurally impossible.

### D.0 The safety model (non-negotiable)

1. **Propose → preview → approve → apply.** Claude returns a structured diff. Nothing mutates until an admin clicks Approve. `ai_actions.status: proposed → approved → applied` (or `rejected`/`failed`).
2. **Destructive changes are double-gated.** `is_destructive=true` (soft-deletes, mass status changes to `archived`, price drops beyond a configurable threshold, rekeys) require an admin with `ai.approve` *and* a typed confirmation. Non-destructive content gen can be approved by an editor.
3. **Never auto-apply.** Even non-destructive proposals wait for a click. No scheduled/auto-approved AI mutations, ever.
4. **Full logging.** `ai_actions` stores `prompt`, `model`, `target_filter`, `proposed_changes`, approver, timestamps, and `rejected_reason`. The prompt and the raw model response are retained for audit/repro. When applied, the resulting `import_job_id` is linked, so the AI op and its concrete row changes share one audit trail.
5. **Role + rate gating.** Generating proposals needs `ai.use`; approving needs `ai.approve`. Per-org rate limits (proposals/hour, max rows/proposal) prevent a runaway "rewrite all 159 descriptions" from being one careless click — large proposals are chunked and each chunk individually previewable.
6. **Scope is explicit and shown.** Every proposal states *which rows* it touched (`target_filter`, e.g. `{vendor:'aspose'}` → "47 offerings, 230 variants") so the admin sees the blast radius before approving.

### D.1 NL bulk edits

The admin types an instruction; Claude resolves it to a concrete row set and a diff. It **never** invents which rows match — it issues a structured query (vendor/category/tag/status filter) the admin can see and tweak.

**Example 1 — "drop 10% off everything Aspose."**
Claude recognises this is a *discount*, not a base-price change, and **proposes a pricing rule, not a sheet** (it knows the B.3 distinction):
```
ai_action(kind='bulk_edit', is_destructive=false)
PROPOSAL: Create pricing_rule "Aspose −10%"
  scope_type = vendor, target = vendor:aspose (47 offerings, 230 priced variants)
  adjustment_type = percentage, adjustment_value_pct = 10.00
  audience = public, active = FALSE (ships off — you switch it on)
  floor_fraction = 0.000, priority = 100
  → POA variants unaffected (12 skipped). No base prices changed.
  Preview: from £290 → £261 ; from £870 → £783 ; …
[Approve & create rule (off)]  [Edit scope]  [Reject]
```
If the admin had said *"permanently cut Aspose list prices 10%"*, Claude instead proposes a **price-only import** (`pct_change: -10%` across 230 rows) routed through the dry-run diff — and flags `is_destructive=true` because it rewrites base prices.

**Example 2 — "set all IRIS products to draft."** (`iris` is a real vendor.)
```
ai_action(kind='bulk_edit', is_destructive=true)   // status change is destructive-ish (un-publishes live pages)
PROPOSAL: Offerings sheet, _action=upsert, status: published → draft
  target_filter = {vendor:'iris'}  → matches 9 offerings
  per-row diff shown (readiris-pdf-23-for-mac: published→draft, …)
[Approve (admin)]  [Reject]
```
On approve → an `import_job` with 9 update rows → dry-run diff → admin confirm → apply → reversible via the job's rollback token.

### D.2 Mapping a messy supplier/vendor spreadsheet

A vendor sends `Q3_pricelist_FINAL_v3.xlsx` with headers like `Item`, `Edition`, `GBP ex VAT`, `Lic`, `Min Qty`. The admin uploads it; Claude proposes a `column_mapping` into our schema:
```
ai_action(kind='mapping')
PROPOSAL column_mapping:
  "Item"        → offering_slug   (matched by fuzzy + value sampling)
  "Edition"     → license_type
  "GBP ex VAT"  → base_price       (major units; ×100 → base_price_minor; currency=GBP inferred)
  "Lic"         → name
  "Min Qty"     → min_order_qty
  UNMAPPED: "VAT%" (ignored — we store ex-VAT)   ⚠ confirm
  3 rows have non-numeric prices ("POA") → proposed as null price (POA)
```
This lands in the **same C.2 remap UI** — the admin confirms/adjusts every mapping before a single row is validated. The AI accelerates the boring part; the human owns the decision.

### D.3 Generating descriptions + SEO from sparse data

For offerings with thin copy (a `name` and a vendor, little else), Claude drafts `short_description`, `description`, and the `seo` triplet — grounded in the product's real `specs` and `platforms` so it doesn't hallucinate features.

**Prompt:** *"Write short + long descriptions and SEO for all Aspose offerings missing a description, using their existing specs and platforms. Brand voice: precise, technical, no fluff."*
```
ai_action(kind='description_gen' + 'seo_gen', is_destructive=false)
target_filter = {vendor:'aspose', description IS NULL}  → 14 offerings
PROPOSAL (per offering, side-by-side before/after):
  aspose-tex-for-c++:
    short_description: (empty) → "Typeset TeX and LaTeX to PDF, XPS and images
                                  directly from C++ — no external TeX install."
    description:       (empty) → "Aspose.TeX for C++ renders TeX/LaTeX … [grounded in its 6 specs]"
    seo.metaTitle:     → "Aspose.TeX for C++ | TeX/LaTeX to PDF Library | Greatstone"
    seo.metaDescription: → "…155 chars, keyword-aware…"
[Approve all]  [Approve per-row]  [Edit inline]  [Reject]
```
Editors (not just admins) may approve these — content gen is non-destructive. Approve → `import_job` of `update` rows → diff → apply. Every generated string is attributed in `audit_log` to the AI action, so you always know which copy was machine-drafted.

### D.4 Dedupe / cleanup

**Prompt:** *"Find duplicate or near-duplicate offerings and inconsistent tag casing across the catalogue."* Claude proposes a **non-destructive report first** (no mutation), then offers an optional cleanup proposal:
```
ai_action(kind='dedupe', is_destructive=true)
FINDINGS:
  • Possible dupes: "Aspose.PDF for .NET" vs "Aspose PDF .NET" (87% similar) → review
  • Tag casing: ".net"(12) / ".NET"(140) / "Dotnet"(3) → normalise to ".NET"
  • 5 offerings tagged both 'java' and 'Java'
PROPOSED CLEANUP (separate, opt-in):
  - Merge tag variants → ".NET" (155 offerings touched)
  - NO offering merges proposed automatically (merges are flagged for manual review)
[Approve tag-normalisation]  [Open dupes for manual review]  [Reject]
```
Offering **merges are never auto-applied** — they only ever surface as flagged-for-review, because merging is high-blast-radius and irreversible-feeling. Tag normalisation (low risk, fully reversible) can be approved and run through the pipeline.

### D.5 Summarising a price-list PDF

**Prompt:** *"Here's the new Apryse price list (PDF) — extract editions and prices into our Variants format for `apryse`."* Claude parses the PDF, emits **proposed `Variants` rows** (not a direct write), each with `base_price_minor` + `currency` + `license_type`, and **flags every low-confidence extraction** (ambiguous price, merged table cell) for human check. The output is a `Variants` sheet that drops straight into the C-pipeline dry-run — so a PDF becomes a previewable, validated, reversible import, never a blind bulk write.

### D.6 What ties it together

Every AI op above ends in the **same place**: an `ai_actions` proposal → admin preview → on approval an `import_job` → dry-run diff → confirm → transactional apply → rollback token → `audit_log`. The AI changes *how a proposal is authored* (natural language instead of hand-edited cells); it changes **nothing** about the safety, validation, reversibility, or audit guarantees. That is the whole design: one mutation pipeline, one safety gate, one audit trail — whether a change was typed into Excel, dropped as a supplier PDF, or asked for in plain English.

---

## Files referenced (all absolute)

- Real data: `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json` (159 products, 10 vendors incl. `aspose`/`iris`/`apryse`, 32 categories, 819 variants; verified: SKU `ASPOSE-230` repeats across all five `aspose-tex-for-c++` editions → composite variant key required; max price `12534195` on `aspose-html-for-java`/`ASPOSE-152` → BIGINT minor units; min `63`; `docconverter` is a real null-price/POA product; prices stored as whole-GBP units in the feed → importer ×100 to minor units).
- Handoff/contract: `/Users/johnprempeh/Desktop/Code/greatstone-homepage/CATALOG-HANDOFF.md` (confirms `pricingGroups` is the empty backend price-override slot these pricing rules fill; `inquiries`/quote-not-cart model; `fileKey` is file-name-only, `slug` is authoritative).
- Sibling chapter (source-of-truth DDL this chapter drives): the schema chapter's `import_jobs`, `import_job_rows`, `ai_actions`, `audit_log`, `pricing_rules`, `pricing_rule_targets`, `offerings`, `offering_variants`, `offering_specs`, `offering_media` — referenced, not redefined.

---

# Part 5 — Unified offerings: products + services

I now have everything grounded in real data and real Greatstone service vocabulary. Writing the chapter.

# Unified Offerings — Greatstone's Own Services in the Same System as Reseller Products

> **Chapter scope.** This answers John's direct question: *do Greatstone's own services (consulting, AI/automation engagements, the DXP assessment, Deep Dives, retainers) get a separate section, or do they live in the same system as the 159 reseller products?* This chapter does **not** redefine tables — it builds entirely on the **`offerings`** table and its children (`offering_variants`, `offering_specs`, `offering_media`, `pricing_rules`, `pricing_rule_targets`, `quotes`/`quote_items`, `import_jobs`, `ai_actions`) defined in the authoritative schema. Every `type='service'` decision is enforced by constraints already in that DDL.

---

## TL;DR — the recommendation

**Unified. One `offerings` table, `type ∈ {product, service}`. Not a separate section, not a separate subsystem.**

A Greatstone "Build the systems" engagement and an Aspose licence are the *same shape* of commercial object: a named thing with a slug, a vendor-or-not, a category, a description, a spec list, a gallery, an SEO block, one or more priced (or POA) line items, and a quote-or-buy path. The schema already encodes that equivalence with two CHECK constraints (`chk_product_has_vendor`, `chk_service_no_vendor`) and the `fulfilment_mode` switch (`license | subscription | engagement | enquiry`). Splitting services into their own table would fork *every* downstream system — pricing rules, the discount engine, bulk import/export, AI ops, the quote pipeline, audit, RLS, search — into two near-identical copies that immediately drift. The brief is explicit ("reseller PRODUCTS and Greatstone SERVICES are one system"), the data is identical in shape, and the operational cost of unification is a handful of constraints plus one JSONB escape hatch. **Build it once.**

The storefront is where products and services *feel* distinct — shared chrome, a `type` filter, and distinct **detail templates** — but that is a presentation concern over one data model, not two data models. (Full trade-off table at the end.)

---

## 1. Why services map onto `offerings` cleanly — field by field

The reseller `Product` shape (confirmed live: 159 products, fields `slug, name, vendorId, categoryId, platforms, tags, icon, gallery, shortDescription, description, specs[{label,value}], fromPrice, status, featured, variants[…], seo`) is *already* a generic offering. Here is each `offerings` column, read as a service:

| `offerings` column | Reseller product | **Greatstone service** |
|---|---|---|
| `type` | `'product'` | **`'service'`** |
| `vendor_id` | required → `vendors.aspose` etc. | **`NULL`** (forbidden by `chk_service_no_vendor`). No reseller brand owns a Greatstone engagement. *(Option B below: a single self-vendor `vendors.greatstone` — discussed and rejected.)* |
| `category_id` | `cat-conversion`, `cat-annotation`… | a **service category** in the same `categories` table: `svc-discovery`, `svc-build`, `svc-adoption` (the real "three moves"). Same table, same hierarchy, distinguished by convention/`attributes`. |
| `slug` | `docconverter` | `deep-dive`, `dxp-assessment`, `ai-automation-build`, `foundation-retainer` |
| `name` | "DocConverter" | "Discovery & DXP — Deep Dive", "AI · Automation · Integration Build" |
| `short_description` | meta line | "Find the drains before we build anything." |
| `description` | Overview body | the engagement narrative (the real services.html copy) |
| `platforms TEXT[]` | `['.NET','Java']` | repurposed as **delivery/stack tags** or left `{}`; service-specific facets live in `attributes` |
| `tags TEXT[]` | vendor+category+platforms | `['Discovery','DXP','Assessment']` — drives the same facet/search machinery |
| `fulfilment` | `license`/`subscription`/`enquiry` | **`engagement`** (project/retainer) or **`enquiry`** (POA, "Book a call"). Allowed set enforced by `chk_fulfilment_for_type`. |
| `from_price_minor` / `_currency` | cached lowest variant | cached lowest **package/day-rate** price, or **`NULL` = POA** ("Let's scope it") — identical semantics to the 13 null-price products already in the feed |
| `featured` | 12 flagship products | flagship services (Deep Dive) surface on the home page the same way |
| `attributes JSONB` | `{trial_url}` etc. | **the service escape hatch**: `{duration_weeks, delivery_mode, day_rate_minor, sla, pillars[], outcomes[], cta_mode}` |
| `seo JSONB` | `{metaTitle, metaDescription, socialImage}` | identical |
| `specs` (child table `offering_specs`) | feature checklist | **deliverables / inclusions** checklist — "8-pillar DXP assessment", "Where-the-week-goes audit", "Prioritised, costed roadmap" map 1:1 onto `[{label, value}]` |
| `variants` (child `offering_variants`) | editions/licence rows | **engagement options / packages / rate cards** (see §2) |

**The only structural differences are two booleans of intent:** a service has no vendor, and its `fulfilment` is `engagement`/`enquiry` rather than `license`. Both are already constrained in the DDL. Everything else is shared verbatim. That is the whole argument for unification in one table.

---

## 2. What a service *variant* looks like (the pricing substrate)

`offering_variants` is the numeric price substrate — 819 rows today, all reseller editions. Services reuse the **same table** with the same money discipline (`base_price_minor BIGINT` minor units + `currency`, both-or-neither via `chk_variant_price_pair`, `min_order_qty`, the `(offering_id, sku, license_type, billing_period)` upsert key). Service variants populate three patterns:

1. **Fixed package** — `billing_period = 'one_time'`, a real `base_price_minor`. *Deep Dive £2,500 → `base_price_minor = 250000`, `currency='GBP'`.* This is exactly a reseller "perpetual" variant with a different `billing_period`.
2. **Day-rate / time-and-materials** — `name = "Senior Engineer — Day Rate"`, `base_price_minor = 95000` (£950/day), `min_order_qty` used as a **minimum engagement length** (e.g. `5` = one-week floor), `billing_period = 'one_time'`. The unit is a day; the quote multiplies by estimated days. No schema change — `min_order_qty` already means "smallest sellable quantity".
3. **Retainer / subscription** — `billing_period ∈ {monthly, quarterly, annual}`, `base_price_minor` = the recurring fee. *Foundation Retainer £3,000/mo → `base_price_minor = 300000`, `billing_period = 'monthly'`.* Identical to a reseller `subscription` variant — the table already carries `billing_period` for exactly this.
4. **POA** — `base_price_minor = NULL`, `currency = NULL` (the both-null path). Renders "Scope to quote", behaves like the 13 null-price products: structurally **un-discountable** because there is no base to clamp.

`license_type` is reused as the **engagement model label** ("Fixed scope, milestone-billed" / "Retainer, rolling 30-day" / "T&M, weekly invoiced"), keeping the variant grid self-describing exactly as the reseller "Developer OEM — Single Developer" labels do. `sku` becomes a Greatstone engagement code (`GS-DEEPDIVE`, `GS-BUILD-DAY`) — and because the live feed already proves SKUs repeat across editions, the composite upsert key handles services with zero special-casing.

---

## 3. "Purchased AND/OR requested" — services use the same three CTAs as products

The brief requires offerings to be *purchased and/or requested*. Services already fit the existing quote-framed model. The driver is **`offerings.fulfilment` + `attributes.cta_mode`**, resolved at render time — no new tables:

| Intent | Mechanism (existing schema) | Example |
|---|---|---|
| **Request a quote** | A `quotes` row, `source='product_page'` (rename label only), `quote_items` snapshotting the chosen variant; `captured_price_minor` may be `NULL` (POA). Identical to the reseller flow. | "Get a proposal" on the AI Build engagement |
| **Book a call** | A `quotes` row with `metadata.type='call'` (no `quote_items` required); the existing `contact.html?type=…` deep-link pattern carries `&type=call`. The DXP/Deep Dive primary CTA. | "Book a Deep Dive" → `quotes(source='contact_form', metadata:{type:'call', offering_slug:'deep-dive'})` |
| **Buy a fixed package** | When a service has a concrete fixed-package variant, the **same quote-to-order** path the schema already models (`orders`/`order_items`, converted from a `quote`) applies. **Checkout stays out of scope** exactly as for products — no faked payment. A fixed package is "request to purchase", not a card form. | Deep Dive £2,500 → quote pre-filled with the package; sales confirms; optional `orders` conversion later |

Crucially, **the cart was the wrong model for reseller products and it is the wrong model for services too** — both are *browse-and-enquire*. Services therefore need *nothing new* here: they ride `quotes`/`quote_items`/`orders` with the same snapshotting (denormalised `offering_name`/`variant_name`/`captured_price_minor`) so a quote stays truthful even if the engagement is later re-priced or retired. The `cta_mode` in `attributes` (`quote | call | package`) is just which button is primary; all three resolve to a `quotes` row.

---

## 4. Pricing rules, bulk, and AI — services inherit them for free

This is the strongest unification payoff: **because services share `offerings` + `offering_variants`, every pricing/bulk/AI subsystem already covers them with no new code.**

### Pricing rules (`pricing_rules` + `pricing_rule_targets`)
The rule engine scopes to `all | vendor | category | offering | tier`. Services slot in immediately:
- **`scope_type='category'`** targeting `svc-build` → "15% off all build engagements this quarter" (a `pricing_rule_targets` row with `category_id = svc-build`).
- **`scope_type='offering'`** targeting the Deep Dive → a fixed `£500` introductory reduction (`adjustment_type='fixed'`, `currency='GBP'`).
- **`scope_type='tier'`** → "Partner tier: −10% on all retainers" via `audience='tier'` + `audience_tier_id`.
- **`applies_to_offering_type='service'`** → a rule that touches services but never products (or vice-versa) — the column exists precisely so a "products-only summer sale" never bleeds onto day-rates.
- **Vendor-scoped rules simply never match services** (services have `vendor_id IS NULL`), so an "Aspose −20%" rule is structurally incapable of discounting a Greatstone engagement. No guard code needed.

All the safety invariants apply unchanged: **single-winner** (lowest `priority`), **floor-clamped** (`floor_fraction`), **never negative**, **never on POA** (a `NULL` base is un-discountable), `active` defaults FALSE. A day-rate gets the *exact same* clamp logic as a software licence.

### Bulk Excel/CSV round-trip (`import_jobs` / `import_job_rows`)
Services export and re-import through the **same** pipeline: `import_type` already includes `offerings`, `variants`, `pricing`, `mixed`. A mass day-rate uplift is one spreadsheet of service variants → dry-run → `diff_summary` → admin apply → `rollback_token`. Upsert keys are identical (`offerings` on `(org_id, slug)`, variants on the composite edition key). John can bulk-edit the entire rate card in Excel the same way he bulk-edits reseller prices — one importer, not two.

### AI-assisted ops (`ai_actions`)
NL bulk edits, description/SEO generation, dedupe all operate on `offerings` rows regardless of `type`. "Claude, write SEO meta for every service offering" or "raise all retainer base prices 8%" produce an `ai_actions` proposal → human preview → admin approve (enforced by `chk_ai_approved`) → apply. Service copy generation is *more* valuable than product copy (fewer offerings, higher-touch), and it costs nothing extra because the target is the same table.

---

## 5. Storefront presentation — shared chrome, `type` filter, distinct templates

Unification at the **data** layer does **not** mean services and products look the same on the site. The presentation split is:

**Shared (one codebase):**
- The catalogue chrome, facet rail, search box, sort, family-grouping helper, and card grid (`products.html` / `catalog.js`) all read `offerings` — a service card and a product card are the same component with different field bindings.
- A **top-level `type` filter** ("Software · Services · All") plus the existing vendor/category/platform facets. Because `type` is a first-class enum column with `idx_offerings_type`, this filter is a one-line predicate, not a join.
- One search index (`search_tsv`), one SEO model, one media library.

**Distinct (template variants over one model):**
- **Product detail** keeps the editions/licence table + "from £X / Request a quote / Start a trial".
- **Service detail** uses a `type='service'` template: the engagement narrative (`description`), the **deliverables checklist** (`offering_specs` rendered as "what you get"), the **outcomes** (`attributes.outcomes` — the real "+40% efficiency / 2× value / −60% risk" payback strip), package/rate cards (`offering_variants`), and a **primary CTA driven by `attributes.cta_mode`** ("Book a Deep Dive" vs "Get a proposal").
- The template is selected by `offerings.type` — one `if` at the routing layer, not a second site.

### Routing / IA
The live convention is `/{vendor}/{slug}` for products (vendor-namespaced). Services have **no vendor**, so they route under a dedicated namespace, keeping URLs unambiguous and SEO-clean:

```
/{vendor}/{slug}        → product detail   (e.g. /aspose/total-for-net)   [type='product', vendor required]
/services/{slug}        → service detail   (e.g. /services/deep-dive)     [type='service', vendor NULL]
/catalogue?type=service → filtered listing (shared listing page)
/catalogue?type=product → filtered listing
/catalogue              → everything
```

A Laravel route (or Netlify redirect) resolves `/services/{slug}` to the service template; `/{vendor}/{slug}` resolves to the product template. Both hit `GET /api/offerings/{slug}` returning the same `Offering` resource — the front end branches on `type`. This also means the existing **Puck `ProductGrid` block** generalises to an `OfferingGrid` block with a `type?` prop, so an industry page can drop "PDF tools" *and* "our build services" from one component.

---

## 6. Four real Greatstone services, modelled in the schema

These use the **actual** Greatstone service taxonomy from `services.html` (the three moves: *Find the drains / Build the systems / Embed & scale*; the 8-pillar Digital Excellence assessment; "Book a Deep Dive"; the retainer/"we don't disappear when the invoice clears" framing).

### Service categories (in the existing `categories` table)
```sql
-- Same table as the 32 reseller categories; distinguished by slug convention + attributes.kind='service'
INSERT INTO categories (org_id, slug, name, description) VALUES
 (:org, 'svc-discovery', 'Discovery & DXP',            'Find the drains — assess where the week goes.'),
 (:org, 'svc-build',     'AI · Automation · Integration','Build the fix into how you already work.'),
 (:org, 'svc-adoption',  'Adoption & Ongoing',          'Embed & scale — training, tuning, retainer.');
```

### Offering 1 — Deep Dive (DXP assessment), fixed package, flagship, "Book a call"
```sql
INSERT INTO offerings (org_id, type, vendor_id, category_id, slug, name,
  short_description, description, tags, status, featured, fulfilment,
  from_price_minor, from_price_currency, attributes, seo)
VALUES (:org, 'service', NULL, :svc_discovery, 'deep-dive',
  'Discovery & DXP — Deep Dive',
  'Before we build anything, we find where the week actually goes.',
  'Our 8-pillar Digital Excellence assessment maps the silent leaks — the rework, the swivel-chair, the waiting — and scores you on every pillar so the plan is evidence, not opinion.',
  ARRAY['Discovery','DXP','Assessment','8-pillar'],
  'published', true, 'engagement',
  250000, 'GBP',                                   -- cached from the fixed-package variant
  '{"kind":"service","cta_mode":"call","duration_weeks":2,"delivery_mode":"remote+onsite",
    "pillars":8,"outcomes":["Where-the-week-goes audit","Pillar scorecard","Prioritised, costed roadmap"]}'::jsonb,
  '{"metaTitle":"Book a Deep Dive | Greatstone International","metaDescription":"8-pillar Digital Excellence assessment — find the silent leaks."}'::jsonb);

-- Deliverables checklist (offering_specs — the [{label,value}] shape, identical to product features)
INSERT INTO offering_specs (org_id, offering_id, label, value, sort_order) VALUES
 (:org, :deep_dive, '8-pillar DXP assessment',        '✓', 0),
 (:org, :deep_dive, 'Where-the-week-goes audit',      '✓', 1),
 (:org, :deep_dive, 'Prioritised, costed roadmap',    '✓', 2);

-- One fixed-package variant (£2,500, one-time)
INSERT INTO offering_variants (org_id, offering_id, sku, name, license_type, billing_period,
  base_price_minor, currency, min_order_qty)
VALUES (:org, :deep_dive, 'GS-DEEPDIVE', 'Deep Dive — Fixed Scope',
  'Fixed scope, milestone-billed', 'one_time', 250000, 'GBP', 1);
```

### Offering 2 — AI · Automation · Integration Build, day-rate + project, "Request a quote"
```sql
INSERT INTO offerings (org_id, type, vendor_id, category_id, slug, name,
  short_description, description, tags, status, featured, fulfilment,
  from_price_minor, from_price_currency, attributes)
VALUES (:org, 'service', NULL, :svc_build, 'ai-automation-build',
  'AI · Automation · Integration — Build the systems',
  'We build the fix into how you already work — not bolted on beside it.',
  'AI where it earns its keep, automation for the repetitive, integration so your tools finally talk. Shipped in weeks, owned by your team, measured against the hours it returns.',
  ARRAY['AI','Automation','Integration','Build'],
  'published', false, 'engagement',
  95000, 'GBP',
  '{"kind":"service","cta_mode":"quote","delivery_mode":"sprint",
    "outcomes":["AI built into the workflow","Automation for the repetitive","Integration across your stack"]}'::jsonb);

-- Two variants: a day-rate (min 5 days) AND a fixed sprint package
INSERT INTO offering_variants (org_id, offering_id, sku, name, license_type, billing_period,
  base_price_minor, currency, min_order_qty) VALUES
 (:org, :build, 'GS-BUILD-DAY',    'Senior Engineer — Day Rate', 'T&M, weekly invoiced',      'one_time', 95000,  'GBP', 5),
 (:org, :build, 'GS-BUILD-SPRINT', 'Two-Week Build Sprint',      'Fixed scope, milestone-billed','one_time', 850000, 'GBP', 1);
```

### Offering 3 — Foundation Retainer (Embed & scale), subscription
```sql
INSERT INTO offerings (org_id, type, vendor_id, category_id, slug, name,
  short_description, description, tags, status, fulfilment, from_price_minor, from_price_currency, attributes)
VALUES (:org, 'service', NULL, :svc_adoption, 'foundation-retainer',
  'Adoption & Ongoing — Embed & scale',
  'A system nobody uses saves nobody time. We stay on as your foundation.',
  'We train your people, drive real adoption, and stay on — tuning, extending and scaling what works. Embedded, not advisory. We don''t disappear when the invoice clears.',
  ARRAY['Adoption','Retainer','Support','Training'],
  'published', 'subscription',                       -- service may use subscription per chk_fulfilment_for_type
  300000, 'GBP',
  '{"kind":"service","cta_mode":"quote","sla":"next-business-day","commitment":"rolling 30-day",
    "outcomes":["Training & real adoption","Ongoing tuning & support","Scale what works, retire what doesn''t"]}'::jsonb);

INSERT INTO offering_variants (org_id, offering_id, sku, name, license_type, billing_period,
  base_price_minor, currency, min_order_qty) VALUES
 (:org, :retainer, 'GS-RETAIN-S', 'Foundation — Monthly', 'Retainer, rolling 30-day', 'monthly', 300000, 'GBP', 1),
 (:org, :retainer, 'GS-RETAIN-A', 'Foundation — Annual',  'Retainer, 12-month',       'annual', 3240000, 'GBP', 1);  -- 10% prepay
```

### Offering 4 — Bespoke Transformation Programme, POA, "Book a call"
```sql
-- The enterprise, scope-to-quote engagement: NULL price = POA, structurally un-discountable.
INSERT INTO offerings (org_id, type, vendor_id, category_id, slug, name,
  short_description, description, tags, status, fulfilment, from_price_minor, from_price_currency, attributes)
VALUES (:org, 'service', NULL, :svc_build, 'transformation-programme',
  'Full-Spectrum Transformation Programme',
  'Start with the problem. Then pick the tool.',
  'We diagnose what is actually costing you hours, then choose from the full spectrum — AI, automation, integration, or simply a better process — and use only what fits.',
  ARRAY['Transformation','Programme','Full-spectrum'],
  'published', 'enquiry',
  NULL, NULL,                                        -- POA: both-null, behaves like the 13 null-price products
  '{"kind":"service","cta_mode":"call","delivery_mode":"programme"}'::jsonb);
-- No priced variant, or a single POA variant (base_price_minor NULL). Renders "Scope to quote".
```

**What these four demonstrate, against the schema:** a fixed package (Deep Dive), a day-rate with a minimum (Build), a subscription/retainer (Foundation), and a POA programme — **all four use `type='service'`, `vendor_id IS NULL`, the existing `fulfilment` enum, the existing `billing_period` enum, real BIGINT minor-unit prices, `offering_specs` for deliverables, and `attributes` JSONB for service-only fields** — without a single new column or table. A pricing rule on `category='svc-adoption'` discounts the retainer; the same rule cannot touch the POA programme (NULL base) or the reseller catalogue (different category). That is the unified model working end to end.

---

## 7. Recommendation and trade-offs

### Recommendation: **Unified — `type='service'` in `offerings`. Do not build a separate services section.**

### The decision that *was* live and is now settled: self-vendor vs no-vendor
There were two ways to model "a service has no reseller brand":
- **Option A (chosen): `vendor_id = NULL`.** Enforced by `chk_service_no_vendor`. Vendor-scoped pricing rules *cannot* match services (clean separation), and the storefront vendor facet naturally excludes services.
- **Option B (rejected): a single `vendors.greatstone` self-vendor.** Tempting for a uniform "every offering has a vendor" invariant, but it pollutes the vendor facet with a fake brand, lets a careless vendor-scoped rule accidentally hit services, and adds a meaningless logo wall entry. The `NULL` path is cleaner and is what the constraint already enforces.

### Trade-off table

| Dimension | **Unified (recommended)** | Separate services subsystem |
|---|---|---|
| **Pricing/discount engine** | One engine; services get scoping, single-winner, floor-clamp, POA-safety **free** | Fork or re-implement; rules can't span both; drift risk on the most safety-critical code |
| **Bulk import/export** | One round-trip (`import_type` already covers offerings/variants/pricing) | Second importer + second mapping + second rollback path |
| **AI ops** | One target (`offerings`); SEO/description/bulk-edit cover services automatically | Second `ai_actions` integration |
| **Quotes / cross-sell** | A single quote can mix a licence **and** a build engagement (`quote_items` → any offering) — the actual Greatstone sale | Two quote pipelines; can't combine product + service on one enquiry |
| **Storefront** | Shared chrome + `type` filter + template branch (one `if`) | Two sites to keep visually consistent |
| **Search / SEO / media / audit / RLS** | One index, one model, one trail | Duplicated everywhere |
| **Schema cost of unification** | 2 CHECK constraints + 1 JSONB column (`attributes`) already in the DDL | "Avoided" — but re-paid as duplicated subsystems |
| **Risk** | Services and products *can* be confused if `type` isn't filtered — mitigated by the enum + indexes + template split | Guaranteed divergence between two codebases over time |
| **Backend-agnostic contract** | One contract for the agency's Laravel **and** an interim Supabase to implement/evaluate against | Two contracts |

**The single cited reason it wins:** the *only* thing services and products don't share is "has a vendor" and "is licensed vs delivered" — both already constrained. Everything expensive (pricing, bulk, AI, quotes, search, audit, tenancy) is shared by construction. A separate section would re-pay all of that cost for zero data-model benefit, and the highest-value Greatstone sale — *a reseller licence bundled with the build engagement that deploys it* — is only expressible if both live in one `offerings`/`quote_items` graph.

---

## Files referenced (all absolute)
- Real catalogue data: `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json` — confirmed 159 products, 10 vendors, 32 categories, **819 variants** (min £63 = `6300`, max `12534195` = ~£125k, validating BIGINT minor units), 13 null-price (POA), 12 featured, specs `[{label,value}]`, seo `{metaTitle,metaDescription,socialImage}`.
- Handoff / backend mapping: `/Users/johnprempeh/Desktop/Code/greatstone-homepage/CATALOG-HANDOFF.md` — confirms the quote-based CTA model (`contact.html?…&type=quote|trial`), `inquiries` table intent, and the `ProductGrid` Puck block (which this chapter generalises to `OfferingGrid`).
- Real Greatstone service vocabulary used in the modelled examples: `/Users/johnprempeh/Desktop/Code/greatstone-homepage/services.html` (the three moves — *Find the drains / Build the systems / Embed & scale*, the 8-pillar Digital Excellence assessment, "Book a Deep Dive", retainer framing, the "+40% / 2× / −60%" payback strip), with corroborating taxonomy in `method.html` and `climb.html`.
- Schema source of truth: the authoritative `offerings`, `offering_variants`, `offering_specs`, `pricing_rules`, `pricing_rule_targets`, `quotes`/`quote_items`, `orders`/`order_items`, `import_jobs`, `ai_actions` tables and their CHECK constraints (`chk_product_has_vendor`, `chk_service_no_vendor`, `chk_fulfilment_for_type`, `chk_variant_price_pair`, `chk_ai_approved`) — cited, not redefined.

---

# Part 6 — CMS application UX

I have everything I need: the real data, the existing studio architecture and class vocabulary, the launcher design, and all the defects the new UX must fix. I'll now write the CMS Application UX chapter — exhaustive, concrete, grounded in the authoritative schema (citing its tables), the existing `gs-*` patterns, and the real 159-product / 819-variant / 10-vendor / 32-category catalogue.

# CMS Application UX — The Greatstone Studio Admin Experience

> **Scope.** This chapter designs the admin experience for the Greatstone International unified-offerings platform: every screen a non-technical operator touches, from post-login landing to bulk import to AI-assisted edits. It is the human face of the authoritative Postgres schema — every field, action, and state below resolves to a table in that schema (cited as `offerings`, `offering_variants`, `pricing_rules`, `import_jobs`, `ai_actions`, `quotes`, etc.) and to a permission in `role_permissions` / `permissions`. It builds on the **existing Puck studio** (`StudioPanel`, `OverviewPanel`, the `gs-*` class vocabulary, the `mode='home'` launcher), reuses those patterns verbatim where they hold, and replaces them precisely where the prior assessments proved them unfit for a real 159-product / 819-variant catalogue.

---

## 0. Design principles (the contract every screen honours)

These ten principles are the rubric. Each subsequent section states explicitly how it satisfies them.

1. **Land on a task, never a canvas.** Login routes edit-capable users to a launcher (`mode='home'`), not the editor and not the public site. The Puck page editor is *one tile among many*, not the default — fixing the prior "dumped into the editor / dumped onto the public site" defect.
2. **One object, one editor, one schema.** Products and services are the same `offerings` row with `type ∈ {product, service}`; the editor is one form whose type-specific fields appear/hide on the `type` toggle. The operator learns one screen.
3. **Money is never free text.** Every price field is a currency-aware minor-units input (`offering_variants.base_price_minor` + `currency`), rendering `£696.00` while storing `69600`. The `'From £870'`-string disease is structurally impossible — there is no string price field to type into. `NULL` price is a deliberate **"Contact for licence / POA"** choice, never an empty box.
4. **Dangerous states are unreachable, not just discouraged.** A pricing rule cannot drive a price negative (the engine clamps to `floor_fraction × base ≥ 0`, mirroring the `CHECK` constraints); a new rule ships `active = false`; publish/import-apply/role-change are gated behind `permissions` and visibly disabled (not hidden) for users who lack them, with a tooltip explaining why.
5. **Preview before commit, everywhere it matters.** Pricing rules show live before/after on real affected offerings ("Affects 86 offerings. Aspose.Cells £870 → £696"). Imports show a dry-run diff. AI actions show a proposed diff. Nothing destructive applies without a human seeing the result first.
6. **Scale to 200+ by default.** Every list is searched, filtered, sorted, paginated/virtualised, and bulk-selectable. No screen renders all 159 offerings (or all 819 variants) as one unpaginated DOM tree. The Aspose vendor alone (86 offerings) must be filterable to in two keystrokes.
7. **Draft → review → publish is one consistent ritual.** Catalogue entities use `status` + `published_at`; pages use `draft_data`/`published_data`. The *same* status pill, the *same* publish banner, and the *same* "N items need attention" attention math appear on every surface, so the operator learns the workflow once.
8. **Every change is reversible and attributed.** Soft-delete (`deleted_at`) means delete is undoable; `audit_log` + `row_version` mean every edit is attributed and concurrency-safe; imports carry a `rollback_token` for one-click revert; `page_versions` gives point-in-time restore.
9. **Accessible by construction.** Reusing the studio's existing a11y conventions (`role="dialog"`/`role="tab"`/`aria-selected`, `title`+`aria-label` on every icon button, keyboard-first command palette, `is-active`/`is-warn`/`is-current` state classes), extended with the new patterns below (`aria-live` for async results, focus traps for wizards, `aria-busy` for loading).
10. **The keyboard is a peer to the mouse.** ⌘K command palette reaches every action; every list is arrow-navigable; every wizard advances on Enter and retreats on Esc/Back.

**Class-vocabulary reuse.** The studio already owns a working visual language (mapped in the studio-panels analysis): `gs-panel` / `gs-panel-head` / `gs-panel-body` shell, `gs-ov-tiles` / `gs-ov-tile` / `is-warn` stat tiles, `gs-studio-tab` / `gs-studio-tabbadge` rail, `gs-page-status gs-st-{status}` + `gs-dot` pills, `gs-pagefilter` filter bars, `gs-btn ghost sm` buttons, `gs-versions` timelines, `gs-empty` empty states, the `when(ts)` relative-time helper, and the `gs-cmd` command-palette overlay. **New screens extend this vocabulary; they do not invent a parallel one.** New classes below are namespaced consistently (`gs-off-*` offerings, `gs-rule-*` pricing, `gs-imp-*` import, `gs-ai-*` assist, `gs-q-*` quotes, `gs-media-*`, `gs-vendor-*`, `gs-team-*`).

---

## 1. Post-login Dashboard / "Choose your task" home

**Purpose.** Answer one question the instant an operator signs in: *what do you want to do?* It is a full-screen launcher (`StudioHome`, `mode='home'`), not a side panel — the standalone sibling of the embedded `OverviewPanel` `home` tab, sharing its stat math via an extracted `overviewStats()` helper so the two can never disagree.

### 1.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Greatstone Studio · Greatstone International        ⌘K Search   View live ↗  ⏻│  ← gs-home-bar
│  Signed in as John Prempeh · admin                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⚠ 3 items need attention — 2 offerings have unpublished price changes,        │  ← gs-home-attn (only if attention.total>0)
│    1 import is awaiting your approval   →  Review                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  QUICK STATS  (each tile is a door)                                            │  ← gs-ov-tiles gs-home-stats
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│  │  147   │ │   8    │ │   2 ⚠  │ │  159   │ │  12 ⚠  │ │   5    │            │
│  │ Live   │ │ In     │ │ Unpub. │ │ Offer- │ │ Open   │ │ Team   │            │
│  │ pages  │ │ review │ │ pricing│ │ ings   │ │ quotes │ │        │            │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘            │
├──────────────────────────────────────────────────┬───────────────────────────┤
│  WHAT DO YOU WANT TO DO?      (gs-home-tools)     │  RECENT CHANGES           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │  (gs-ov-recent)           │
│  │ ▤        │ │ £        │ │ ⇪        │           │  • Aspose Summer Sale     │
│  │ Offerings│ │ Pricing &│ │ Bulk     │           │    published · 2 h ago    │
│  │ 159      │ │ discounts│ │ import   │           │    · John                 │
│  └──────────┘ └──────────┘ └──────────┘           │  • Imported 17 variants   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │    · yesterday · Priya    │
│  │ ✦ AI     │ │ ◳ Media  │ │ ⊞ Content│           │  • IronPDF SEO updated    │
│  │ assist   │ │ library  │ │ pages    │           │    · yesterday · John     │
│  └──────────┘ └──────────┘ └──────────┘           │                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │                           │
│  │ ✉ Quotes │ │ ⌂ Vendors│ │ ⚇ Team   │           │                           │
│  │ inbox 12⚠│ │ & cats   │ │ & roles  │           │                           │
│  └──────────┘ └──────────┘ └──────────┘           │                           │
│  ┌──────────┐                                      │                           │
│  │ ↗ View   │                                      │                           │
│  │ live site│                                      │                           │
│  └──────────┘                                      │                           │
└──────────────────────────────────────────────────┴───────────────────────────┘
```

A centred max-width column. Tools render in a responsive grid (`repeat(auto-fit, minmax(160px, 1fr))`); the right rail (`gs-home-recent`) collapses below the grid under ~720px.

### 1.2 The tile inventory — every tile is a door

Each tile is a single click landing the operator *directly* in the right tool. The launcher answers the brief's required set:

| Tile | Routes to | Badge / warn source | Permission gate |
|---|---|---|---|
| **Offerings** | Offerings Manager (§2) | `is-warn` when any offering has `status≠published` drift | `offering.read` |
| **Pricing & discounts** | Pricing-Rules Manager (§3) | `is-warn` when any `pricing_rules` row drifted/unpublished | `pricing.read` |
| **Bulk import** | Import Wizard (§4) | badge = `import_jobs` in status `validated` awaiting apply, or `applied` awaiting review | `import.apply` to act |
| **AI assist** | AI console (§5) | badge = `ai_actions` in status `proposed` awaiting approval | `ai.use`; approve needs `ai.approve` |
| **Media library** | Media library (§7) | — | `media.read` |
| **Content pages** | Pages list → Puck editor (§10) | badge = pages needing release action | `page.read` |
| **Quotes inbox** | Quotes inbox (§6) | badge = `quotes` in status `new` | `quote.read` |
| **Vendors & categories** | Vendors/Categories managers (§8) | `is-warn` when a vendor has no logo | `vendor.read` |
| **Team & roles** | Team/Roles manager (§9) | badge = pending invites | **admin-only** (`user.manage`); tile hidden otherwise |
| **View live site** | Public homepage (`mode='view'`) | — | always present |

The six **quick-stat tiles** (Live pages, In review, Unpublished pricing, Offerings, Open quotes, Team) are themselves clickable, routing to the corresponding manager — eliminating the prior "dead-end stats" defect. Stat math is derived from the same store props every manager reads, so the dashboard can never show a number a manager contradicts.

### 1.3 States

- **Loading.** Tiles render immediately with skeleton numbers (`gs-ov-tile` with an `aria-busy="true"` shimmer on `<b>`); the launcher is usable before stats resolve. Tools never block on stats.
- **Empty / fresh org.** First-run shows a one-line guided banner above the grid: *"Your catalogue is empty. Start with Bulk import to load offerings, or add one by hand in Offerings."* The two named tiles get a subtle `is-primary` ring. Recent-changes rail shows `gs-empty`: *"Nothing logged yet."*
- **Error.** If a stat source fails, that single tile shows `—` with a `title="Couldn't load — click to retry"` rather than a zero (a false zero is worse than an honest dash). The launcher itself never fails to render.
- **Attention banner** (`gs-home-attn`) appears only when `attention.total > 0`, aggregating across surfaces (unpublished pricing, pending imports, quotes awaiting triage, pages in review, AI proposals awaiting approval) and using the *role-gated* counts — an editor never sees "2 invites need attention" for a Team panel they can't open.

### 1.4 Accessibility & scale

`role="main"` + `aria-label="Studio home"`; the tool grid is a `role="list"` of `role="listitem"` buttons, each with an `aria-label` combining label + hint + badge ("Quotes inbox, 12 new"). Tab order: bar → attention banner → stat tiles → tool grid → recent. ⌘K opens the palette from here (un-gated in `home` mode). At scale the dashboard cost is O(1) — fixed tiles, five aggregate counts, five recent rows — regardless of catalogue size.

---

## 2. Offerings Manager

This is the heart, and the screen the prior assessment proved was "not even close" today (a flat unpaginated `<ul>` of 159 self-`useState`-ing rows, no search, no filter, no variants, string prices, vendor==category). It is rebuilt as a **list + detail** workspace over the `offerings` table and its children (`offering_variants`, `offering_specs`, `offering_media`).

### 2.1 List view — layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Offerings  (159)                                  + New offering ▾   ⇪ Import │  ← head; ▾ = product | service
├──────────────────────────────────────────────────────────────────────────────┤
│  🔍 Search name, slug, SKU…    Type:[All▾] Vendor:[All▾] Category:[All▾]       │  ← gs-off-toolbar
│                                Status:[All▾]  Price:[Any▾]  Sort:[Name A–Z▾]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ☐  Showing 1–25 of 86 (filtered: Vendor = Aspose)        [Clear filters]      │  ← gs-off-count + chips
├──────────────────────────────────────────────────────────────────────────────┤
│  ☐ │▤│ Aspose.Cells for .NET    Aspose · Spreadsheets  ● Published  from £870  │  ← gs-off-row
│  ☑ │▤│ Aspose.PDF for C++       Aspose · PDF           ● Published  from £509  │
│  ☐ │▤│ Aspose.Total Product…    Aspose · Bundle        ● Published  POA        │
│  ☐ │▤│ GroupDocs.Viewer .NET    GroupDocs · Viewer     ○ Draft      from £1,199│
│  …                                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  2 selected ▸  Set status ▾   Assign category ▾   Apply pricing rule ▾         │  ← gs-off-bulkbar (appears on select)
│                Export selection ⇩   Feature ⚑   Delete ⌫                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  ‹ Prev   1  2  3  4   Next ›                              25 per page ▾        │  ← gs-off-pager
└──────────────────────────────────────────────────────────────────────────────┘
```

**Each row** (`gs-off-row`) shows: select checkbox; a thumbnail from `offering_media`/`primary_image_id` (or a vendor-tinted placeholder); name (links to detail, `· editing` if open); vendor · category eyebrow (the *two distinct axes* the old model couldn't represent — `vendor_id` and `category_id`); a status pill (`gs-st-{published|draft|archived}` reusing the existing pill component); the cached `from_price_minor` rendered as `from £870` (or **POA** when `NULL`); and a type glyph distinguishing product (▤) from service (◆).

### 2.2 Search, filter, sort — built for 200+

- **Search** (debounced): server-side `ILIKE`/`pg_trgm` on name + slug + variant SKU + tags (`idx_offerings_name_trgm`, `idx_offerings_search`). The Aspose-at-86 problem is solved: type "iron" → IronPDF in one keystroke.
- **Filters** (each a count-annotated dropdown, reusing the `gs-pagefilter-n` count badge): **Type** (product/service), **Vendor** (10, with per-vendor counts: "Aspose (86)"), **Category** (32, hierarchy-aware via `parent_id`), **Status** (draft/published/archived), **Price** (Has price / POA / In a sale). Active filters render as removable chips with a **Clear filters** affordance.
- **Sort**: Name A–Z, Recently edited (`updated_at`), Price low→high / high→low (on cached `from_price_minor`, NULLs last), Vendor, Status. Default: Recently edited (the working operator's most useful default).
- **Pagination**: 25/50/100 per page, server-side `LIMIT/OFFSET` (or keyset) — never all 159 in the DOM. The count line always states "Showing 1–25 of 86" so the operator never loses their place.

### 2.3 Bulk-select + bulk actions

Selecting any row reveals the **bulk bar** (`gs-off-bulkbar`). A header "select-all" checkbox offers *select-all-on-page* and *select-all-N-matching-the-filter* (so "select all 86 Aspose" is one click). Bulk actions, each writing through `audit_log` with a shared batch token for one-click undo:

- **Set status** → draft / published / archived (publish gated on `offering.publish`; a confirmation states "Publish 86 offerings live?").
- **Assign category** → pick one of 32; updates `category_id` on all selected.
- **Apply pricing rule** → attaches the selection as `pricing_rule_targets` of `scope_type='offering'` for an existing or new rule; deep-links into the Pricing Manager (§3) pre-scoped.
- **Feature / unfeature** → toggles `featured`.
- **Export selection** → CSV/XLSX in the importer's round-trip schema (§4), so "export → edit in Excel → re-import" is a closed loop on exactly the rows you chose.
- **Delete** → soft-delete (`deleted_at`); confirmation shows impact ("3 offerings will be hidden; they remain on past quotes and can be restored").

Bulk operations run as a single transaction with a progress toast (`aria-live="polite"`: "Updated 86 of 86") and an **Undo** affordance for 10 seconds, backed by the audit batch.

### 2.4 The offering editor

Opens as a focused full-height panel (the `gs-panel` shell, wider than the rail) with a **sticky header** (name, status pill, **Save** / **Save & publish** / discard) and a **dirty guard** — replacing the prior silent commit-on-blur data-loss trap with explicit save and an "unsaved changes" prompt on close/navigate. Optimistic concurrency via `row_version`: if another operator saved meanwhile, the save surfaces "This offering changed since you opened it — review and merge" rather than silently overwriting.

The editor is **one form for products and services**, organised in sections (tab strip or scroll-spy anchors):

**(a) Basics**
- **Type** — segmented `Product | Service` (`offerings.type`). Switching reveals/hides the vendor selector and reshapes `fulfilment` options — enforcing the schema's `chk_product_has_vendor` / `chk_service_no_vendor` invariants in the UI so an invalid combination can't be saved.
- **Name** (required), **Slug** (auto-from-name, editable, live uniqueness check against `(org_id, slug)`), **Short description** (`short_description` — the listing/meta line), **Description** (rich text — the overview body).
- **Vendor** selector (`vendor_id`) — *required for products, hidden for services*. Searchable single-select over the 10 vendors with logos.
- **Category** selector (`category_id`) — a *separate* control, searchable over 32 categories, hierarchy-aware. The two-axis taxonomy the old single `<select>` couldn't hold.
- **Fulfilment** (`fulfilment_mode`) — license/subscription/enquiry for products; engagement/enquiry/subscription for services. Options constrained by type per `chk_fulfilment_for_type`.
- **Featured** toggle (`featured`) and **Status** (`status`).

**(b) Variants / editions** — the sub-table the old model entirely lacked, over `offering_variants` (819 rows live; IronPDF alone has 10 editions £509–£4,753):

```
  Variants (10)                                                    + Add variant
  ┌────────────────────────────────────────────────────────────────────────────┐
  │ SKU         Name              Licence type         Billing     Price    MOQ │
  │ ASPOSE-230  Developer, C++    Developer OEM…        Perpetual   £509.00   1  │ ✎ ⌫
  │ ASPOSE-231  Site OEM, C++     Site OEM…             Perpetual £4,753.00   1  │ ✎ ⌫
  │ …                                                                           │
  │ + new       [SKU] [Name]      [Licence…]   [Period▾] [£ price] [MOQ] [add]  │
  └────────────────────────────────────────────────────────────────────────────┘
  Lowest active price (from_price): £509.00  ·  recomputed from variants
```

Each variant row edits `sku`, `name`, `license_type`, `billing_period`, `base_price_minor` + `currency`, `min_order_qty`, `list_discount_pct`. **Price is a minor-units money input** — typing `509` and tabbing renders `£509.00`, stored `50900`; clearing it sets **POA** (NULL price + NULL currency, the both-or-neither pair). The editor recomputes and displays the cached `from_price_minor` ("Lowest active price: £509.00") so the operator sees the listing price update as they edit. Variant uniqueness `(offering_id, sku, license_type, billing_period)` is the same key the importer upserts on, so hand-edits and imports converge.

**(c) Specs** — over `offering_specs`, replacing the lossy newline `features` textarea (IronPDF has 24 `{label, value}` rows the old textarea flattened):

```
  Specifications (24)                                              + Add spec
  ⠿ Load TeX source files from disk            ✓                   ✎ ⌫
  ⠿ Convert TeX to PDF                         ✓                   ✎ ⌫
  ⠿ Output resolution                          Up to 600 DPI       ✎ ⌫
```

A drag-reorderable (`sort_order`) label/value table; value defaults to `✓` but accepts real values. Drag handle `⠿` is keyboard-operable (focus + arrow to move, `aria-grabbed`).

**(d) Media** — gallery management over `offering_media` (the old model had one image, set one at a time): a primary-image picker (`primary_image_id`) plus an ordered gallery (drag-reorder, `sort_order`), each item drawn from the Media Library (§7) with an alt-text field defaulting from the offering name (killing the 159-blank-alt-text accessibility debt).

**(e) Platforms & tags** — `platforms[]` and `tags[]` as token/chip inputs with autocomplete over the existing value universe (.NET·47, Java·35, …), backed by the GIN-indexed array columns.

**(f) SEO** — `seo` JSONB: `metaTitle`, `metaDescription` (with live length meters), `socialImage` (Media picker). A collapsed live SERP/social preview.

**(g) Service-specific** — when `type='service'`, an **Engagement details** section surfaces `attributes` JSONB fields (e.g. duration, delivery mode, deliverables) instead of vendor/variants-as-licences — same form, type-appropriate fields.

### 2.5 States & accessibility

- **Loading**: list shows 10 skeleton rows (`aria-busy`); editor shows section skeletons.
- **Empty**: `gs-empty` — *"No offerings match these filters."* with **Clear filters**; truly-empty catalogue prompts **Bulk import** or **New offering**.
- **Error**: a non-blocking banner with **Retry**; failed save keeps the form dirty and focused on the offending field, with the server validation message inline (e.g. "Slug already used by aspose-pdf").
- **A11y**: list is a `role="grid"` with header `role="row"`/`columnheader`; rows arrow-navigable; bulk bar announces selection count via `aria-live`; the editor is `role="dialog"` + `aria-label`, focus-trapped, Esc closes with the dirty guard. Every icon action (`✎ ⌫ ⠿ ⚑`) carries `title` + `aria-label`.
- **Scale**: every query is server-paginated and indexed; the editor mounts *one* offering, not 159; variant/spec sub-tables paginate past ~50 rows. The screen is O(page), not O(catalogue).

---

## 3. Pricing-Rules Manager

A first-class panel sibling to Offerings (not buried inside it — a vendor rule touches 86 offerings, so it is cross-cutting), over `pricing_rules` + `pricing_rule_targets`. The prior assessment proved *none* of the four asks were possible today; this screen makes all four a guided, preview-first, single-winner-safe flow.

### 3.1 Layout — rule list

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Pricing & discounts  (3)            Preview as: [Public ▾]        + Add rule  │
│  Pricing changes: ● Live  /  ⚠ Unpublished (2)        [Discard]  [Publish ▸]   │  ← reuses publish-gate banner
├──────────────────────────────────────────────────────────────────────────────┤
│ ● Aspose Summer Sale      −20%   Vendor: Aspose          Active · ends 1 Sep   │
│   Affects 86 offerings · Aspose.Cells £870→£696                       ✎  ⌫     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ○ PDF category clearance  −£100  Category: PDF           Scheduled · 1 Jul →   │
│   Affects 21 offerings · IronPDF £509→£409                            ✎  ⌫     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ◐ Enterprise tier list    −15%   All · Tier: Enterprise  Tier · preview only   │
│   Applied server-side to Enterprise customers                        ✎  ⌫     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Status dot encodes live state: **●** live now (active + in schedule window), **○** scheduled/inactive, **◐** tier (audience-scoped, applied server-side). Each rule shows adjustment, scope summary, schedule, a live **affected count**, and a sample before→after.

### 3.2 Rule editor (expand-in-place) — the four asks, one shape

Over `pricing_rules`, with targets in `pricing_rule_targets`:

- **Name** (`name`) and **Active** toggle (`active`, defaults **off** — a new rule never silently goes live).
- **Scope** — radio `All / Vendor / Category / Specific offerings / Customer tier` (`scope_type`). When not "all," a searchable multi-select of the relevant entities populates `pricing_rule_targets` (real FKs, so deleting a vendor cleanly cascades its rule targets). An optional `applies_to_offering_type` narrows to products or services only.
  - *20% off all Aspose* → scope Vendor = Aspose.
  - *£100 off a category* → scope Category = PDF.
  - *Time-boxed site-wide sale* → scope All + schedule.
  - *Per-tier price list* → scope Tier = Enterprise (audience='tier').
- **Adjustment** — segmented `% off | £ off` (`adjustment_type`) + value (`adjustment_value_pct` for percentage, minor-units `adjustment_value` + currency for fixed). Always a reduction.
- **Schedule** — `starts_at` / `ends_at` date-time pickers (open-ended allowed); the `ends_at > starts_at` rule is enforced inline (`chk_rule_schedule`).
- **Audience** — `Public` or a **customer tier** picker (`audience` + `audience_tier_id`).
- **Priority** (`priority`, lower wins) and **Floor** (`floor_fraction`, e.g. "never below 50% of base") — surfaced as plain language: *"If two rules overlap, the lower priority number wins. Prices never fall below 50% of list."*
- **Public label** (`label`) — the badge text ("Offer" / "Preferred pricing"), with a brand-aware note that loud "20% OFF" flags are a positioning choice on an enquire-framed site.

### 3.3 Live before/after preview + "preview as tier" — the signature feature

As the operator edits scope/adjustment, a **live preview strip** computes against the *real* catalogue through the single pricing-compute function (single-winner, floor-clamped, POA-safe):

```
  ▸ Affects 86 offerings.   Sample:
     Aspose.Cells for .NET   £870.00  →  £696.00   (−£174.00)
     Aspose.Total Product…   POA      →  POA        (not discounted — no base price)
     Aspose.PDF for C++      £509.00  →  £407.20    (−£101.80)
  ▸ Preview as: [ Enterprise ▾ ]   recomputes affected-count + samples for that tier
```

The **affected count** updates live (resolving `pricing_rule_targets` against `offerings`). The **"Preview as" dropdown** lets the operator see exactly what a Public visitor vs. an Enterprise-tier customer would see — the brief's explicit requirement. POA/`NULL`-price offerings are shown as structurally un-discountable (no base to clamp), making the floor/skip behaviour visible, not magic.

### 3.4 Safety, publish, states

- **Single-winner, never-negative, floor-clamped** is shown, not just enforced: a warning chip appears if a rule's settings would clamp many offerings to the floor ("12 offerings would hit the price floor"), prompting a sanity check.
- **Publish** reuses the catalogue publish gate — pricing changes promote atomically with the catalogue under one **admin-only** publish button (`pricing.publish`), one `audit_log` entry. Until published, no visitor sees the change; **Discard** reverts the draft.
- **Empty**: `gs-empty` — *"No pricing rules yet. Add one to run a sale or set tier pricing."*
- **Loading/Error**: preview strip shows `aria-busy` while recomputing; a compute error shows "Couldn't preview — check scope" without blocking the save.
- **A11y**: the segmented controls are a `radiogroup`; preview strip is `aria-live="polite"` so screen-reader users hear the affected count change; the "would hit floor" warning is `role="alert"`.
- **Scale**: affected-count and samples are computed server-side over indexed `pricing_rule_targets`; the operator never waits on a client-side scan of 159 offerings.

---

## 4. Bulk Import Wizard

The single most load-bearing missing feature (the prior assessment: "without this, nothing else matters" — there is no door for the 159 now or the ~200 from the vendor feed). A linear, reversible wizard over `import_jobs` + `import_job_rows`, with the round-trip the brief demands: **export → bulk-edit in Excel → re-import as updates**, dry-run + diff + validation + rollback + audit + idempotent upsert keyed on stable slug/sku.

### 4.1 The five steps

```
  Upload ──▶ Map columns ──▶ Validate ──▶ Dry-run diff ──▶ Confirm ──▶ [Result/Rollback]
   ①            ②              ③             ④               ⑤
```

A persistent step rail (`gs-imp-steps`) shows progress; **Back** is always available, **Next** is gated on the current step passing.

**① Upload.** Drag-drop or pick a `.csv` / `.xlsx`. Choose **import type** (`import_type`: offerings / variants / pricing / vendors / categories / mixed). A `source_checksum` is computed; if an identical file was already applied, the wizard warns ("This exact file was imported 2 h ago — re-importing will be a no-op for unchanged rows") — idempotency surfaced. A **Download template** / **Export current catalogue** link seeds the round-trip with correctly-shaped columns (the same schema the Offerings bulk-export emits).

**② Map columns.** A two-column mapper: each spreadsheet header on the left, a target schema field dropdown on the right (`column_mapping` JSONB). Messy headers ("Product Title", "Cost £") are **AI-suggested** mappings (proposed → operator confirms — never silently applied), with confidence shown. Unmapped columns are explicitly "Ignore." The **upsert key** is highlighted: offerings on `slug`, variants on `(slug, sku, license_type, billing_period)` — so the operator understands what "update vs insert" hinges on.

**③ Validate.** Per-row validation runs server-side; results render as a summary + an errors-first table (`import_job_rows.errors`):

```
  Validation:  ✓ 142 valid    ⚠ 0 warnings    ✗ 17 errors
  Row 14  ✗  Vendor "Aspos" not found (did you mean "Aspose"?)
  Row 22  ✗  Price "from £870" — must be a number (got text)
  Row 31  ⚠  Slug "aspose-pdf" already exists → will UPDATE
```

Money parsing rejects free-text strings ("from £870" → error), enforcing numeric minor-units at the door. The operator can **download the error rows** to fix in Excel and re-upload, or fix inline for small counts.

**④ Dry-run diff.** The decisive safety gate — *nothing has been written*. A summary plus a per-row before/after diff (`import_job_rows.before/after`, `diff_summary`):

```
  Dry run (no changes made yet):
     ▸ 142 insert    ▸ 17 update    ▸ 0 delete    ▸ 142 no-op
     By entity: offerings 110 · variants 49
  Row 31  UPDATE  Aspose.PDF for .NET
     fromPrice   £870.00  →  £799.00
     status      draft    →  published
  Row 88  INSERT  GroupDocs.Signature for Java   (new)
```

Filter the diff by action (insert/update/delete/error). This is where the operator catches "why is everything being deleted?" before it happens.

**⑤ Confirm.** A final summary and an explicit **Apply 159 changes** button, gated on `import.apply`. Apply runs in a transaction in FK order (vendors → categories → offerings → variants), idempotent upsert on the stable keys, every row written to `audit_log` under one `rollback_token`. A progress bar (`aria-busy`, `aria-live` count) reports "Applied 142 of 159."

**Result / Rollback.** On completion: *"Imported 142 new, updated 17, 0 deleted."* with **View affected offerings** (deep-link, pre-filtered) and a prominent **Roll back this import** button — one click reverts every row in the `rollback_token` batch via the stored `before` snapshots, itself audited. The job persists in import history (`import_jobs` list) so any past import is reviewable and (within retention) reversible.

### 4.2 States & accessibility

- **Loading**: validation/dry-run show a determinate progress bar with row counts; large files stream.
- **Empty/first-run**: a one-screen explainer — *"Import loads or updates many offerings at once from a spreadsheet. Nothing changes until you confirm the dry run."* with **Download template**.
- **Error**: a parse failure (corrupt file, wrong type) stops at the failing step with a plain-language reason and **Start over**; a partial apply failure rolls the whole transaction back ("No changes were applied — row 88 failed; fix and retry").
- **A11y**: the wizard is a focus-trapped `role="dialog"` with `aria-current="step"` on the active step; the mapper is a labelled two-column form; diff/validation tables are `role="grid"` with sortable, filterable columns; the irreversible **Apply** button requires focus + an explicit confirm, never a default-focused Enter.
- **Scale**: built for thousands of rows — server-side validation/diff, paginated `import_job_rows`, streamed apply. 159 (or 819 variants) is comfortably within budget.

---

## 5. AI-Assist Console

Claude-assisted ops over `ai_actions`, enforcing the **propose → human preview → admin approve → apply** discipline structurally (the schema's `chk_ai_approved` forbids `applied` without an `approved_by`; `is_destructive` flags what must never auto-apply). The console never mutates the catalogue directly — it produces a proposal the operator reviews.

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AI assist                                                   History  ⌄        │
├──────────────────────────────────────────────────────────────────────────────┤
│  What do you want to do?                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ Cut Aspose prices 10% and write missing meta descriptions for all PDF      │ │
│  │ products.                                                            [Run] │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│  Quick actions:  ✦ Generate descriptions   ✦ Write SEO   ✦ Find duplicates     │
│                  ✦ Clean up tags           ✦ Map a messy spreadsheet           │
├──────────────────────────────────────────────────────────────────────────────┤
│  Proposed changes  (kind: bulk_edit + seo_gen · 28 offerings affected)         │
│  ⚠ This proposal changes prices — admin approval required.                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ Aspose.Cells for .NET                                                       │ │
│  │   fromPrice          £870.00 → £783.00                                      │ │
│  │   seo.metaDescription  (empty) → "Aspose.Cells for .NET — high-perf…"       │ │
│  │ Aspose.PDF for C++                                                          │ │
│  │   fromPrice          £509.00 → £458.10                                      │ │
│  │ …  [ show all 28 ]                                                          │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│   ◻ Approve all   ◻ Approve only the SEO changes (skip price changes)          │
│   [ Reject ]                                       [ Approve & apply (admin) ▸ ]│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Flow & guardrails

1. **Prompt** (`ai_actions.prompt`) — natural language, or a quick-action chip (each pre-fills a vetted prompt: description generation, SEO, dedupe, tag cleanup, messy-spreadsheet→schema mapping). The operator can scope it ("…for all PDF products") or pre-select offerings in §2 and "Send selection to AI assist."
2. **Propose** — the model returns `proposed_changes` (`[{entity, id, before, after}]`); `kind`, `target_filter`, and `is_destructive` are recorded. *No mutation occurs.*
3. **Preview** — the diff renders exactly like the import dry-run (same before/after component), grouped by entity, count of affected rows up top. Price/delete changes are flagged `is_destructive` with a `role="alert"` banner.
4. **Approve** — **partial approval** is first-class: the operator can approve the SEO half and reject the price half. Destructive changes require an admin (`ai.approve`); the **Approve & apply** button is disabled with a tooltip for non-admins.
5. **Apply** — materialises as a normal write (often via an `import_job`, linked through `ai_actions.import_job_id`) so it inherits the import's audit + **rollback** machinery. Rejected proposals store a `rejected_reason`.

Every AI action is retained in **History** (`ai_actions` list) with its prompt, model, proposal, decision, and outcome — full auditability.

### 5.3 States & accessibility

- **Loading**: a streaming "thinking" indicator (`aria-busy`, `aria-live="polite"` partial results); the operator can cancel.
- **Empty**: quick-action chips + an example library — *"Try: 'Write meta descriptions for every offering missing one.'"*
- **Error**: model/timeout failures show "Couldn't complete — try a narrower request" and never partially apply (proposals are atomic to approve).
- **A11y**: prompt is a labelled `textarea` with `aria-describedby` guidance; the proposal is a `role="region"` `aria-label="Proposed changes"`; approve/reject are clearly distinct, with the destructive path requiring explicit confirmation.
- **Scale**: proposals over large selections paginate ("show all 28"); the model operates on filtered server-side selections, not by streaming the whole catalogue.

---

## 6. Quotes Inbox

The browse-and-enquire core the old prototype's cart misrepresented. A triage workspace over `quotes` + `quote_items`, replacing a non-existent surface (today the cart's submit was a dead end).

### 6.1 Layout — list + reading pane

```
┌───────────────────────────────┬──────────────────────────────────────────────┐
│ Quotes   Status:[New (12)▾]    │  Q-2026-000123        ● New      Assign: [—▾]│
│ 🔍 search  Sort:[Newest▾]      │  Acme Corp · john@acme.com · +44…             │
├───────────────────────────────┤  Source: product_page · 2 h ago              │
│ ● Acme Corp        2 h   £4.7k │  ──────────────────────────────────────────  │
│   IronPDF + 2 more             │  Items                                       │
│ ● Beta Ltd         5 h   POA   │   IronPDF · Developer OEM   ×1   £509.00      │
│ ○ Gamma (contacted) 1 d  £870  │   Aspose.Cells · Site       ×1  £4,200.00     │
│ …                              │   Applied rule: Aspose Summer Sale (−20%)     │
│                                │  Indicative total: £4,709.00 (not a charge)   │
│                                │  ──────────────────────────────────────────  │
│                                │  Message: "Need pricing for 50 seats…"        │
│                                │  Status: New→Contacted→Quoted→Won/Lost        │
│                                │  [ Reply ]  [ Mark contacted ]  [ Convert ▸ ] │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

### 6.2 Interactions

- **Filter** by `status` (new/contacted/quoted/won/lost/cancelled, with counts), `source`, `assigned_to`, date; **search** name/email/company/reference.
- **Reading pane** shows the captured contact (`contact_*`), line items (`quote_items` with the *snapshotted* `offering_name`/`variant_name`/`captured_price_minor` — truthful even if the offering later changes), the **applied pricing rule** at capture (`applied_rule_id`), and the `indicative_total_minor` clearly labelled *"indicative — not a charge"* (honest to the no-checkout model).
- **Triage**: assign to a sales owner (`assigned_to`), advance status (each transition audited), add internal notes (`metadata`), **Reply** (opens a templated email to `contact_email`), and **Convert** to an order (`orders`/`order_items`) — present but flagged out-of-scope until real purchasing is enabled, never faking payment.

### 6.3 States & accessibility

- **Empty**: `gs-empty` — *"No quotes yet. They'll appear here when visitors enquire."*
- **Loading/Error**: list skeletons; failed load offers retry.
- **A11y**: master-detail is a `role="list"` + `role="region"` reading pane; status changes announce via `aria-live`; the "not a charge" caveat is associated with the total via `aria-describedby`.
- **Scale**: server-paginated, indexed on `(org_id, status)` and `assigned_to`; built for thousands of enquiries.

---

## 7. Media Library

Promoting the old one-at-a-time `MediaField` picker to a real library over `media_assets` (and `offering_media` associations) — needed for 153 product icons + 10 vendor logos + galleries.

**Layout.** A filterable grid of asset cards (thumbnail, filename, dimensions, alt-text indicator). Toolbar: **Upload** (drag-drop, multi-file, with `checksum` dedupe — re-uploading the same file reuses the existing asset), search (filename/alt), filter (type, used/unused, missing-alt). Selecting an asset opens a detail drawer: preview, `alt_text` (editable — flagged when missing for a11y), dimensions/bytes, and **"Used by"** (which offerings/vendors/categories reference it), so an operator never deletes an in-use logo blind.

**As a picker.** From the offering/vendor/category editors, the same library opens in pick-mode (`role="dialog"`) — one component, two entry points.

**States.** Empty: *"No media yet — upload icons, logos, or screenshots."* Upload shows per-file progress (`aria-live`); failures are per-file, non-blocking. Grid is keyboard-navigable (`role="listbox"`/`option`), virtualised past ~200 assets.

---

## 8. Vendors & Categories Managers

Two first-class managers, fixing the old "vendor == category" conflation (the prototype literally could not store both axes, and couldn't fix a broken vendor logo).

**Vendors** (over `vendors`): a list of the 10 brands with logo, name, domain, derived product count, status. Editor: **logo** (Media picker — finally fixable, addressing the broken grey-alpha logos), **name**, **slug**, **domain**, **description**, **sort order**, **status**. An `is-warn` flag on any vendor missing a logo (surfaced on the dashboard tile too). Deleting a vendor is blocked while products reference it (`ON DELETE RESTRICT`), with a clear "86 offerings use Aspose — reassign them first" message.

**Categories** (over `categories`): the 32 functional categories, **hierarchy-aware** (`parent_id`) — a tree/indented list supporting sub-categories. Editor: name, slug, description, icon (Media picker), parent (with a cycle guard mirroring `chk` / the no-self-parent constraint), sort order, status. Deleting a category soft-reassigns its offerings to uncategorised with an explicit impact count ("21 offerings will become uncategorised — proceed?") rather than the old silent orphaning.

Both reuse the standard list + editor + publish-gate pattern; both are searchable (trivial at 10/32 but consistent); both audit every change.

---

## 9. Team / Roles Manager

Admin-only (`user.manage`), over `users` + `role_permissions` + `user_permissions`.

**Layout.** A members list (name, email, role, status, last login) with **Invite** (email + role); pending invites show a `gs-team-pending` badge (mirrored on the dashboard tile). Per-member: change **role** (`org_role`: owner/admin/editor/sales/viewer), activate/deactivate, and an optional **per-permission override** grid (`user_permissions` grant/deny) for one-off elevation. A read-only **role-permissions matrix** (roles × `permissions`) shows, in plain language, what each role can do — and which actions are sensitive (publish, import.apply, pricing.publish, user.manage, ai.approve) — so an admin sets access deliberately.

**Guardrails.** Never fake auth — invites delegate to the IdP (`auth_subject`); no password ever lives here. The last remaining owner cannot be demoted/deactivated (a structural lock). Every role/permission change is audited (`audit_action='role_change'`).

**States.** Empty (single-user org): *"You're the only member. Invite your team."* Errors on invite (duplicate email per `(org_id, email)`) inline. The matrix is a proper `role="table"` with row/column headers.

---

## 10. Draft → Publish → Version workflow (surfaced consistently everywhere)

The one ritual the operator learns once and applies on every surface. It appears in three coordinated forms, all using the *same* visual language:

- **Status pill** — `gs-st-{draft|review|published|archived}` + `gs-dot`, on every offering, page, vendor, category, and pricing rule. Identical component, identical colours, identical meaning across the studio.
- **Publish banner** — the catalogue/page publish gate (`Catalogue is live ●` / `Unpublished changes ⚠` with **Discard** / **Publish ▸**). Publish is **admin-gated** (`*.publish` permission), visibly disabled with a tooltip for others, one `audit_log` entry per publish. Pricing changes promote atomically with the catalogue under the same gate.
- **Pages: draft vs published projection** — content pages hold `draft_data`/`published_data` side-by-side (the public site reads `published_data`); a **page-status history** (`page_status_history`) shows draft→review→approved→published transitions, and **page versions** (`page_versions`) give point-in-time **restore**. Catalogue entities get their history from `audit_log` rather than per-row snapshots — the right cost trade-off for high-volume rows, the same governance outcome.

**Where it shows up:**
- **Dashboard** aggregates "In review / Unpublished" stats and the attention banner from this workflow.
- **Releases board** (a governance view) lists everything awaiting action — pages in review, unpublished pricing, offerings drifted from published — each a deep-link to its editor.
- **Activity / Audit** (`audit_log`) is the universal before/after timeline (`gs-versions` component), filterable by entity, actor, and action, with `rollback_token`-grouped import batches reversible from here.

**Consistency guarantees.** The same `when(ts)` relative-time helper, the same `is-warn` warning modifier, the same `gs-empty` empty state, and the same `role="dialog"`/`role="tab"` semantics appear on every screen — so the studio reads as one tool, not ten. The attention math is single-sourced and role-gated so no surface ever claims work the operator can't act on.

---

## 11. Cross-cutting: how this scales to 200+ offerings

| Concern | Mechanism |
|---|---|
| **Lists** | Server-side search (`pg_trgm`/`tsvector`), filter (indexed `vendor_id`/`category_id`/`status`), sort, pagination — never the whole catalogue in the DOM. |
| **Editors** | Mount one entity at a time; sub-tables (variants/specs/media) paginate past ~50 rows. O(page), not O(catalogue). |
| **Bulk ops** | Filter-scoped select-all (e.g. all 86 Aspose), single transactioned write, audit batch + 10s undo. |
| **Import** | Streamed validation/dry-run/apply over `import_job_rows`; built for thousands. |
| **Pricing preview** | Affected-count + samples computed server-side over indexed `pricing_rule_targets`; no client-side scan. |
| **Concurrency** | `row_version` optimistic locking surfaces conflicts instead of silent last-write-wins. |
| **Stats** | Aggregate counts (O(1) to the operator), single-sourced so dashboard and managers never disagree. |

---

## 12. Cross-cutting: accessibility baseline

Inherited from the existing studio and extended: every interactive control carries `title` + `aria-label`; dialogs use `role="dialog"` + `aria-label` and trap focus; tabs use `role="tab"`/`aria-selected`; lists use `role="list"`/`listbox`/`grid` as appropriate; state is conveyed by class *and* ARIA (`is-active`→`aria-selected`, `is-warn`→`aria-invalid`/`alert`, `is-current`→`aria-current`); async results announce via `aria-live` and `aria-busy`; the irreversible actions (publish, import-apply, AI destructive apply, delete) never sit under a default-focused Enter — they require explicit focus + confirm. Colour is never the sole status signal — every status dot pairs with a text label. The ⌘K command palette makes every action keyboard-reachable, and every list is arrow-navigable.

---

## 13. Why this is markedly better than the system it replaces

Against the outdated Laravel/"Syrup" reseller it matches the capabilities — `/{vendor}/{slug}` product pages with editions and real GBP prices, search, login, enquiry — and exceeds them where it counts for the *operator*: a **task-first launcher** instead of a CMS dumping ground; a **unified product+service** editor instead of a products-only admin; **numeric, currency-aware, variant-level pricing** instead of free-text strings; a **scope-aware, preview-first, single-winner-safe discount engine** with "preview as tier"; a **dry-run/rollback bulk importer** with Excel round-trip; **AI-assisted** propose→approve→apply ops; a **quotes inbox** that honours the browse-and-enquire model the old cart faked; and a **consistent draft→publish→version→audit** workflow on every surface — all of it gated by real roles/permissions, attributed in an audit log, reversible by soft-delete and rollback, and built to stay fast at 200+ offerings and 800+ variants.

---

**Files referenced (all absolute).** Real data and contract: `/Users/johnprempeh/Desktop/Code/greatstone-homepage/assets/products.json` (159 offerings, 10 vendors, 32 categories, 819 variants, GBP, `discountPct:0`, `minOrderQty:1`, 12 featured, 13 null-price, specs `[{label,value}]`, seo `{metaTitle,metaDescription,socialImage}`) and `/Users/johnprempeh/Desktop/Code/greatstone-homepage/CATALOG-HANDOFF.md` (field-by-field Product/Variant mapping, quote/trial deep-links, `inquiries` shape). Current-state studio + defects this chapter fixes: `/tmp/cms-map-studio-panels.md` (the `gs-*` class vocabulary, `StudioPanel`/`OverviewPanel`/`PagesPanel`/`ActivityPanel`/`CommandPalette` patterns, panel shell), `/tmp/cms-assess-post-login.md` (the `mode='home'` launcher design, tile routing, `openTool` bridge), `/tmp/cms-assess-product-mgmt.md` (the 26 product-management gaps — flat list, no search/filter/variants, string price, vendor==category, commit-on-blur data loss, no importer), `/tmp/cms-assess-mass-discount.md` (the pricing-engine design — scope model, single-winner stacking, floor clamp, "preview as tier", the four impossible-today asks), `/tmp/cms-map-products-cms.md` (the current `ProductsPanel`/`Storefront`/`ProductDetail` surface), and `/tmp/cms-design.md` (overall current-state design). This chapter consumes the authoritative Postgres schema in the brief as its source of truth and cites its tables (`offerings`, `offering_variants`, `offering_specs`, `offering_media`, `pricing_rules`, `pricing_rule_targets`, `quotes`, `quote_items`, `orders`, `import_jobs`, `import_job_rows`, `ai_actions`, `media_assets`, `vendors`, `categories`, `customer_tiers`, `users`, `role_permissions`, `user_permissions`, `permissions`, `content_pages`, `page_versions`, `page_status_history`, `audit_log`) rather than redefining them.

---

# Part 7 — API contract

The full endpoint specification is in **`docs/api-contract.md`**.
