# Next cutover: parity audit (step 1)

John's decision (7 Nov 2026): move greatstoneint.com from the Vite SPA to the Next.js rebuild (`next-proof`), so that page edits made in the Website module reach the live site. This file is the first gate of that plan. Nothing has been changed or deployed because of it.

## How it was measured

- **Vite:** the live site at https://greatstoneint.com, deploy `gsam-source:prod:0117d3e6`.
- **Next:** a draft (unpublished) deploy of the Next build of the same `main` (0117d3e) on the staging site, at https://6aef8bad8e25bf665655b23d--gre3833-next-db-staging.netlify.app. It was prepared with `next-proof/scripts/prepare-netlify.mjs` and used the catalogue fixture.
- **Script:** `docs/next-cutover/audit.mjs`, with the route list in `routes.json` and the raw results in `result.json`. Each route was rendered in Chromium at 1440px, and the two sides were compared on:
  - status, title, first h1, main text length (within 25%), carousel islands, forms;
  - meta description, canonical, GTM and console errors.
  - The APIs were compared by GET status, and the response headers and redirects as well.
- **Planted difference:** Vite `/#about` was compared with Next `/dev-tools`. It came out **differs**, on title, h1, text and description, so the comparison does go red.

A note on the draft: in the draft context the Next functions have no auth database (`/api/auth/get-session` returns 502 "Auth database is not configured"). That 502 also explains the one console error every Next page shows. Every auth, account and API result below therefore needs a second run against a published staging deploy before it counts.

## Public pages

| Route (Vite / Next) | Verdict | Notes |
|---|---|---|
| `/` | matches | Same title, h1 and text (2241 chars). The carousel island is on both (1 each). |
| `/#dev-tools` / `/dev-tools` | matches | |
| `/#how-we-help` / `/how-we-help` | matches | Text 19704 vs 19646. |
| `/#services` / `/services` | matches | |
| `/#industries` / `/industries` | matches | |
| `/#about` / `/about` | matches | |
| `/#insights` / `/insights` | matches | |
| `/#climb` / `/climb` | matches | |
| `/#contact` / `/contact` | matches | The form is present on both. |
| `/#proof` / `/proof` | **missing** | Next 404. |
| `/#ai-market-intelligence` (and `#intel`) / `/ai-market-intelligence` | **missing** | Next 404. |
| `/#service/<slug>` / `/service/<slug>` | **unverified** | The test slug does not exist; needs a real service slug. |
| `/#shop` / `/shop` | differs | Title "Products" vs "Software Catalogue". Next adds a search form. Meta description differs. |
| `/#shop/aspose` / `/shop/aspose` | **differs** | Next shows about half the text (4391 vs 2058 chars). The vendor storefront is thinner. |
| `/#product/<slug>` / `/product/<slug>` | matches | Text 2851 vs 2718. |

## Signed-in and client areas

These were rendered signed out only, so they compare the shell, not the signed-in content.

| Route | Verdict | Notes |
|---|---|---|
| account, org, portal, catalogue admin, order-confirmed, invoice, join/&lt;token&gt; | differs | Next sets no `<title>` and no canonical on these pages (Vite does). Content is unverified, because auth is down in the draft. |
| `/privacy/interviews` | differs | Next's title lacks the " · Greatstone International" suffix, and there is no canonical. |
| Sign-in (Better Auth) | **unverified** | 502 in the draft context. Must be proven on a published staging deploy: sign in, sign out, a verified-email landing, and an org switch. |
| Interview / join flows | **unverified** | `/api/interview/portal` and `/api/interview/my-data` answer 404 on Vite but 405 on Next. Next has these routes and the Vite deploy does not. Check which is intended. |

## APIs

- **Same status on both:**
  - `/api/catalogue`;
  - the POST-only stores (`front-door`, `customer-store`, `staff-store`, `portal-store`, `deepdive-state`, `enquiry`, `request-quote`, `service-inquiry`, `stripe-checkout`, `stripe-webhook`, `deep-dive-client`), all 405 on GET;
  - `/api/admin/v1/health` (401).
- **Differs in the draft:** `/api/auth/get-session` (502), `/api/popularity` (503), `/api/compose-problems` (503). All three need the database and are unverified until the published staging run.
- **Matches:** `/_release`, `/_islands`, `/sitemap.xml`, `/robots.txt`. Next serves real JSON for `/_release` and `/_islands`; Vite answers those with its SPA page.
- **Netlify Database:** both builds run the same `netlify/database/migrations`. The Next proof reads the catalogue export, and it needs `NEXT_CATALOGUE_REQUIRED` (the live export) in production rather than the fixture.

## Redirects and headers

