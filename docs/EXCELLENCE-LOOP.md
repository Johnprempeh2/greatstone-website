# Excellence Loop — whole-site, multi-persona improvement ledger

**Started:** 2026-06-21 · **Driver:** `/loop` (self-paced, dynamic mode)
**Mission (John):** Spin up multiple agents to walk every part of the site as different user types *and* admins. Surface improvements, then implement them — make everything function perfectly, make the UI incredible, keep raising the bar each cycle. Add whole new sections where they earn their place. Ensure the CMS side is fully editable and functioning. Improve UX from every angle. Research best practices + cutting-edge features.

**Repo:** `greatstone-puck-proof` (React + Vite + Puck CMS + Supabase + Stripe).
**Live:** greatstone-home.netlify.app/puck-proof/
**Shared-repo hazard:** Intel-Hub + DX-hub loops also write here + share one deploy. ALWAYS scoped `git add <files>` (never `-A`); re-check `git log`/`git status` before every commit + deploy.

## Operating rules for this loop
1. Build on the 33+ prior review cycles (see `OVERNIGHT-REVIEW.md`) — don't re-surface resolved items. Aim higher each pass.
2. Every change: `node --test` green + `npm run build` clean + live-preview verified before commit.
3. Scoped commits. Re-check `git status` before commit/deploy so I never sweep another loop's WIP.
4. CMS-editability is a first-class lens: if content is hardcoded that an editor should control, that's a finding.
5. Track every cycle below: findings → what shipped → what's deferred → next bar.

## Baseline (start of loop, 2026-06-21)
- Tests: 58/58 green. Build: clean (eager `index` 352.7KB / gzip 100.3KB; three 728KB + puck 288KB + supabase 213KB all lazy).
- Surfaces in scope: public pages (home/method/services/industries/proof/about/intelligence/contact/climb), method explorer (#breakdown), storefront (#shop/#product), cart/checkout, account (#account), org dashboard (#org), invoice (#invoice), licence keys, AI Intelligence Hub (intel), and the full admin (Puck editor + console: Pages/SEO/Products/Team/Versions/Activity/Releases/Studio).

---

## Cycle 1 — 2026-06-21 — multi-persona audit + first improvements

**Audit:** 9 agents (8 personas — B2B prospect, shopper, mobile, a11y, CMS-editor/admin, perf/SEO, Intel-Hub user — + a cutting-edge researcher) → synthesis. 55 raw findings → ranked plan. Verdict: site mature (no fresh regressions); a cluster of high-impact zero-risk wins remained. Full audit output archived in this session.

**Shipped (all verified: 58/58 tests, clean build, live-preview on BOTH seed + migrate paths):**
1. **Deep Dive duration unified to 30 min** (matches the live `/30min` Calendly). `store.js` contact Steps 45→30, `BookDeepDive.jsx` default body + `seed-pages.json` Invite "two hours"→"thirty focused minutes"; guarded idempotent `migrate()` rewrites persisted stores. ⚠️ *John: if the Deep Dive should be longer, create a longer Calendly event and I'll flip the copy up.*
2. **Home hero primary CTA** — seeded `Book a Deep Dive`→#book (was empty); migrate backfills only the empty default, scrollCue preserved. Closes the #1 conversion gap (no above-fold action).
3. **44px touch targets** under `@media (pointer:coarse)` — header (`studio.css`: Pages dropdown + rows, account icon, ⌘K, every `.gs-btn` incl. customer sign-in submit), PasswordInput Show/Hide (44×44 hit-area, text unchanged), method-explorer pick pills + Back. No desktop change (verified accountbtn still 38px on fine pointer).
4. **Credibility copy** — About Team intro dropped the "Placeholder names and roles" framing (it sat above 3 real founders) → honest "founders from day one, full team named at kickoff".
5. **Storefront correctness** — product "Request a quote"/"Request quote" now open a **prefilled enquiry mailto** (product+vendor in subject/body, encodeURIComponent-safe) instead of the wrong-meeting-type Deep Dive Calendly; catalogue cards show **"ex VAT"** (matches product page "+ VAT"); added **Price: high to low** sort (verified reorders £4,827→…).
6. **CMS editability** — `InsightsGrid` gained a per-post **Link** field (linked posts become focusable card-links with a "Read →"; unlinked stay plain previews, killing the "clicks nowhere" feel); `BookDeepDive` industry dropdown is now an **editable Puck array** (was a hardcoded SECTORS const) with the old list as default + safe fallback.
7. **Intel Hub bugs** — radar axes were a blind `TOPICS.slice(0,8)` (dropped open-source + multimodal regardless of interest) → now ranked by the visitor's own interest with briefing-count tiebreak; topic chips + theme count derived from topics actually present on briefings → the **dead "Hardware" chip (0 briefings) is gone** (11→10). Code-only; `data/ai-intel.mjs` untouched (other loop's).

