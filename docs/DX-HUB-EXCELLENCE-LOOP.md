# DX Hub Excellence Loop

Standing `/loop` John set on 22 Jun 2026: make `#account` (user) + `#org` (organization) an incredible,
production-grade product that reflects Greatstone as a **DX pioneer**. Iterate at ≤10-minute gaps, raise
the bar each cycle. This doc is the canonical roadmap + cycle log (the structured companion to memory
`greatstone-dx-hub`). Seeded by a 13-agent assessment (6 surface-mappers → 6 persona critics → synth) on
22 Jun.

## How a cycle runs
1. Check Notion Website Tickets `Directions for agent` view for John; act on anything there first.
2. Pick the next roadmap item below (or run a fresh multi-persona critique when the list thins).
3. Build it to best practice: incredible UI, thoughtful UX, WCAG-AA a11y, responsive, real empty/error/loading states.
4. Verify: `npm run build` clean + `npm test` (58 green) + preview 0 console errors (desktop + mobile) + self-review.
5. Deploy: **pathspec commit** (`git commit -m … -- <only my files>`, never `git add -A`) → build the dist from a **clean HEAD worktree** (a concurrent Excellence loop + uncommitted WIP share this repo + the single Netlify deploy) → rsync → Netlify MCP deploy-site (site `3b1e97e6`) → curl 200.
6. Log the cycle below; reschedule ≤600s.

## Guardrails
TEST/sandbox keys only; never expose/commit secrets; never deploy Supabase edge fns; never sign in as John;
do not touch greatstonesoftware.co.uk or the base greatstone-home site; only write within `greatstone-puck-proof`
+ the deploy mirror. Keep my edits OUT of files the other loop holds uncommitted (esp. `App.jsx`). **Big or
irreversible items (applying a migration, new infra, Notion creds, AI endpoints) are PARKED for John's morning
approval — never done autonomously.**

## Roadmap (ships without a migration unless noted)
| Cycle | Item | Surface | Effort | Ships now | Status |
|---|---|---|---|---|---|
| 1 | Per-client **maturity radar** (you vs industry vs target, 8 pillars) | #org | L | yes | ✅ shipped |
| 2 | **Phase Navigator** strip (Discovery→Build→Adoption→Review) above the timeline | #org | M | yes | ✅ shipped |
| 3 | Front-end correctness batch (reduced-motion scrolls, customer_id filters, quotes limit, mixed-currency guard) | #org + #account | S | yes | ✅ shipped |
| 4 | **Return-on-transformation** strip beside the at-a-glance stats | #org | M | yes | next |
| 5 | **Your Greatstone team** card + "in transformation since…" marker | #org | S | yes | |
| 6 | Member agency pass (role card, member-aware onboarding, key activation help) | #org + LicenceKeys | M | yes | |
| 7 | #account get-started band (state-adaptive next step + actionable admin badge) | #account | M | yes | |
| 8 | Staff authoring throughput (default-to-draft, preview pane, Duplicate, stale badge) | ClientsManager | M | yes | |
| 9 | Extract shared sanitizeHtml + date helpers module + mXSS regression tests | src/lib + tests | M | yes | |
| 10 | "In your field" phase-filtered **Intelligence band** on #org (innovation hub v1) | #org | M | yes | |
| 11 | Rules-based **"Your next move"** card + proactive health signals | #org | S | yes | |
| 12 | **Apply migration 0019** + seed Ethical Quest + swap radar to live data | Supabase + #org | M | **needs John** | |
| 13 | Staff 8-slider **maturity scoring form** | ClientsManager | M | needs 0019 | |
| 14 | **"Your climb"** maturity-over-time (data-bound MaturityMap) | #org | M | needs 0019 | |
| 15 | Engagement **outcomes + initiatives** tables (ROI + innovation pipeline) | Supabase + #org + ClientsManager | L | **needs John** | |