| Item | Verdict | Notes |
|---|---|---|
| Legacy vendor redirects (`/aspose`, `/groupdocs/*`) | matches in intent | Vite 301 to `/#shop/x`; Next 308 to `/shop/x`. |
| `/ironsoftware` | **differs (bug)** | Next sends it to `/shop/ironsoftware`, which is a 404. The vendor slug is `iron-software`. |
| `/about-us`, `/contact-us` | differs | Vite answers 200 with the SPA shell (no real page); Next answers 404. Add 301s to `/about` and `/contact`. |
| `Referrer-Policy`, `Permissions-Policy` | **missing on Next** | Vite sends both. |
| `Strict-Transport-Security` | differs | Next sends 1 year with preload; Vite sends 2 years. Pick one. |
| `Cache-Control` on `/` | differs | Next sends `private, no-store` (the page is rendered on every request), so there is no CDN caching of the home page. That is a cost and speed risk at launch. |
| `X-Robots-Tag: noindex` | draft only | Netlify adds this to draft deploys. Recheck on the published deploy. |

## SEO and analytics

- Public pages: the titles, h1s and text match.
- The meta description differs on `/shop`, and is missing on the signed-in pages.
- GTM was absent on both sides in this run (consent-gated), so analytics parity is unverified. It needs a run that accepts consent and checks the dataLayer and GA4 hits.

## Rerun on published staging (gap 7)

On 7 Nov the Next build of main was published to staging (gre3833, its own database, with the 22 Oct catalogue fixture), and the audit was run again (`docs/next-cutover/result-staging.json`). The public page results did not change, and the draft-only 502 has gone.

| Check | Result |
|---|---|
| `/api/auth/get-session`, `/api/popularity`, `/api/compose-problems`, `/api/catalogue` | 200 on Next staging. Settled. |
| Better Auth sign-up (`STAGING_TEST_EMAIL` in `.env.example`) | 200. The account was created unverified with **no session** (token null), as `requireEmailVerification` intends. |
| Sign-in for that unverified account | 403 `EMAIL_NOT_VERIFIED`. A wrong password gives 401. The auth database and function chain works end to end. |
| Signed-in content (account, org, portal, invoice, catalogue admin) | **Still unproven.** Staging sends no email (it has no mail key), so the test account cannot be verified. This needs a staging-only way to mark one test account verified (a seed like `scripts/seed-staging-portal.mjs`, scoped to gre3833). |
| `/api/interview/portal`, `/api/interview/my-data` | **Keep.** The site's own interview portal uses them (`src/portal/interview/api.mjs`, `InterviewDataCard.jsx`). Vite answers 404 only because `INTERVIEW_ENABLED` is unset on production; staging sets it. This is a matter of environment, not a routing gap. |
| `/ironsoftware` | **Not a gap** (correction). `/shop/ironsoftware` is a real Next storefront (200). |
| `/shop/<vendor>` "half the text" | **Data, not code** (correction). Vite's `#shop/aspose` lists all 86 products, because it ignores the vendor. Next lists the vendor's own products from the 24-product fixture. It needs the live catalogue on staging (GRE-4439). The title "Products" vs "Software Catalogue" is cosmetic. |

## Gap list (to fix before step 3)