**Status:** ✅ committed `35c756f` (scoped, 13 files; tree was clean of other-loop WIP). Adversarial review (3 lenses) returned 2 minor voice/consistency fixes (card "ex VAT"→"+ VAT" to match the product page; em-dash removed from a new Puck field label) — both applied + reverified.
⚠️ **Deploy staged but BLOCKED on Netlify auth.** Fresh build (`index-MR1Z-Ke0.js`) mirrored into `../greatstone-homepage-deploy/puck-proof/`, but the Netlify CLI in this session is "Not logged in" (no `NETLIFY_AUTH_TOKEN`, no stored config). One command finishes it once authed:
`cd ../greatstone-homepage-deploy && netlify deploy --prod --dir=. --site=3b1e97e6-e184-4251-badd-deed532be3ab`
Live site (`/puck-proof/`) still serves the prior bundle `index-Ch6Nm7Ge.js` until that runs. The commit is the durable record; whoever next deploys from main carries these changes forward.

**Deferred / needs-John (logged, not shipped this cycle):**
- **Footer legitimacy** (company no. / registered office / Privacy+Terms) — needs John's real Companies House data + actual legal pages; fabricating a company number on a live B2B site is a credibility/legal risk, so parked.
- **SEO launch batch** (flip `noindex`, real canonical domain, sitemap/robots, prerendered OG, Product JSON-LD) — gated on John's domain cutover; must ship together.
- **Contact form is a labelled prototype** (doesn't transmit) — needs a decision on where submissions go (backend vs Calendly prefill vs live embed).
- **Guest-checkout confirmation** says "in your account" though guest orders are RLS-invisible — needs careful handling on the highest-stakes flow.
- **Site Settings panel** (footer/invoice VAT-number/Intel-hub editability) — larger build; invoice still prints `[add VAT no.]` (John's VAT number is a known production blocker).

**New-section ideas (future cycles):** Trust layer (client/heritage logo strip + attributed testimonials, reframe the Deloitte/Lloyds/NHS line as leadership heritage); engagement-model/pricing-shape band; Intel-Hub retention layer (save/follow/"new since last visit"); briefing search + per-row freshness; Services FAQ + FAQPage schema.

---

## Cycle 2 — 2026-06-22 — new section + deepest-surface conversion + AEO

**Cycle 1 went LIVE** (production bundle `index-MR1Z-Ke0.js` confirmed at greatstone-home.netlify.app/puck-proof/). Cycle 2 audit: 4 specialist agents at a higher bar (CMS-editability completeness, under-covered surfaces, next conversion friction, new-section feasibility) + synthesis → 22 findings → plan.

**Shipped (verified: 58/58 tests, clean build, live-preview on seed + migrate + responsive desktop/mobile):**
1. **NEW SECTION — Services FAQ block** (`src/blocks/Faq.jsx`): accessible accordion (button `aria-expanded`/`aria-controls` → region), fully Puck-editable (kicker/heading/intro + Q/A array), 6 objection-handling Q&As in house voice, **+ FAQPage JSON-LD** (escaped, dormant under noindex, ready for cutover). Registered in `puck.config.jsx` (Proof category), seeded on the Services page (between StatStrip and Invite) + guarded `_faqSeeded` migrate for existing stores. Verified: renders, toggles, FAQPage schema emits, inserts on migrate.
2. **#breakdown in-explorer booking CTA** (the cycle-1 prospect-agent gap — the deepest engagement couldn't convert): persistent "Book a Deep Dive" in the explorer top bar (desktop) + a guaranteed one in the open-pillar detail panel (covers mobile, where the detail panel overlays the top bar). `#book` routes through App's global interceptor → Calendly popup. Top-bar CTA hidden <600px (it crowded the logo / pushed Back off-screen — caught + fixed in preview). Per-pillar "Inspect this pillar" deduped when it would just be `#book`.
3. **`public/llms.txt`** — AEO brief for AI answer engines (house-voice summary + page index). Not gated on the domain cutover (unlike robots/sitemap); served 200 text/plain.
4. **Terrace slab width clamp** — `min(100%, calc(70% + i*15%))` so editor-added slabs (4+) can't overflow the 600px rail.

**Status:** ✅ committed `3346d7b`. Adversarial review (2 lenses) → 2 fixes applied + verified: (a) corrected a false "Security is one of the eight pillars" FAQ claim (canonical pillars are People/Communication/Innovation/Data/Customer/Competition/Technology/Value — no Security) across seed + block default + migrate; (b) explorer Book CTAs now `onClose` so focus is not trapped behind the Calendly popup. Production correctness of the copy fix confirmed via `grep dist/` (the dev preview showed stale text — a known Vite JSON-import HMR cache quirk that does NOT affect the build).
⚠️ **Deploy staged but BLOCKED on Netlify auth** (same as C1; CLI "Not logged in"). Build `index-DXOLVs_H.js` mirrored into `../greatstone-homepage-deploy/puck-proof/`. Finish with: `cd ../greatstone-homepage-deploy && netlify deploy --prod --dir=. --site=3b1e97e6-e184-4251-badd-deed532be3ab`. (C1 was deployed live this way — confirmed bundle `index-MR1Z-Ke0.js`.)

**Skipped this cycle (flagged, NOT mine to touch / dead code / larger):**
- ⚠️ **`#org` OrgDashboard silently swallows orders/quotes load errors** (HIGH — a paying company can be shown £0/0 on a transient failure; `OrgDashboard.jsx:122-126` destructure only `{data}` and resolve to `[]`). This is the **DX-hub loop's hot file** (6 recent commits) — leaving it for that loop. Fix: destructure `{data,error}`, `setErr(error)`, keep prior state; align "Invested" currency to `liveOrders[0]?.currency`.
- **ProductsPanel category logo/blurb/count not editable** — but `ProductsPanel` is imported and **not rendered** (dead code); the live category editor is the Supabase `CatalogueAdmin`. Real fix belongs there (commerce domain), or retire ProductsPanel.
- **MaturityMap tiers hardcoded to 3** (4th tier never activates; removing one orphans an SVG label) — needs deriving `trig`/label anchors from `tiers.length` (M). Deferred.

**Cycle-3 candidates (audit-ranked):** **Global Site-Settings panel** (highest-leverage editability gap — logo/siteName/footer-tagline/header-CTA are hardcoded across Header+Footer+AdminConsole; wire to `state.settings`); "How we work" engagement band on Services; contextual #book bridges (IntelArticle — Intel-loop domain — + commerce empty-states); StatStrip editor count-up replay polish; MaturityMap tier-count robustness.

---

## Cycle 3 — 2026-06-22 — Global Site-Settings panel + customer-flow bug fixes

**Cycle 2 went LIVE** (production bundle `index-DXOLVs_H.js`). Cycle 3 audit: 3 agents (admin/CMS depth, account/commerce, polish/perf/cutting-edge) + synthesis → 6 verified safe wins + 2 buildable sections.

**Shipped (verified: 58/58 tests, clean build, live-preview):**
1. **NEW — Global Site-Settings panel** (the top remaining editability gap; John's explicit priority). `src/cms/SiteSettingsPanel.jsx` (new) edits the global chrome: **logo (MediaField), site name, header CTA label, footer tagline** — previously hardcoded across Header + Footer + AdminConsole. `store.js`: `DEFAULT_SETTINGS` + additive idempotent migrate backfill + `updateSettings()`. Wired into the admin console (People & settings rail, manage-gated) with a live header/footer preview; Header/Footer/AdminConsole now read from `state.settings` (fallback to the old constants). Verified: public chrome binds to settings; build carries it; SEED_VERSION unchanged (no reseed); the dev preview's patch-then-reload "revert" was traced to the existing correct pagehide-flush, not a bug.
2. **#order-confirmed counterfeit-success guard** (HIGH, customer-facing): a bare/garbage `#order-confirmed` (bookmark, Back/Forward, hand-typed) used to render a fake "order confirmed" AND wipe the basket + fire a phantom purchase event. Now gated on a valid `cs_(test|live)_` session id → neutral "We couldn't find that order" state, basket preserved. Verified both paths in-browser (bare → neutral + cart kept; valid session → success + cart cleared + ref + test banner).
3. **InvoiceView infinite-spinner fix** (HIGH, customer-facing): a fetch error on the paid-order invoice hung forever on "Loading…". Added `.catch` → falls through to the existing "Invoice not found" state.
4. **Releases "last published" by label, not status** (MEDIUM): restore/discard snapshots copy `status:'published'`, so the board could report a restore/discard as the last publish. Now matches `label==='Published'` (only `publish()` writes it).
5. **Never-published draft no longer double-counted as "unpublished changes"** (LOW): `!eq(data, null)` is always true; both OverviewPanel + ReleaseBoard now require `published != null` for drift.

**Status:** ✅ committed `49eda95`. Adversarial review (3 lenses, 18 agents) → 5 findings, all LOW/non-blocking (it positively re-verified the ReleaseBoard label-match assumption). Applied the 3 that complete the new feature: AdminConsole logo alt now tracks `siteName`; the panel previews mirror the real default-logo fallback with decorative `alt=""`. Deferred (pre-existing, reviewer-flagged out-of-scope): seeded pages read "Never published" on the Releases board (status pill says Published) — fix in a later cycle via a `published != null` fallback.
⚠️ **Deploy staged but BLOCKED on Netlify auth** (same as C1/C2). Build `index-DDlyi-Dv.js` mirrored into `../greatstone-homepage-deploy/puck-proof/`. Finish: `cd ../greatstone-homepage-deploy && netlify deploy --prod --dir=. --site=3b1e97e6-e184-4251-badd-deed532be3ab`. (C1+C2 went live this way.)

**Flagged for the DX-hub loop (their hot files — `Account:` commits):** Billing tab flashes the "no purchases yet" empty-state before `loadingOrders` resolves (AccountDashboard); licence-key state isn't date-aware so an expired key shows a green "issued" chip + live Download (LicenceKeys). Both MEDIUM, both quick.

**Cycle-4 candidates:** standalone Media Library panel (alt-text edit + delete via the unused `removeAsset`); "How we work" engagement band on Services; StatStrip editor count-up replay; MaturityMap tier-count robustness; the two DX-hub account fixes if they don't take them.

---

## Cycle 4 — 2026-06-22 — standalone Media Library panel + board-accuracy fix

**Cycle 3 went LIVE** (production bundle `index-DDlyi-Dv.js`). Cycle 4 audit (3 agents: fresh first-visitor/mobile re-walk, perf+cutting-edge research, remaining CMS gaps) running for cycle 5; meanwhile built the top CMS-completeness item.

**Shipped (verified: 58/58 tests, clean build; asset store round-trip checked):**
1. **NEW — standalone Media Library panel** (`src/cms/MediaLibraryPanel.jsx`): the one place to *curate* the asset library (the MediaField picker only adds + chooses). Staff can add (URL/upload, 600KB cap), **edit each image's alt text** (commit-on-blur, accessibility), and **delete** unused images — wiring up the previously **dead-code `removeAsset`**. `store.js` adds `updateAsset(state,id,patch)` (immutable, no-op on missing id). Registered in the AdminConsole Content rail (`need:'edit'`) + ALL_VIEWS/TITLES; `.gs-ml-*` styles (responsive). Asset functions verified via a Node round-trip (dedupe / alt-edit / delete-to-zero).
2. **ReleaseBoard "Never published" accuracy** (deferred from C3): a published page with no `'Published'` version snapshot (seeded/imported pages ship `versions:[]`) now reads "Published" instead of contradicting its own status pill.

**Status:** ✅ committed `5818d2f` (deploy staged, build `index-D7jeNUai.js`). Adversarial review (2 lenses) → 4 findings, all LOW/MEDIUM polish on the new panel, all applied: duplicate-add now shows "already in your library" (URL + upload) instead of silently clearing; delete buttons + alt inputs get per-image accessible names (was identical "Delete this image" / "Alt text" across rows — a real WCAG gap on a destructive action); asset delete now routes through the on-brand `ask()` confirm + `flash()` toast, matching `deletePage`. Cycle-4 audit also ran → feeds cycle 5.
⚠️ **Deploy staged but BLOCKED on Netlify auth** (same as C1-C3). Finish: `cd ../greatstone-homepage-deploy && netlify deploy --prod --dir=. --site=3b1e97e6-e184-4251-badd-deed532be3ab`.

---

## Cycle 5 — 2026-06-22 — time-savings calculator (new section) + per-sector CTA

**Cycle 4 went LIVE** (production bundle `index-D7jeNUai.js`). Cycle 5 acts on the cycle-4 audit (5 ship-now wins + 2 buildable sections); built the two highest-value conversion-path items.

**Shipped (verified: 58/58 tests, clean build, live-preview):**
1. **NEW — Time-savings calculator** (`src/blocks/TimeSavingsCalculator.jsx`): the interactive tool the site *already advertised* but never had (the ContactBand promised "Run the time-savings calculator → services", which had none — a broken promise on the conversion page). Three editable inputs (team size, hours lost/person/week, hourly cost) → live "hours a year" + "£ cost a year" (`hoursYr = team×hours×weeks`, clamped). Every label/default/working-weeks + the CTA are Puck-editable; result is `aria-live`; `Field` is module-scope (no focus-loss). On-brand ("see the hours you are quietly losing"), honest footnote ("a guide, not a quote"). Registered (Proof category), seeded on Services (after the stats, before the FAQ) + guarded `_calcSeeded` migrate. Verified math (12×5×46 = 2,760; 50×5×46 = 11,500) + live update in preview. **Fulfils the ContactBand promise.**
2. **IndustryPicker per-sector CTA**: the signature "pick your sector → see your drains" interaction dead-ended at peak intent; added an editable "Book a Deep Dive" CTA (→ #book) inside the result card (mirrors the C2 #breakdown pattern). Verified in preview.

**Status:** ✅ committed `5818d2f`→`<pending>`. Adversarial review (2 lenses) → 3 findings (all on the new calculator), all applied: number inputs now snap to their clamped value on blur (no figure/input desync above the caps); the result is no longer one keystroke-spammy `aria-live` block with the CTA inside it — the visual figures are `aria-hidden`, a single concise `gs-sr-only` live region announces the result, and the CTA sits outside any live region. Math/clamp confirmed correct (no NaN on empty/junk/huge input).
⚠️ **Deploy staged but BLOCKED on Netlify auth** (same as C1-C4). Finish: `cd ../greatstone-homepage-deploy && netlify deploy --prod --dir=. --site=3b1e97e6-e184-4251-badd-deed532be3ab`.

**Deferred to later cycles (from the cycle-4 audit):** Contact-page split booking surface / "Template form" framing (make the BookDeepDive form functional via a prefilled mailto, like the product quote — HIGH, next); lazy-load AdminConsole + CMS panels out of the eager public bundle (perf, M — its own focused cycle); Products↔consulting bridge (new section). Skipped: Insights/Intelligence dead cards — MOOT (the IntelHub replaces that page's body publicly) + Intel-loop domain.
