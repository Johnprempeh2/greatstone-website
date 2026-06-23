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
4. Verify: `npm run build` clean + `npm test` (63 green since C9 added the sanitizer tests) + preview 0 console errors (desktop + mobile) + self-review.
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
| 4 | **Return-on-transformation** strip beside the at-a-glance stats | #org | M | yes | ✅ shipped |
| 5 | **Your Greatstone team** card + "in transformation since…" marker | #org | S | yes | ✅ shipped |
| 6 | Member agency pass (role card, member-aware onboarding, key activation help) | #org + LicenceKeys | M | yes | ✅ shipped |
| 7 | #account get-started band (state-adaptive next step + actionable admin badge) | #account | M | yes | ✅ shipped |
| 8 | Staff authoring throughput (default-to-draft, Duplicate, stale badge) | ClientsManager | M | yes | ✅ shipped |
| 9 | Extract shared sanitizeHtml + policy mXSS tests + **preview-as-client pane** | src/lib + ClientsManager + tests | M | yes | ✅ shipped |
| 10 | "In your field" phase-filtered **Intelligence band** on #org (innovation hub v1) | #org | M | yes | ✅ shipped |
| 11 | Rules-based **"Your next move"** card + proactive health signals | #org | S | yes | next |
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
`src/store/AccountDashboard.jsx`. Commit de974a4, bundle index-B0CO5-Vo, deploy 6a39bc71.

