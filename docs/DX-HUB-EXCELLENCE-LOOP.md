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
| 11 | Rules-based **"Your next move"** card (from the weakest maturity pillar) | #org | S | yes | ✅ shipped — initial 11-item roadmap COMPLETE; refill via fresh critique |
_(The original gated cycles 12-15 — apply 0019, staff scoring form, climb-over-time, outcomes/initiatives — moved to "Needs John's approval" below. The table now carries the REFILLED front-end roadmap from the 23 Jun fresh 6-persona critique.)_

## Refilled front-end roadmap (cycles 12+, 23 Jun critique — all ship without a migration)
| Cycle | Item | Surface | Effort | Status |
|---|---|---|---|---|
| 12 | Restore keyboard focus ring on the timeline search (.dx-search) | #org admin.css | S | ✅ shipped |
| 13 | Guard date helpers + maturity chips vs Invalid Date / NaN | #org OrgDashboard + MaturityRadar | S | ✅ shipped |
| 14 | Maturity since-discovery **delta chips** (per-pillar + overall) | #org MaturityRadar | S | ✅ shipped |
| 15 | Distance-to-target **climb-completion meter** | #org MaturityRadar | S | ✅ shipped |
| 16 | Board-ready **print stylesheet** + "Download a summary" | #org admin.css + identity band | M | ✅ built + committed (deploy pending — Netlify 404 outage) |
| 17 | Engagement **tag-facet pills** in the timeline filter row | #org EngagementTimeline | M | ✅ built (ships with c16) |
| 18 | **Pending-actions banner** above the #account tabs | #account | M | ✅ built (ships with c16+c17) |
| 19 | Order **search/filter** box on the Purchases tab | #account | M | ✅ built (ships with c16-c18) |
| 20 | Inline **copy-key** on the per-order licence chips | #account | M | ✅ built (ships with c16-c19) |
| 21 | Licence-key **expiry badges** + #account next-step rule | #account + LicenceKeys + staff keys | M | ✅ built (ships with c16-c20) |
| 22 | Per-phase **what-this-delivers** line on the phase navigator | #org EngagementTimeline | S | ✅ built (ships with c16-c21) |
| 23 | **Next-touchpoint** reassurance tile in the relationship pulse | #org OrgAnalytics | S | ✅ built (ships with c16-c22) |
| 24 | **Loading skeletons** for late-mounting #org bands (CLS fix) | #org OrgDashboard | M | ✅ built (ships with c16-c23) |
| 25 | Personalised **welcome-back / since-last-visit** header line | #org + #account identity | S | ✅ built (ships with c16-c24) |
| 26 | **"Discuss this"** mailto on timeline items + quotes | #org Item + #account Quotes | S | ✅ built (ships with c16-c25) |
| 27 | Quote **valid-until countdown** + reorder-last + spend context | #account | M | ✅ built (ships with c16-c26) |
| 28 | **Ask-your-admin** prefilled mailto for stranded members | #account | S | ✅ built (ships with c16-c27) |
| 29 | Staff **portfolio health bar** + quiet-first sort | Staff client list | M | ✅ built (ships with c16-c28) |
| 30 | Staff in-client **timeline filter/count + unshared-draft nudge** | Staff ClientDetail | M | ✅ built (ships with c16-c29) |
| 31 | Staff engagement **quick-start templates** + pre-share checklist | Staff EngagementEditor | M | ✅ built (ships with c16-c30) |
| 32 | **Benchmark-gap chip** on the Next-move card | #org NextMove | S | ✅ built (ships with c16-c31) |
| 33 | Single-month spend sparkline + orders-truncation honesty | #org OrgAnalytics + RecentOrders | S | ✅ built (ships with c16-c32) |
| 34 | Attendee overflow chip + filter-result live announcement (a11y) | #org Item + EngagementTimeline | M | ✅ built (ships with c16-c33) |
| 35 | Toast safe-area/dismiss + phase-nav overflow scroll + intel-chip contrast | #org admin.css + InnovationBand | M | ✅ built (ships with c16-c34) |
| 36 | Aspirational **empty-states** for a brand-new org | #org body + timeline empty | M | ✅ built (ships with c16-c35) |
| 37 | Download-all-my-keys export + copy-quote-reference | #account LicenceKeys + Quotes | M | ✅ built (ships with c16-c36) |

_Rows 38-59 below: refilled 23 Jun from a 7-persona critique of the live product (task w2ux752le), deduped vs c1-c34, ordered best-value-first (trust/honesty + a11y blockers → admin-week wins → staff throughput → mobile/polish). Each is safe, reversible, front-end, presentation-only._