## Needs John's approval (parked — do not self-serve)
- **Apply migration 0019** (`maturity_assessments`) + seed Ethical Quest → promotes the radar from seeded prototype to live, staff-authored, re-scorable data. Needs founder OK to apply against the live DB + a one-shot RLS verification.
- **engagement_outcomes + initiatives tables** (ROI rigour + innovation pipeline) → two gated migrations + staff authoring.
- **Anonymised peer-benchmark data source** (a real benchmark table/view crosses the per-company RLS boundary → explicit sign-off on the anonymisation approach).
- **Server-side per-user "last seen"** for cross-device "new" badges (migration; localStorage stays the fallback until then).
- **Notion → engagements sync** (Notion API creds + encrypted key storage + edge function/cron + RLS/key-storage audit).
- **AI "next best move" endpoint** (model call: cost, client-data egress, which surface invokes it).
- **RLS apply-verification gate before go-live** — the UI renders even if 0013/0014/0016 are not applied in the live DB, so an unapplied policy silently opens a cross-company boundary. Founder DB access to assert customer_self / guard_customer_update / the 0016 index exist, captured in the handoff.

## Wishlist (persona "reviews" — best ideas, deduped)
Live "Your climb" on the mountain · radar with anonymised peer percentile · AI "next best move" engine · auto-accruing ROI ledger with payback countdown · Idea→Experiment→Outcome innovation Kanban seeded from #intel briefings · federated Intelligence (context-aware #intel + phase-filtered band on #org) · board-ready watermarked "Periscope Report" export · two-way timeline (client acknowledge/react/comment) · ambient weekly "transformation pulse" digest · "Simulate the climb" planner (drag target tiers → projected roadmap + investment) · staff "needs-attention" digest across all clients · adoption pulse per tool (are people actually using what we built).

## Cycle log
### Cycle 1 — Maturity radar on #org (22 Jun)
Per-client eight-pillar maturity radar between the relationship-pulse analytics and the engagement timeline:
your maturity (lime) vs anonymised industry benchmark (teal) vs target (purple dashed), with a tier badge
(Pebble/Plateau/Peak), a plain-English read, standout pillars, a legend, and a screen-reader data table.
Reads Supabase `maturity_assessments`; with migration 0019 dormant it falls back to a seeded baseline for
the demo company (Ethical Quest) only and shows a tasteful empty state for everyone else. Reduced-motion
honoured. New: `src/store/MaturityRadar.jsx`, `src/store/maturity-radar.css`, `src/data/maturity-seed.mjs`,
`supabase/migrations/0019_maturity_assessments.sql` (DORMANT). Edited: `src/store/OrgDashboard.jsx`.
Commit cf02859, bundle index-Bjumql4P, deploy 6a39b318.

### Cycle 2 — Phase Navigator on #org (22 Jun)
The `phase` field (already on every engagement, previously a buried badge) becomes a journey stepper above
the timeline controls: Discovery → Build → Adoption → Review as connected nodes, each with its past-item
count and state (done ✓ teal / current lime "you are here" / upcoming dimmed). The current phase is the
phase of the most recent past engagement; future-dated items don't inflate it (so Review reads as upcoming,
not started). Each node filters the timeline to that phase (composes with the kind chips + search), with a
"Showing X only · Show all phases" reset; all the existing filter-reset paths (deep-link, pin, jump-to-newest,
clear) also clear it. Caught + fixed a class collision: the stepper used `.dx-phase`, which the per-card phase
badge already owns, so renamed the stepper to `.dx-jstep*`. Verified: build clean, 58 tests, filter both ways,
no mobile overflow, reduced-motion. Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`.

### Cycle 3 — Front-end correctness batch (22 Jun)
The production-engineer persona's hardening pass, all front-end: (a) every programmatic `scrollIntoView` on #org
now routes through a `scrollToEl` helper that honours `prefers-reduced-motion` (jumps instead of animating —
WCAG 2.3.3); (b) belt-and-braces `.eq('customer_id', company.id)` added to the #org orders + quotes reads (they
relied on RLS alone; now they fail closed like the engagements read if a policy ever regresses) — verified the
demo orders carry customer_id so the figures are unchanged (Orders 2, Open quotes 1, Invested £20,160); (c) the
unbounded quotes read now carries `.limit(200)`; (d) the marquee "Invested" total on #org + #account now sums
only orders in the display currency, so a future mixed-currency account can never show a meaningless cross-currency
sum under one symbol. Build clean, 58 tests, data loads, 0 new console errors. Edited: `src/store/OrgDashboard.jsx`,
`src/store/AccountDashboard.jsx`.