### Cycle 4 — Return-on-transformation strip on #org (22 Jun)
A teal-tinted value band right under the at-a-glance stats, pairing the "Invested" figure with what the
engagement has delivered, all from data already loaded: milestones reached (count of milestone engagements),
deliverables shipped (deliverable engagements), and journey progress (phase N of 4 + current phase name).
Answers a CFO's "what did the spend buy" without a typed outcomes table (that's the gated cycle 15). Stays
quiet for a brand-new org with nothing tangible yet. Reuses `.org-stat` tiles in a distinct `.org-return`
band (no class collision). Verified on Ethical Quest (1 milestone, 2 deliverables, Adoption 3/4), mobile
clean, build + 58 tests green. Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`. Commit b27d45f,
bundle index-Chy8teZJ, deploy 6a39c01a.

### Cycle 5 — Your Greatstone team card + "in transformation since" marker (23 Jun)
Two relationship-humanising touches on #org, both from data already loaded. (a) A "Your Greatstone team"
card lists the engagement leads, derived from the distinct `owner_name` values across the company's shared
engagements (avatar initials + name + "Greatstone lead"), with a Book-a-deep-dive CTA. (b) An "In transformation
since <first engagement month> · N months in · <current phase> phase" marker in the identity band, computed from
the earliest past engagement + the current phase. Both stay quiet when there's no data. Verified on Ethical Quest
("since February 2026 · 4 months in · Adoption phase"; lead John Prempeh), mobile clean, build + 58 tests green,
and 0 console errors confirmed on a fresh dev server (clearing the stale mid-edit HMR buffer). Edited:
`src/store/OrgDashboard.jsx`, `src/store/admin.css`. Commit f01d3aa, bundle index-CP4sb5B9, deploy 6a39c3c7.

### Cycle 6 — Member agency pass (23 Jun)
Turns the non-admin member from spectator into participant, copy + links only. (a) The #org member role
banner now carries a capability line: what a member can do (follow the timeline, view orders + licence keys,
place orders, manage their own profile) vs what their admin handles (company settings + team access). (b) The
onboarding checklist's admin-only steps (company profile, invite team) reframe for members as "Your company
admin will add this / manages who has access" instead of reading like the member's own unactionable to-dos.
(c) The LicenceKeys empty state gains activation guidance (copy the key into the product's licence screen;
contact us if stuck). Verified the member capability card live (signed in as demo-member@greatstone.dev),
banner icon top-aligned for the two-line variant, mobile clean, build + 58 tests green, 0 console errors.
Edited: `src/store/OrgDashboard.jsx`, `src/store/LicenceKeys.jsx`, `src/store/admin.css`. Commit 972fff6,
bundle index-DF9_7Ue4, deploy 6a39c7a1.

### Cycle 7 — #account get-started band (23 Jun)
A state-adaptive "Your next step" band on the #account overview, from session + profile + orders already
fetched, surfacing the single most relevant unmet action: no orders → explore the catalogue / book a deep
dive; has licence keys → activate them (jumps to the Keys tab); company admin → set up your organization;
otherwise → follow your transformation on #org. Also made the "Company admin" badge actionable (now a link
to #org). Verified both as member (band: "Activate your licences"; no admin badge) and admin (badge is an
<a href="#org">, aria-labelled), mobile clean, build + 58 tests green, 0 console errors. Edited:
`src/store/AccountDashboard.jsx`, `src/store/admin.css`. Commit 6780d40, bundle index-2ZTraEK8, deploy 6a39cb68.

### Cycle 8 — Staff authoring throughput (23 Jun)
Three self-contained throughput wins in the staff Clients manager (#catalogue → Clients), front-end only.
(a) New engagements now default to status=draft (was shared — a publish footgun); staff Share deliberately
with the existing row button. (b) A Duplicate row action opens a New-engagement editor pre-filled from the
item (title + "(copy)", today's date, draft) so a similar recap is one edit away. (c) A staleness badge on
the client list (amber after 30 quiet days, red after 60, "No activity" when a client has no engagements)
so the team can spot dashboards going quiet. The "preview as the client sees it" pane was deferred to cycle 9
because it needs the shared sanitizeHtml, which cycle 9 extracts. Verified live as staff (admin@greatstone.dev):
new engagement defaults to draft, Duplicate pre-fills "… (copy)" as a draft, Northwind shows "No activity".
Build + 58 tests green, 0 console errors. Edited: `src/store/ClientsManager.jsx`, `src/store/admin.css`.
Commit 1cae99b, bundle index-CpD_TFw6, deploy 6a39cfbf.

### Cycle 9 — Shared sanitiser module + tests + preview-as-client pane (23 Jun)
Extracted the recap HTML sanitiser out of OrgDashboard into `src/lib/sanitize-html.mjs` (sanitizeHtml +
the ALLOWED / DROP_ENTIRELY / DEMOTE policy sets + a pure isSafeHref), so the client #org view and the
new staff preview pane share ONE sanitiser. Added `src/lib/sanitize-html.test.mjs` — pure-node regression
tests (no DOM dep) locking the security policy: dangerous foreign-content/rawtext tags are dropped + never
allowed, all headings demote, only http(s)/mailto hrefs survive (javascript:/data:/leading-space tricks
rejected), no allow/drop overlap, and the SSR guard. **Test baseline 58 → 63.** The DOM-mutation behaviour
stays verified in-browser. Built the "Preview as the client sees it" pane in the staff EngagementEditor,
rendering the exact sanitised output the client sees (verified it shows the h5 heading-demotion). Regression-
checked the #org recap still renders. Build clean, 63 tests green, 0 console errors, staff + client both verified.
New: `src/lib/sanitize-html.mjs`, `src/lib/sanitize-html.test.mjs`. Edited: `src/store/OrgDashboard.jsx`,
`src/store/ClientsManager.jsx`, `src/store/admin.css`. Commit 6c47c55, bundle index-jEqYmEd1, deploy 6a39d438.

### Cycle 10 — Innovation hub v1: "In your field" Intelligence band on #org (23 Jun)
The connection John specifically wanted: #org now carries a band that reuses the AI Intelligence hub's briefing
data (src/data/ai-intel.mjs, a shared chunk) filtered to the client's CURRENT phase via a phase→topics map
(Discovery→frontier/enterprise/multimodal, Build→coding/agents/infrastructure, Adoption→enterprise/open-source/
hardware, Review→ai-security/regulation/funding). Shows the 3 most recent matching briefings, each a card
(topic chip in the topic's hue + date + headline + vendor) linking to its full #intel/<id> article, plus an
"Open the full Intelligence hub →" CTA. Falls back to a general topic set when the phase is unknown. Verified
live as Ethical Quest (Adoption): heading "Intelligence for your adoption phase", 3 Enterprise-topic cards, and
a card click navigates to the #intel article. Build clean, 63 tests, mobile clean, 0 console errors. Edited:
`src/store/OrgDashboard.jsx`, `src/store/admin.css`.