| 38 | Show the maturity **assessment date** on the radar ("Assessed 15 Jun 2026 · seeded baseline") | MaturityRadar org-mat-head | S | ✅ built (ships with c16-c37) |
| 39 | Visible inline **"Sample baseline" disclosure** (not hover-only title) | MaturityRadar org-mat-sample | S | ✅ built (ships with c16-c38) |
| 40 | **Persistent toast live region** (mount empty role=status once, fill on flash) — SR misses it today | #account + #org .ca-toast | M | ✅ built (ships with c16-c39) |
| 41 | **Move focus into the panel** after a tab switch / deep-link + visible-on-focus skip link | #account tablist + #org header | M | ✅ c41 (905f513): goTab() focuses revealed panel on every #account deep-link; route-safe skip links on both dashboards (reuse canonical studio.css .gs-skip) |
| 42 | **Clickable at-a-glance tiles** on #org (parity with #account's button tiles) | #org Stat + admin.css | S | ✅ built in the #org tab redesign |
| 43 | **Keyboard semantics** on the clickable order rows (role/tabindex/onKeyDown) | #account acct-ordrow | S | ✅ c42 (af23a7a): the row already had a real disclosure <button> with aria-expanded/aria-controls — gave it a proper accessible name ("Items in order <ref>"), aria-hidden glyph, type=button. Single named keyboard control per row (no second tab stop) |
| 44 | **Dim + aria-disable** zero-item phase-navigator steps (cursor-only today) | #org EngagementTimeline + .dx-jstep-btn | S | ✅ c43 (a5009c1): SR state was already in the button aria-label; added semantic aria-current="step" on the current step + dimmed upcoming node+count (opacity .5) so done/current/upcoming are unambiguous visually too (zero-item steps already disabled) |
| 45 | **"What needs you" attention strip** at the top of #org (mirror #account pending banner; reuse loaded data) | #org identity-header band | M | ⊘ c44 DESCOPED (redundant): customer_users carry no invite/pending state + engagements no accept state, so the net-new items can't be honestly surfaced; the supportable ones (open quotes, next touchpoint) are already covered by the KPI tiles + OnboardingChecklist + ReturnStrip. A duplicate strip = a nag. Revisit only if an invite/pending-state migration lands (PARK-for-John). |
| 46 | **Visible spend-sparkline figures** (latest-month + total caption, axis hint; values are hover-only today) | #org OrgAnalytics org-an-spark | S | ✅ c44 (fb29bf4): added a visible total headline + a first→last trend-endpoint caption (figures were SR-/hover-only); trimmed the now-duplicated "Total" from the bars' aria-label |
| 47 | **Trust/value framing** on the AuthGate sign-in (replace the "software store" first impression) | #account AuthGate | M | ✅ c45 (57afabf): added an understated, honest reassurance line under the submit ("Encrypted connection to the Greatstone customer portal") with an inline lock icon — only true claims (TLS + branded portal), no invented certs; mode-agnostic, AA contrast |
| 48 | **Section jump-nav + labelled `<main>` landmark** for the long #org scroll | #org Org() top + admin.css | M | ✅ c46 (ab2b9c6): `<main>` part DESCOPED (App.jsx #gs-main already owns the single, unlabelled main + App.jsx is off-limits → a 2nd main would violate). Instead gave each dashboard root role=region + aria-label ("Your account"/"Your organization") = a named landmark inside the existing main. Verified exactly 1 main per view + region nested inside |
| 49 | **Pending invite-requests count** on the Members heading (data already loaded) | #org Members heading | S | ✅ c47 (056ce6c): added a "N pending" chip on the "Members & access" heading (above the table) + count in the "Pending invitations (N)" subheading; renders only when pending>0; count derived from the same filtered list so it can't disagree with the rows. (member_invite_requests carries a real status — data-supported, not a descope) |
| 50 | **Copy-key + expiry badge** on the staff licence-key rows (bare `<code>` today) | ClientsManager staff keys | S | ✅ c48 (e0436b1): per-key Copy button (customer clipboard + select-to-copy fallback) + new Expires column with the shared expiryInfo()/.lk-expbadge. Verified live as staff on Ethical Quest (2 keys, Copy writes the value → "Copied ✓", Expires column present); reuses licence-expiry.mjs (tested) |
| 51 | **Honest staff client-list states** (error+retry + distinct "no match" vs "No clients yet") | ClientsManager list load/tbody | S | ✅ c49 (a4be0a2): client list + licence-keys read errors were SWALLOWED → a failed load rendered the "No clients yet"/"No keys yet" empty copy. Added error rows + "Try again" retry (role=alert) on both; extracted the error-vs-empty decision to a tested pure list-state.mjs (error wins over empty/stale rows). +4 tests (baseline 111→115) |
| 52 | **Clickable portfolio-health chips** as recency filters (inert spans today) | ClientsManager ci-health | M | |
| 53 | **"Ask your admin" escape hatch** on #org member dead-ends (reuse askAdminMailto) | #org member branches | S | |
| 54 | **First-run welcome/empty state** for a brand-new org with no engagements (pairs with row 36) | #org empty-path + admin.css | M | |
| 55 | **Add-to-calendar (.ics)** affordance on the Next-touchpoint tile (client-side, no backend) | #org OrgAnalytics org-an-next | S | |
| 56 | **Primary-vs-secondary hierarchy** for the identity-header action buttons | #account + #org acct-id-actions | S | |
| 57 | **Expectation-setting line** on the 2FA "Ask us to enable" control | #account SecurityCard | S | |
| 58 | **Single-row scrollable tab strip** for #account on narrow phones (pill chrome breaks <=480) | #account tabs + .acct-tabs | S | |
| 59 | **Coarse-pointer tap-size bump** for timeline jump pins / filter chips / tag pills (<44px today) | #org + admin.css @media(pointer:coarse) | S | |

## Needs John's approval (parked — do not self-serve)
- **Staff cross-client pending-invite signal** (a portfolio-wide "N teammates awaiting approval across your clients" digest) — needs a batched cross-customer read of `member_invite_requests`; verify it stays within staff RLS scope before building (flagged by the c34 critique as needs-a-look, not purely presentational).
- **Apply migration 0019** + seed Ethical Quest + the staff 8-slider scoring form, then **"Your climb" over time** (multi-point history) and the **engagement_outcomes + initiatives** tables (ROI + innovation pipeline) — the gated maturity/ROI ladder.
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
`src/store/OrgDashboard.jsx`, `src/store/admin.css`. Commit 78c1041, bundle index-DkGdkGKz, deploy 6a39d7dd.

### Cycle 11 — Rules-based "Your next move" card on #org (23 Jun)
Extracted the maturity-assessment fetch (Supabase `maturity_assessments` → seeded DEMO_ASSESSMENT → empty,
the 0019-dormant guard) into a shared `src/store/useMaturity.mjs` hook, so the Maturity Radar and the new
card always read the SAME data. Added a "Your next move" card after the radar: it finds the lowest-scoring
pillar and turns it into a concrete recommendation — names the pillar + its tag, why it matters, a "Book a
deep dive" CTA (#go/contact), and "See the eight pillars →" (#go/method). Graceful when no maturity data
(returns null). Verified live as Ethical Quest: "Strengthen Data … your lowest pillar … at 4/10", radar still
renders (refactor regression passed, both agree at 5.3 overall / Data weakest). Build clean, 63 tests, mobile
clean, 0 console errors. New: `src/store/useMaturity.mjs`. Edited: `src/store/MaturityRadar.jsx`,
`src/store/OrgDashboard.jsx`, `src/store/admin.css`.

**★ Initial 11-cycle front-end roadmap COMPLETE.** A fresh 7-agent / 6-persona critique (run wvtusn8c7, 23 Jun)
refilled the roadmap with cycles 12-37 (see the Refilled front-end roadmap table above) + an expanded gated
wishlist (quantified ROI outcomes table, climb-over-time, two-way timeline, in-app accept-quote, peer percentile,
watermarked Periscope export, AI next-best-move, transformation-pulse email, Notion sync, server-side last-seen,
per-tool adoption pulse, staff needs-attention triage, simulate-the-climb planner) — all needing John.