1. Pages missing on Next: `/proof` and `/ai-market-intelligence` (plus the `#intel` alias). The Next site renders the pages published from GSAM, so these two pages need publishing in the Website module (content, not code). The legacy rules already send `/proof` to `/case-studies` once that page exists.
2. `/shop`: the meta description and title are cosmetic. Storefront size is a data matter (see above).
3. 301s for `/about-us` and `/contact-us` (PR #243). `/ironsoftware` is fine.
4. `Referrer-Policy` and `Permissions-Policy` headers, and one HSTS value (PR #243).
5. Titles on the signed-in pages and `/privacy/interviews` (PR #244). They stay noindex, so they need no canonical.
6. Public page caching: CDN cache with revalidation instead of `no-store` (PR #243).
7. Auth and APIs are proven on staging (see the rerun above). Still open: signed-in content, which needs a staging-only verified test account. Also the live catalogue on staging (GRE-4439).
8. A service detail page with a real slug.
9. Analytics: GTM after consent.

## Estimate (honest)

- **Items 1 to 6** are straightforward front-end work: about 1 to 2 days of agent work across 3 or 4 PRs. Item 2 depends on how much of the Vite storefront the Next page reuses.
- **Item 7 is the real risk.** Better Auth plus the client portal and interview flows have to be proven end to end on staging. If they pass, that is half a day. If auth or the portal need porting work, it is 2 to 4 days.
- **Items 8 and 9:** half a day.
- **Overall:** about 3 to 6 working days before staging can hold the Next site with confidence, and then the step 4 production switch through John's Deploy card.

## Gap 7 settled, and gaps 8 and 9 (7 Nov, later)

**Signed in on staging** as the verified audit account. It was verified through the guarded owner-import window, using the `verify-test-account` mode from #246 (dry run, then apply, 1 row). The catalogue on staging is the live public catalogue (GRE-4439, `tables` mode: 41 categories, 10 vendors, 237 offerings, 819 variants and 2,831 specs; staging `/api/catalogue` total 159).

| Signed-in page | Result on Next staging |
|---|---|
| `/account` | Renders, with the account email: "No customer account here". This is correct for an account with no customer company. |
| `/portal` | "This is not a client account", which is correct. |
| `/catalogue` | "Not authorised … isn't a catalogue editor", which is correct. |
| `/invoice/<id>` | "Invoice not found", with a 400 from the store for a made-up id. This is correct. |
| `/order-confirmed`, `/join/<token>` | Correct empty states. |
| `/org` | Stays on "Loading your organisation…" for an account with no customer company. **This is the same on the live site**: both builds render the same `src/store/OrgDashboard.jsx`, which has no "no organisation" state. So it is an existing bug, not a cutover gap. |

Every signed-in page renders the same component as the Vite site, so a client account sees the same thing.

- **Gap 8, service detail:** matches. `/#service/business-website-build` vs `/service/business-website-build` have the same title and h1, and text of 2411 vs 2424 chars.
- **Gap 9, analytics:** matches. Neither site loads GTM, and neither shows a consent button (no GTM id is set on the live site). When GTM is switched on, Next reads `NEXT_PUBLIC_GTM_ID` or `VITE_GTM_ID`.
- **`INTERVIEW_ENABLED` (note only):** the live site does not set it, so `/api/interview/*` answer 404 there. Staging sets it. After the switch the interview routes stay off on production until someone sets it there; that is a separate decision for John.

## Catalogue in the Next build (#247)

A CLI build cannot read the catalogue from the database, so the Next build reads the same public projection from `https://greatstoneint.com/api/catalogue` (`NEXT_CATALOGUE_API`), and `NEXT_CATALOGUE_REQUIRED` still applies. A draft build on staging had all 86 products.

## Page edits reach the website (content wiring plan, 7 Nov)

John's rule: greatstoneint.com moves to the Next build only when everything works, including page edits made in the GSAM Website module. The flow:

1. **Publish** in the Website module, on the public site's record (`b546812d…`), writes its content release to **staging's** store (gre3833, store `gsam-content`: `current`, `releases/<n>.json`, `media/*`). GSAM starts no build there (Git builds are off). The same release checks run as before, against `https://gre3833-next-db-staging.netlify.app`: every check path and `/_release` must report the new release number (GSAM PR #1107).
2. **Staging rebuilds automatically.** GSAM's staging watch (every 2 minutes) sees the switched release waiting and opens its one task for the website team: `GSAM_CONTENT_RELEASE=<n> npm run deploy:staging`. That flag forces the upload even when the code has not changed, and refuses if staging's store holds a different release. The Next build bakes the release from staging's store; the Publish job, still waiting, then checks staging and marks the release Live (on staging).
3. **Staging reads published content**, like production: `GSAM_SITE_ID=b546812d-8d25-49dc-94c2-e04a5b31bde4` on gre3833 (and `GSAM_RELEASE_BLOBS_STORE` left at its default, `gsam-content`). The release has `orgId: null`, so `GSAM_ORG_ID` is not needed. This is set only after the first release is in staging's store, because a build with `GSAM_SITE_ID` set fails when `current` is missing.
4. **John reviews staging**, then presses **Deploy these changes**. The editor's list shows both the commits and "Page edits: content release N (live has M)". The card names the commit and the line `Content release <n> (sha256 <12>)`; `deploy:prod` refuses a card (or approval comment) that does not name the content release staging holds. In the lock, before the upload builds, `deploy:prod` copies the release file and missing media from staging's store to greatstone-home's store, checks the sha256, and points greatstone-home's `current` at that release. If the upload or the live checks fail, the deploy is restored and the content pointer is put back.
5. **Seed release 1** from today's pages so nothing changes visually: `node next-proof/scripts/plan-gsam-release-1.mjs b546812d…` (read only) shows any page where GSAM differs from what the site shows today; `--apply` saves the live content as drafts; then a person approves and presses Publish.
6. **Rehearsal** (`npm run deploy:rehearse`, clean and with `REHEARSE_FAIL_API=/api/catalogue`) runs only inside Lintel's or Mica's runs on the PC, under the shared Blobs lock. Nothing deploys from the Mac.

`node scripts/deploy-site.mjs content` prints the content release each store points at.
