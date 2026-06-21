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