### Cycle 12 — Restore keyboard focus ring on the timeline search (23 Jun)
The fresh critique's top item: `.dx-search:focus { outline:none }` (admin.css) had no `:focus-visible` restore, so
a keyboard user tabbing to the #org timeline search got no ring (WCAG 2.4.7). Adversarial note: the critique
suggested adding `.dx-search` to the earlier restore list, but that rule sits BEFORE the `outline:none`, so with
equal specificity it'd be overridden — the correct fix is a `.dx-search:focus-visible` ring placed AFTER the
`outline:none` so it wins on keyboard focus (mouse focus keeps no outline). Build clean, 63 tests. Edited:
`src/store/admin.css`. Commit 2051d48, bundle index-IcJXG9fR, deploy 6a39defe.

### Cycle 13 — Invalid-Date / thin-data guards (23 Jun)
toLocaleDateString returns the literal "Invalid Date" (it does not throw) on a bad value, so fmtDate/periodOf
on #org and fmtDate on #account now guard with `Number.isNaN(getTime())` → '—' / 'Earlier'. The Maturity Radar
now treats a row with no usable scores (overall 0) as not-yet-assessed (the empty state) rather than rendering
a misleading "0/10 Pebble" — the defensive base for the delta/meter features landing next, so partial data once
0019 is applied degrades gracefully. Verified the happy path is unaffected (radar 5.3, "15 Jun 2026" dates,
no "Invalid Date" on page). Build clean, 63 tests, 0 console errors. Edited: `src/store/OrgDashboard.jsx`,
`src/store/AccountDashboard.jsx`, `src/store/MaturityRadar.jsx`. Commit f6677c6, bundle index-D2yFgrQ9, deploy 6a39e293.

### Cycle 14 — Maturity since-discovery delta chips (23 Jun)
The radar already destructured `baseline` and computed `baseOverall`, so this is pure presentation: an overall
"▲ N.N since discovery" chip beside the tier badge, a `▲N` chip on the strongest + priority-climb standouts, and
a new "Since discovery" column in the screen-reader data table (+N per pillar). The aria-label now announces the
climb too. All gated on baseline presence so it degrades silently for orgs without one (and never renders NaN, per
cycle 13). For Ethical Quest this surfaces "▲ 1.9 since discovery", People · 6 ▲2, Data · 4 ▲2 — the climb made
visible. Verified on desktop + 380px mobile (no overflow), 0 console errors, build clean, 63 tests.
Edited: `src/store/MaturityRadar.jsx`, `src/store/maturity-radar.css`. Commit d812995, bundle index-BaP7ZTct, deploy 6a39e664.

### Cycle 15 — Distance-to-target climb-completion meter (23 Jun)
The radar now answers "how far along the journey are we?" A slim progress meter sits under the standouts:
`climbPct = round((overall − baseOverall) / (targetOverall − baseOverall) × 100)`, clamped 0–100, with a lime
fill on a charcoal track and a baseline → today → target scale beneath. It's a real `role="progressbar"` with
aria-valuemin/now/max set to the actual overall scores and an aria-valuetext that reads the whole story; the
width transition is killed under reduced-motion (no infinite animation). Gated on both `target` and `baseline`
being present, so it degrades silently otherwise. Ethical Quest reads "Climb to Peak · 39%" (baseline 3.4 → today
5.3 → target 8.3). Verified live in the panel, 0 console errors, build clean, 63 tests.
Edited: `src/store/MaturityRadar.jsx`, `src/store/maturity-radar.css`. Commit 3a54870, bundle index-CBnGv8Wb, deploy 6a39e9ed.

### Cycle 16 — Board-ready print summary + "Download a summary" (23 Jun)
An #org admin can now take the whole DX picture into a leadership meeting. A "Download a summary" button in the
identity band calls `window.print()`, and a scoped `@media print` block (admin.css) renders a clean one/two-pager:
the classic visibility trick prints ONLY the `.org-print-root` subtree (so site nav/footer chrome drop without
needing their class names), flipped to dark-on-white. It strips interactive controls (every button/input/select,
the phase navigator, the timeline toolbar, role banner, onboarding, innovation hub, members/profile/orders
sections, all CTAs); forces the radar's drawn state and recolours its grid lines, axis labels and data polygons
(via redefined `--gs-accent/--gs-teal/--gs-purple`) to read on white; keeps the climb-meter fill printing with
`print-color-adjust:exact`; and sets `break-inside:avoid` so no card splits across a page. Scoped to
`.org-print-root` so #account printing is untouched. Verified the button renders, the print rule is present in the
CSSOM and scoped to print media, screen rendering is unchanged, 0 console errors, build clean, 63 tests. (Print
output itself can't be rasterised in the headless preview; the CSS is print-media-only so it carries zero screen
risk.) Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`. Commit 5ed5301, mirror bundle index-BD2Vm7p1.
**DEPLOY PENDING:** the Netlify MCP deploy-site proxy returned a sustained `404 Not Found` at zipAndBuild across
5 fresh tokens (transient Netlify-side outage; the same flow shipped c15 fine ~15 min earlier, and the CLI has no
auth token to fall back to). The commit is safe in git and the c16 dist is staged in the deploy mirror, so nothing
is lost — the NEXT cycle re-attempts the deploy first; one deploy then ships c16 + c17 together once Netlify recovers.

### Cycle 17 — Engagement tag-facet pills in the timeline filter (23 Jun)
The #org engagement timeline gains a row of tag-facet pills under the type/search controls. It collects the
distinct tags across past engagements (most-used first, each with a count), renders them as `aria-pressed` toggle
buttons, and composes the tag filter with the existing kind chips + phase navigator + search (`visible` now also
requires the tag when one is active). "All tags" resets; clicking the active pill clears it; every filter-reset
path (jump-to-item, clear-filters, pins) also clears the tag. Keyboard-operable with a visible focus ring, full
aria-labels, and the row degrades to nothing when no engagement carries a tag. Adversarial catch: `.dx-tagrow` is
a sibling of `.dx-controls`, so it was added to the c16 print-hide list too. Verified live: pills render with
counts (platform/report/roadmap/staging), clicking "platform" narrows 8→1 items and "All tags" restores, 0
console errors, no 380px overflow, build clean, 63 tests. Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`.
Commit 4a2d746. **DEPLOY STILL PENDING:** the Netlify MCP proxy continued to 404 on retry (~7 attempts over ~18
min, ~03:25–03:43). c16 (5ed5301) + c17 (4a2d746) are both committed and the COMBINED dist (mirror bundle
index-ClPGwiZ3) is staged in the deploy mirror — one successful deploy ships both. The next cycle retries first.

