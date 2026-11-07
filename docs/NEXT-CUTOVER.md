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