### Cycle 18 — #account pending-actions banner (23 Jun)
A dismissible attention banner above the account tabs surfaces decision/time-sensitive open loops, each a
deep-link to its tab: quotes expiring within 7 days (urgent, amber), open quotes to review, and an incomplete
profile (no name). It's a labelled `role="region"`, counts the items with correct singular/plural grammar, hides
entirely when nothing is pending, and is session-dismissible (returns next visit if still pending). Distinct from
the onboarding "next step" card (which stays a single guidance nudge); dates are guarded per c13 (Invalid Date →
ignored, no NaN). Keyboard-operable with visible focus rings; urgent items use the warning token. Verified live as
demo-client: "1 thing needs your attention → 1 open quote to review", the link selects the Purchases tab, × dismisses,
no 380px overflow, 0 console errors, build clean, 63 tests. Edited: `src/store/AccountDashboard.jsx`, `src/store/admin.css`.
**Ships with c16+c17 on the next successful deploy** (Netlify proxy still being retried).

### Cycle 40 — persistent toast live region on #account (23 Jun)
Completes roadmap row 40 (the #org half landed with the tab redesign). The #account flash toast was mounted only when a
message existed, so a screen-reader live region didn't pre-exist at announce time and SR users missed every save/copy/
error confirmation. Added an always-present visually-hidden `<div className="gs-sr-only" role="status" aria-live="polite">`
that holds the current toast text, and removed `role="status"` from the visible `.ca-toast` so the message isn't
announced twice. a11y-only, no layout change; baseline holds at **111**. Verified live on #account: the persistent region
is mounted + empty before any flash, fills to "Reference copied." when the quote-ref copy fires, and the visible toast no
longer carries role=status (no double live region). Edited: `src/store/AccountDashboard.jsx`. Ships with the staged batch.

### John request — #org reorganised into tabs (23 Jun)
John: "organise everything in the organisation screen into tabs and make the UX solid and intuitive." The #org dashboard
was a ~13-band single-scroll wall. Ran a 3-proposal + judge design Workflow (task w0i2illkc) to settle the information
architecture, then implemented it. Now: identity header + role banner + the 4 KPI tiles + the onboarding checklist stay
**persistent** above a 5-tab strip (consistent with #account's `.ca-tabs.acct-tabs` chrome): **Overview** (default —
ReturnStrip ROI + Relationship pulse), **Maturity** (radar + Next move, which share useMaturity), **Engagement** (the
timeline + In-your-field intel + Greatstone-team card — the heavy interactive tab, off-default), **Team & access**
(Members), **Company** (profile + orders). Same tab set for admin + member (bands gate their own write controls). Built
to best practice: role=tablist/tab/tabpanel, aria-selected, roving-tabindex arrow/Home/End keyboard nav (cloned from
#account); the KPI tiles are now buttons that jump to their tab (Members→Team, quotes/orders/invested→Company) and the
onboarding "Edit profile"/"Invite a teammate" CTAs switch to the Company/Team tab then scroll+focus the heading
(tabIndex=-1 added); the external `#org/e/<id>` timeline permalink reveals the Engagement tab; a print override un-hides
every panel so "Download a summary" still captures the whole dashboard. Folded in **roadmap row 40** (a persistent
gs-sr-only role=status live region for the #org toast + removed role=status from the visible toast) and **row 42**
(clickable KPI tiles) since I was rewriting those areas. Verified live as the demo admin: 5 tabs switch correctly, each
panel shows its bands (radar/timeline/members/profile+orders), arrow-key nav + roving focus work, the Members tile jumps
to Team and focuses the heading, the tab strip swipe-scrolls at 380px with no page overflow, build clean, 111 tests,
0 console errors. Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`. Ships with the staged batch.

### Cycle 39 — make the "Sample baseline" caveat visible + accessible (23 Jun)
The radar's `.org-mat-sample` chip showed the text "Sample baseline" but the actual caveat ("illustrative, not live")
lived ONLY in the chip's `title=` tooltip, invisible on touch and to screen readers, so a buyer on a phone could repeat
seeded numbers in good faith. Now, when `source === 'sample'`: a visible amber inline note under the radar head ("ⓘ These
scores are an illustrative demo baseline, not a live assessment.") and a proper `aria-label` on the chip so a screen
reader hears the full caveat instead of just "Sample baseline". CSS-only addition (no new tests; baseline holds at
**111**). Verified live on #org: the amber note renders (rgb 255,200,0), the chip aria-label reads the full caveat, radar
renders clean, note wraps to 3 lines at 380px with no overflow. Only shows for the sample source (real assessments are
unaffected). Edited: `src/store/MaturityRadar.jsx`, `src/store/maturity-radar.css`. Ships with c16-c38.

### Cycle 38 — surface the maturity assessment date on the radar (23 Jun)
The radar's underlying `assessed_on` (in the seed + the Supabase `maturity_assessments` select) was fetched but never
destructured or rendered, so an admin quoting a 5.x score to her board couldn't tell how current it is. Confirmed the
field exists first (seed carries `assessed_on: '2026-06-15'`), then surfaced it: a small uppercase "Assessed 15 Jun
2026" line under the radar subtitle (date-guarded → '' on a bad date) and added to the radar's SR aria-label. Paired with
the existing "Sample baseline" chip so the demo reads honestly as a seeded/illustrative baseline, not live data. CSS-only
addition (no new tests; baseline holds at **111**). Verified live on #org: the line shows "Assessed 15 Jun 2026", the SR
label includes it, the Sample-baseline chip is still present, radar renders clean, no overflow. Edited:
`src/store/MaturityRadar.jsx`, `src/store/maturity-radar.css`. Ships with c16-c37. (First of the critique-refilled batch.)

### Cycle 37 — #account: download-all-keys export + copy-quote-reference (23 Jun)
Two self-serve conveniences on #account. (a) The Licence keys tab now has a **"Download all (.csv)"** button that
client-side serializes every key (Product, Variant, Licence key, Seats, Status, Expires, Order) to a UTF-8 CSV (with a
BOM so Excel reads it) and downloads it via a Blob + object URL, no backend; shown only when the customer has keys. The
CSV serialization (RFC-4180 quoting/escaping) is a pure tested module (`src/store/keys-export.mjs`: `keysToCsv`) —
**baseline 107 → 111**. (b) Each quote row gets a small **copy-reference button** (clipboard happy-path; falls back to
flashing the reference) so a buyer can grab "Q-2026-000042" without manual selection. Verified live as the demo client:
the download produced `greatstone-licence-keys.csv` with the correct header + 2 real key rows (Mortar Connect / Bedrock
Platform); the copy button captured "Q-2026-000042" (via a stubbed clipboard) and flashed "Reference copied."; no page
overflow (the quote table uses the existing `.ca-table-wrap` horizontal-scroll on mobile); build clean, 111 tests. New:
`src/store/keys-export.mjs` + `.test.mjs`. Edited: `src/store/LicenceKeys.jsx`, `src/store/AccountDashboard.jsx`,
`src/store/admin.css`. This completes the original roadmap (c35-c37); next is the refilled batch c38-c59. Ships with c16-c36.

### Cycle 36 — aspirational first-run empty-state for a brand-new org's timeline (23 Jun)
The engagement-timeline zero-state existed but was generic and had no call to action. It's now context-aware and
inviting: a brand-new org (no engagements) sees "Your engagement timeline starts here", a preview row of the kinds
that will populate it (Recaps · Milestones · Deliverables chips), and a **"Book your kickoff deep dive"** CTA; a client
who has **purchased but has no engagements yet** gets a variant that points at their account ("Your purchases are in
your account. After your kickoff…"). The which-empty-state predicate was extracted to a pure tested module
(`src/store/org-firstrun.mjs`: `firstRunState` → `timelineEmpty` / `isBrandNew` / `hasOrdersNoEngagements`) — **baseline
103 → 107** (brand-new, bought-but-no-engagements, has-engagements, null/garbage guards). Because the demo client has
8 engagements the empty-state can't render for it, so verified by (1) the unit tests covering all three outcomes and
(2) confirming the populated path still renders live for the demo (8 timeline items, no `.dx-empty`, no error boundary).
`orders` is now threaded into EngagementTimeline. The Org-level brand-new welcome is intentionally left to the existing
"Set up your organization" onboarding checklist to avoid duplication. New: `src/store/org-firstrun.mjs` + `.test.mjs`.
Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`. Ships with c16-c35.

### Cycle 35 — #org polish pass: toast dismiss/safe-area + phase-nav scroll + intel-chip contrast (23 Jun)
Three presentation fixes. (a) The flash **toast** now sits above the iOS home-indicator (`bottom: calc(24px +
env(safe-area-inset-bottom))`), is a flex row with an ellipsised message, and carries a **× dismiss button** so it
never lingers under a notch or blocks content; applied to both #org and #account (shared `.ca-toast`). (b) The **Phase
Navigator** now horizontally **overflow-scrolls with scroll-snap + a faded right edge** below 560px (steps go
`flex:0 0 30vw` instead of cramming every phase into the width), keeping all phases reachable. (c) The "In your field"
**intel topic chips** had `hsl(h 70% 72%)` text that was borderline on the charcoal; lifted to `hsl(h 78% 82%)` —
measured **9.82:1** for the worst-case purple "Enterprise" chip against the real opaque backdrop, comfortably past AA.
CSS-only (no new tests; baseline holds at **103**). Verified live as the demo client on #org at 380px: phase nav
scrolls (overflow-x auto, snap-x, 4 steps ~114px, no page overflow); toast shows "Company profile saved." with a
working × dismiss; chips pass AA; 0 NEW console errors. Edited: `src/store/admin.css`, `src/store/OrgDashboard.jsx`,
`src/store/AccountDashboard.jsx`. Ships with c16-c34.

### Cycle 34 — #org timeline a11y: attendee-overflow chip + filter live announcement (23 Jun)
Two screen-reader-honesty fixes on the engagement timeline. (a) Attendee avatars capped at 5 and silently dropped the
rest; an `attendeeOverflow` helper now splits shown-vs-hidden and a "+N" chip (`.dx-av-more`, title = the hidden names,
aria-hidden since the wrapper already labels every attendee) appears so 6+ attendees never vanish. (b) Changing the
customer kind/phase/tag/search filter changed the visible count silently; a persistent polite live region now announces
"Showing N of M engagements" (the zero case stays owned by the existing empty-state to avoid a double-announce). Logic
extracted to a pure tested module (`src/store/timeline-a11y.mjs`: `attendeeOverflow` + `filterAnnouncement`) — **baseline
98 → 103** (overflow split, at/under cap, blank/null guards; announcement silent-when-unfiltered, narrowed/empty/all-match
counts, singular/plural). Verified live as the demo client on #org: clicking "Recaps" announced "Showing 3 of 8
engagements" (matching the 3 visible items) and "All" cleared it to silent; timeline renders clean (no error boundary),
no 380px overflow. Overflow chip is unit-tested (the demo's engagements have <= 3 attendees). New:
`src/store/timeline-a11y.mjs` + `.test.mjs`. Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`. Ships with c16-c33.

### Cycle 33 — #org spend-trend honesty: real-trend guard + orders-truncation note (23 Jun)
Two honesty improvements on the #org dashboard. (a) The relationship-pulse spend sparkline already existed but rendered
even for a single month (a one-bar "trend"); the month-bucketing was extracted to a pure tested module
(`src/store/monthly-spend.mjs`: `monthlySpend`, sums live [non-cancelled/refunded] order totals by calendar month, last
N months, skips undated orders rather than mis-bucketing, flags `hasTrend` only at >= 2 months) and the tile now renders
only when there's a genuine multi-month trend. (b) The company-orders preview silently capped at 8; it now shows an
honest "Showing the 8 most recent of {M}. See all {M} in your full history" whenever the list is truncated, so no orders
disappear without a count. **Baseline 93 → 98** (bucket+sum, exclude cancelled/refunded, last-N slice, skip-undated +
created_at fallback + currency, null/empty safe). Verified live as the demo client on #org: sparkline shows 2 bars
(2026-04 £14,400, 2026-05 £5,760, total £20,160) with an accurate SR label; truncation note correctly absent at 2 orders;
RecentOrders renders clean (no error boundary), no 380px overflow. New: `src/store/monthly-spend.mjs` + `.test.mjs`.
Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`. Ships with c16-c32 on the next deploy.

### Cycle 32 — benchmark-gap chip on the #org "Your next move" card (23 Jun)
The next-move card recommends strengthening the client's weakest pillar; this adds a small honest chip under the
heading that quantifies the gap the move closes, using only data already in the maturity set (never invents a
benchmark). It shows the headroom to the engagement's target tier ("↑ +5 to reach your target (4 → 9)") in lime, or,
when no target is above the current score, the standing vs the industry benchmark ("+1 ahead of / -2 behind your
industry (4 vs 6)") in lime/amber. The gap predicate is a pure module (`src/store/next-move-gap.mjs`: `moveGap`,
target-first then benchmark fallback, null when there's nothing honest to show) and unit-tested — **baseline 89 → 93**
(target headroom, benchmark ahead/behind, target-equal-to-current ignored, one-decimal rounding, null guards for
zero/garbage/no-refs). Verified live as the demo client (Naa, Ethical Quest) on #org: weakest pillar Data 4, chip read
"↑ +5 to reach your target (4 → 9)" in lime with the SR sentence "Data is 5 below your target tier", 0 console errors,
no 380px overflow. New: `src/store/next-move-gap.mjs` + `.test.mjs`. Edited: `src/store/OrgDashboard.jsx`,
`src/store/admin.css`. Ships with c16-c31 on the next deploy.

### Cycle 31 — staff engagement quick-start templates + pre-share checklist (23 Jun)
Two help-staff-go-faster-and-not-ship-broken-items moves in the EngagementEditor (the '+ New engagement' drawer):
**(a) quick-start templates** — for a NEW engagement, a "Quick start" row of five buttons (Kickoff / Recap / Milestone /
Deliverable / Review) that prefill kind + a title stub + a sensible phase (data-driven from an `ENG_TEMPLATES` const).
applyTemplate sets kind/phase and only fills the title when it's blank, so a half-typed title isn't clobbered.
**(b) pre-share checklist** — whenever Visibility is set to Shared, a live checklist shows exactly what the client will
see and whether the item is complete (title present, date present, and for recaps/deliverables a recap link OR inline
content). When incomplete it reads "Before sharing, finish:" with the missing item flagged and the save button disabled
(title hint: save as a draft instead); when complete it turns teal, "Ready to share — {client} will see:", save enabled.
This mirrors the 0013 chk_engagement_content constraint so a Share-on-save can't fail server-side. The checklist
predicate was extracted to a pure module (`src/store/engagement-checklist.mjs`: `shareChecklist` + `isShareReady`) and
unit-tested — **baseline 85 → 89** (milestone needs title+date only; recap/deliverable add a content rule; isShareReady
true only when all pass; whitespace-only fields don't count; empty-arg safe). Verified live as staff in the editor:
templates render + apply (Kickoff → kind kickoff, title "Kickoff — mapping the climb"); shared+kickoff → ready, save
enabled; switched to recap with no content → content todo, save disabled; 0 console errors; no 380px overflow (templates
wrap, drawer 350px). `role="status"`/`aria-live="polite"` on the checklist, SR text on each item. New:
`src/store/engagement-checklist.mjs` + `.test.mjs`. Edited: `src/store/ClientsManager.jsx`, `src/store/admin.css`.
Ships with c16-c30 on the next deploy.

### Cycle 30 — staff in-client engagement filter + unshared-draft nudge (23 Jun)
In the staff ClientDetail engagement timeline: a type-filter chip row (All + the kinds present) with a live "{n} of
{total}" count so staff can focus a busy client's timeline, and an unshared-draft nudge — "{n} drafts not yet shared
with {client} — only **Shared** items appear on their dashboard" — so nothing a buyer should see is left invisible.
"Draft" = not shared and not archived (so an intentionally archived item isn't nagged about). The filter only appears
when >1 kind is present; the nudge only when there are drafts. The kinds/draft-count/filter logic was extracted to a
pure module (`src/store/engagement-view.mjs`: `engagementView`) and unit-tested — **baseline 81 → 85** (distinct kinds,
draft = not shared/archived, kind filter incl. "all" passthrough, null/garbage guards). Positive verification via the
unit tests because the demo client I could reach (Northwind, 2 shared same-kind engagements) correctly shows neither
chip nor nudge, and the preview back-nav to a richer client wasn't drivable; confirmed the ClientDetail still renders
cleanly after the refactor (no console errors, no 380px overflow, build clean, 85 tests). New: `src/store/engagement-view.mjs`
+ `.test.mjs`. Edited: `src/store/ClientsManager.jsx`, `src/store/admin.css`. Ships with c16-c29 on the next deploy.

### Cycle 29 — staff portfolio health bar + quiet-first sort (23 Jun)
The first staff-facing roadmap cycle. The Clients & DX list now opens with a portfolio-health bar: recency-bucket
chips from each client's most-recent engagement (active ≤7d teal / steady ≤30d / going quiet 31-60d amber / cold 60d+
red / no activity), thresholds aligned with the existing staleBadge. A "Show quiet first" toggle re-sorts the list so
the clients drifting out of contact surface at the top (no-activity = most quiet). Real signal, no seeded data. The
recency/bucket/sort logic was extracted to a pure module (`src/store/client-recency.mjs`: daysSince / recencyBucket /
portfolioHealth / quietFirstRank) and unit-tested — **baseline 77 → 81**. Verified live as the staff user in Clients &
DX: bar reads "2 active (≤7d) · 1 no activity" across 3 clients, and "Show quiet first" lifts Northwind Logistics
(no activity) to the top; 0 console errors, no 380px overflow, build clean, 81 tests. New: `src/store/client-recency.mjs`
+ `.test.mjs`. Edited: `src/store/ClientsManager.jsx`, `src/store/admin.css`. Ships with c16-c28 on the next deploy.

### Cycle 28 — ask-your-admin mailto for stranded members (23 Jun)
A non-admin member who hits a wall (company settings, team, a licence they can't manage) now gets a warm route:
"Need access to company settings, team or a licence you can't manage? Ask your admin (Naa) →" — a prefilled mailto
to their company's primary contact / admin, with a named greeting and an "Re: {company} account access" subject;
falls back to the Greatstone team (DX@greatstoneinternational.co.uk) when the admin email is unknown. Shown ONLY
for members (hidden for admins — confirmed live: the line is absent for the admin demo-client). The admin email is
read with a small RLS-safe customer_users query (customer_self scopes it to the member's own company; a no-op for
admins). The select-admin + mailto-build logic was extracted to a pure module (`src/store/ask-admin.mjs`: `pickAdmin`
+ `askAdminMailto`) and unit-tested — **baseline 73 → 77** (primary-wins / role=admin / null; named greeting + encoded
params; team fallback; empty-company → "your"). This positive verification matters because the demo member sign-in
couldn't be driven through the preview's auth form reliably; the admin-negative case was confirmed live. 0 console
errors, build clean, 77 tests. New: `src/store/ask-admin.mjs` + `.test.mjs`. Edited: `src/store/AccountDashboard.jsx`,
`src/store/admin.css`. Ships with c16-c27 on the next deploy.

### Cycle 27 — quote valid-until countdown + reorder-last (23 Jun)
Two #account conversion nudges. (a) Each open, firm quote with a `valid_until` now shows a countdown chip beside the
date — "N days left" (teal), amber "≤7 days left" / "Expires today", red "Expired" once past — reusing the
unit-tested `daysUntil` from licence-expiry.mjs (date-guarded; only for open quotes, so a won/closed quote never
shows a stale "Expired"). Ethical Quest's quote Q-2026-000042 reads "valid until 31 Jul 2026 · 38 days left". (b) A
"Reorder your last order" button in the Purchases header reuses the existing `reorder()` (adds the newest live
order's items to the cart at last price, redirects to the shop, surfaces skipped retired lines). Verified live: the
countdown chip + the reorder button render, no 380px overflow, 0 console errors, build clean, 73 tests. (Spend
context already exists in the #org org-stats "Invested" tile; not duplicated on #account to avoid noise.) Edited:
`src/store/AccountDashboard.jsx`, `src/store/admin.css`. Ships with c16-c26 on the next deploy.

### Cycle 26 — "Discuss this" mailto on timeline items + quotes (23 Jun)
A client can now start a conversation in context. Each #org engagement-timeline item gets a "Discuss this →" link
in its action row (a prefilled mailto to the canonical DX@greatstoneinternational.co.uk, subject "Re: {title}
({company})", body naming the item + date), and each #account quote that has no order yet shows "Discuss this →"
in its Invoice cell (instead of a dead "–"), subject "Re: quote {reference}". All params are encodeURIComponent'd;
the canonical address was already in-repo (confirmed against the brand skill). No parent row/card click-handlers on
these elements, so no stopPropagation needed. `.dx-discuss` added to the c16 print-hide list (mailto links are
chrome, not board content). Verified live: #org item → "Re: Go-live readiness (Ethical Quest)" with the dated body,
#account quote → "Re: quote Q-2026-000042"; 0 console errors, no 380px overflow, build clean, 73 tests. CSS-light
(reused .dx-copy / .ca-link). Edited: `src/store/OrgDashboard.jsx`, `src/store/AccountDashboard.jsx`, `src/store/admin.css`.
Ships with c16-c25 on the next deploy.

### Cycle 25 — personalised welcome-back / since-last-visit line (23 Jun)
A subtle one-liner above the identity name: "Welcome back, {first name}" on #org (where the h1 is the company), and
on #account only on a return visit ("Welcome back · last here …", since its h1 already greets by name). Front-end
only: `sinceLastVisit(key)` records the visit timestamp in localStorage (`gs:lastvisit:org` / `:account`) and returns
the gap for the PREVIOUS visit ("last here earlier today / yesterday / N days ago"), date-guarded, first-visit shows
no stale "days ago" (server-side per-user last-seen stays the gated wishlist item). Extracted to a pure module
(`src/store/welcome-back.mjs`: `sinceLastVisit` + `firstNameOf`) and unit-tested — **baseline 68 → 73**. Adversarial
catch: the first verification showed "last here earlier today" even after clearing storage — React StrictMode's dev
double-invoke of the useState initializer was reading back the timestamp it had just written. Fixed with a per-page-load
memo so the real-storage path is idempotent (tests inject opts → bypass it); re-verified that a genuine first visit shows
only "Welcome back, Naa" and a return visit adds "last here earlier today". Also added `.acct-welcome` to the c16
print-hide list (a casual greeting shouldn't print on the board summary). 0 console errors, no 380px overflow, build
clean, 73 tests. New: `src/store/welcome-back.mjs` + `.test.mjs`. Edited: `src/store/OrgDashboard.jsx`,
`src/store/AccountDashboard.jsx`, `src/store/admin.css`. Ships with c16-c24 on the next deploy.

### Cycle 24 — loading skeletons for late-mounting #org bands (CLS fix) (23 Jun)
The maturity radar already reserved its height while loading (a 300px `.st-skel`), but the relationship pulse
(OrgAnalytics) and the return-on-transformation strip (ReturnStrip) both returned `null` until their Supabase reads
resolved — so the page jumped as each band popped in. Both now render a height-reserving `.st-skel` placeholder
while `engagements`/`orders` are null (124px and 118px, matching the real bands), `aria-hidden` so screen readers
don't announce the shimmer, reduced-motion safe (the shimmer is killed under prefers-reduced-motion via the existing
.st-skel rule). Reused the existing shimmer with inline `min-height:0` to override its 230px default. Only the
loading path changed; the empty/error/loaded states are untouched. Verified live by remounting via SPA nav: caught
both skeletons at 124px/118px, then the real four-tile pulse + return strip fill in with no leftover skeleton and no
reflow; 0 console errors, no 380px overflow, build clean, 68 tests. CSS-free cycle (inline styles). Edited:
`src/store/OrgDashboard.jsx`. Ships with c16-c23 on the next deploy.

### Cycle 23 — next-touchpoint reassurance tile (23 Jun)
The #org relationship pulse showed Last touchpoint / Touchpoints / Spend trend — all backward-looking. It now also
answers "when do we next meet?" A "Next touchpoint" tile reads the soonest future-dated engagement (date-guarded)
and shows the countdown + what it is: "in 7d · Milestone · Production launch · 30 Jun 2026" for Ethical Quest. When
nothing is scheduled it's a warm CTA, not a dead tile ("Nothing booked yet. Let's plan your next session →" to
#go/contact), and the band's early-return now also fires for an org whose only activity is an upcoming session. Teal
accent ties it to the "upcoming" colour language. Verified live: tile reads "in 7d" with the milestone detail,
pulse now has four tiles, 0 console errors, no 380px overflow, build clean, 68 tests. Edited: `src/store/OrgDashboard.jsx`,
`src/store/admin.css`. Ships with c16-c22 on the next deploy.

### Cycle 22 — per-phase "what this delivers" caption (23 Jun)
The PHASE_BLURB one-liners (Discovery "Mapping the work and the drains", Build "Wiring the systems that buy hours
back", Adoption "Embedding it in how you work", Review "Measuring the return, planning the next climb") were only
in the phase-button aria-labels. The #org phase navigator now carries a visible caption under the stepper that
tells the value story: "You are in **Adoption** — Embedding it in how you work." for the current phase, switching
to "Showing **Discovery** — Mapping the work and the drains. · Show all phases" when a phase is filtered (merging
the old "Showing X only" clear-action into the same line). role="status" so the focus change is announced; the
phase name pops in accent. Verified live: default shows the current phase (Adoption), filtering to Discovery swaps
the blurb + offers clear, clearing restores; 0 console errors, no 380px overflow, build clean, 68 tests. It sits
inside .dx-phasenav so the c16 print rule already hides it. Edited: `src/store/OrgDashboard.jsx`, `src/store/admin.css`.
Ships with c16-c21 on the next deploy.

### Cycle 21 — licence-key expiry badges + renewal nudge (23 Jun)
The keys tab now shows an attention badge per key: red "Expired" once past, amber "Expires in N days" within 30
days, nothing further out (date-guarded → no Invalid Date / NaN). On #account, the keysByOrder fetch now includes
`expires_at`, an "N licence keys expiring within 30 days" row joins the c18 pending-actions banner (urgent, deep-links
to the keys tab), and a "Renew your licences" branch becomes the top `nextStep` when any key is expiring. The expiry
logic was extracted to a pure, dependency-free module (`src/store/licence-expiry.mjs`: `daysUntil` / `expiryInfo` /
`isExpiringSoon`) shared by LicenceKeys + AccountDashboard and unit-tested — **test baseline 63 → 68** (over / soon /
ok / null / Invalid-Date / issued-only / past-excluded). This positive verification matters because the demo keys both
sit outside 30 days (Mortar expires May 2027, Bedrock perpetual), so the badge correctly doesn't render in preview; the
negative path was confirmed live (no badge, nextStep stays "Activate your licences"), 0 console errors after a dev-server
restart cleared stale HMR noise. Edited: `src/store/LicenceKeys.jsx`, `src/store/AccountDashboard.jsx`, `src/store/admin.css`;
new `src/store/licence-expiry.mjs` + `src/store/licence-expiry.test.mjs`. Ships with c16-c20 on the next deploy.

> **Deploy backlog (as of ~20:25):** c16 (5ed5301) → c49 (a4be0a2: staff list honest error states); through c48 (e0436b1: staff copy-key + expiry)
> **plus** two John-requested changes — a company-profile UI polish (5dfd223) and the **#org tabbed redesign (9de90d8: 5 tabs
> + clickable KPI tiles + #org persistent toast live region, folding in roadmap rows 40+42)** — **thirty-four cycles + 2 John
> changes** — are all committed; the combined dist is
> staged in the mirror as **index-B_otXPJE.js** (AccountDashboard chunk carries the order-row disclosure-button name + goTab focus-into-panel; OrgDashboard chunk also carries the phase-nav aria-current + upcoming-dim; OrgDashboard chunk carries the org-tabs/org-panel structure + org-stat
> is-link + org-print-root tabpanel-unhide; #account now also has the persistent gs-sr-only toast region [c40]; sigs incl.
> dx-tagrow + acct-pending + acct-ordsearch + acct-keychip + lk-expbadge + dx-phase-delivers + org-an-next + acct-welcome +
> acct-qcd + acct-askadmin + ci-health + ci-draftnudge + eng-templates + eng-checklist + org-move-gap + pr-field/pr-hint/org-sec-sub +
> acct-ordtrunc + dx-av-more + ca-toast-x + dx-empty-kinds + acct-refcopy/acct-keystools + org-mat-assessed + org-mat-illus + org-tabs). The Netlify MCP deploy-site proxy
> has 404'd at zipAndBuild on EVERY attempt since ~03:25 (~62 tries over **~18h** — a sustained Netlify-side outage; **worth
> checking the Netlify status page / the netlify-mcp.netlify.app proxy**). One successful deploy ships
> everything (c16-c49 + both John changes). Test baseline is now **115**. The loop runs a stretched ~20-min cadence
> to conserve while the proxy is down, still building + retrying each wake; local commits + the staged mirror are the durable
> record — the moment a deploy succeeds the whole batch goes live and the cadence drops back to ≤10 min.

### Cycle 20 — inline copy-key on the per-order licence chips (23 Jun)
Adversarial finding: the **Keys tab** (LicenceKeys) already had a robust copy (clipboard + select-to-copy fallback +
per-key "Copied ✓" + aria) — so the real gap was the **order-detail** key summary, which only bounced you to that tab.
Now each per-order key chip is a copy button: clicking it writes the key to the clipboard (the keysByOrder fetch now
includes `licence_key`), flips to "Copied ✓" with an aria-live announcement, and reverts after 1.8s; per-key state so
only the clicked chip flips. If the clipboard API is blocked (insecure origin), it falls back to the Keys tab where the
key is visible + select-to-copy works. Verified live as demo-client: a chip ("Bedrock Platform · Site licence") flips to
"Copied ✓" on the stubbed-success path, the real blocked-iframe path bounces to Keys, no 380px overflow, 0 console
errors, build clean, 63 tests. Edited: `src/store/AccountDashboard.jsx`, `src/store/admin.css`. Ships with c16-c19.

### Cycle 19 — #account Purchases order search (23 Jun)
A search box above the order-history table filters the rendered orders by reference / invoice number / item name /
status, with a live "{n} of {total}" count (aria-live). It only appears when there are orders (no-op for an empty
or loading/errored table); a no-match search shows a "No orders match …" row with a Clear-search button. Keyboard-
operable with a visible focus ring. Verified live as demo-client: "0002" narrows 2→1 with "1 of 2", a nonsense
query shows the no-match row, Clear restores both; no 380px overflow, 0 console errors, build clean, 63 tests.
Edited: `src/store/AccountDashboard.jsx`, `src/store/admin.css`. Ships with c16-c18 on the next successful deploy.
