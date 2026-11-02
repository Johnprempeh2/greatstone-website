# GRE-1973 route, redirect and form regression gate

This is the final Phase 1 gate for GRE-1935. It lists every Vite route and server function with its Next equivalent or the reason it is dropped. Earlier maps are in `docs/GRE-1970-route-function-map.md` (consent, analytics, SEO) and `docs/GRE-1971-visitor-functions-map.md` (visitor functions). The Vite site and its editor stay live until GSAM cutover. Nothing here deploys or changes a domain.

## How the gate is checked

| Check | Command | Covers |
| --- | --- | --- |
| 108 legacy paths, unit | `node --test next-proof/legacy-routes.test.mjs` | Each path in `scripts/legacy-urls.txt` has a permanent redirect to a known Next route, or is itself a published route. |
| 108 legacy paths, live | `NEXT_CATALOGUE_FIXTURE=next-proof/fixtures/public-catalogue-2026-10-22.json npm run build:next`, `next start`, then `PROOF_BASE=… npm run check:legacy:next` | Real 301/308 status, `Location` and a 200 landing for all 108. |
| Old hash links | `node --test next-proof/legacy-hashes.test.mjs` | Every Vite hash route below, and auth email landings keeping `?token=` and `?verified=1`. |
| Server functions | `node --test next-proof/visitor-functions.test.mjs` | Every file in `netlify/functions` is in the Next deploy package and bundles as ESM with its imports. |
| Keys server-side | `node scripts/check-dist-secrets.mjs .next/static` | No server secret in the Next browser bundle. |

## Vite hash routes

| Vite route | Next equivalent or drop reason |
| --- | --- |
| `#<page>`, `#go/<page>`, `#go/<page>/<anchor>` | `/<page>` and `/<page>#<anchor>` via `/[...slug]`. |
| `#proof`, `#go/proof` | `/case-studies` (renamed page). Fixed in this gate. |
| `#ai-market-intelligence` | `/insights`. |
| `#book`, `#enquire/<interest>` | `/contact`. The block helper keeps the interest choice for the form. |
| `#service/<slug>` | `/services`. No separate service detail route in the published release. |
| `#breakdown` | `/method`. |
| `#intel`, `#intel/<id>` | `/insights`. Fixed in this gate; IntelBand's default CTA is `#intel`. Briefing articles publish as `/insights/<slug>` pages. |
| `#shop`, `#shop/<vendor>` | `/shop`, `/shop/<vendor>`. The vendor form was fixed in this gate. |
| `#product/<slug>` | `/product/<slug>`. Fixed in this gate. |
| `#account` (and auth email landings `/?token=…#account`, `/?verified=1#account`) | `/account`, keeping the query. Fixed in this gate: before it, a password reset link lost its token on Next. |
| `#org`, `#org/e/<id>` | `/org`, `/org#org/e/<id>` (GRE-1972). |
| `#portal`, `#portal/doc/<id>`, `#portal/receipt/<id>`, `#portal/deep-dive` | `/portal/...` (GRE-1972). |
| `#invoice/<id>` | `/invoice/<id>` (GRE-1972). |
| `#catalogue[/<tab>]` | `/catalogue/<tab>` (GRE-1972). |
| `#order-confirmed?session=cs_test_…` | `/order-confirmed?session=…` (GRE-1972). Live `cs_live_` sessions are GRE-3706. |
| `#admin[/<section>[/<slug>]]` | Dropped from Next. Editing stays on Vite until GSAM cutover, then moves to the GSAM editor (`/editor/[slug]`, `/preview/[slug]` are proof-only and not indexed). |
| `#join/<token>` | Dropped from Next. It accepts an invite to the Vite editor's local team list, which GSAM replaces at cutover. |
| `#contact`, `#choose` and other in-page anchors | Stay on the page as real anchors. |

## Legacy paths (108)

`scripts/legacy-urls.txt` holds the 108 old WordPress paths. `next.config.mjs` builds 65 Next redirects from them (`next-proof/legacy-routes.mjs`): vendor and product paths go to `/shop/<vendor>`, `/login` and other account paths to `/account`, `/blog` and `/news/*` to `/insights`, old policy and services slugs to `/privacy`, `/cookies`, `/terms` and `/services`. Published paths such as `/about` and `/contact` answer 200 directly. Result on this branch: 108 checked, 0 failures.

## Visitor forms

| Form (block, page) | Endpoint | Next status |
| --- | --- | --- |
| BookDeepDive, `/contact` | `POST /api/enquiry` | Same function and path on the Next deploy. On failure the form offers the contact address. |
| AiBaselineSurvey, AiCostCalculator, `/dx-consultancy` | `POST /api/enquiry` (lead tools) | Same as above. |
| FrontDoor | `POST /api/front-door` | Same function and path. Not on a published page in the current release. |
| ComposeExplorer | `/api/compose-problems` | Same function and path. Not on a published page in the current release. |
| Store cart quote lines | `POST /api/service-inquiry` | Same function and path. `/api/request-quote` has no browser caller in this repo; it ships unchanged. |
| Sign in, sign up, reset | `/api/auth/*` (Better Auth) | Same function and path; landing fixed above. |

## Server functions

Every function in `netlify/functions` ships unchanged on the Next deploy, with the same `config.path`: `admin-bridge`, `auth`, `catalogue`, `compose-problems`, `customer-store`, `deep-dive-client`, `deep-dive-document`, `deepdive-file`, `deepdive-plan`, `deepdive-state`, `enquiry`, `front-door`, `notify-licence-issued`, `owner-import` (scheduled), `popularity`, `portal-file`, `portal-mcp`, `portal-pdf-cleanup` (scheduled), `portal-store`, `request-quote`, `service-inquiry`, `staff-store`, `stripe-checkout`, `stripe-portal`, `stripe-webhook`.

Fixed in this gate: `owner-import` imports `netlify/database/migrations/052_better_auth/import-users.mjs`. The Next package did not copy `netlify/database`, so that function could not bundle. The package now carries `netlify/database`, as the Vite deploy does.

Supabase edge functions stay on their existing service and are not part of the Next deploy: `portal-receipt-worker` (the portal nudges it; it also runs on a schedule) and `send-welcome-email`. The others (`enquiry`, `front-door`, `notify-licence-issued`, `portal-file`, `portal-mcp`, `request-quote`, `stripe-checkout`, `stripe-portal`, `stripe-webhook`) have Netlify functions with the same job, listed above.

## Keys and services

The Next browser bundle exposes only `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, all public by design. `check-dist-secrets` on `.next/static` is clean. The only server key name in a client chunk is Better Auth's environment getter (`BETTER_AUTH_SECRET` as a name, with no value).

Server keys the Next deploy needs, the same as the Vite site's: `DATABASE_URL` / Netlify Database, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `ENQUIRY_ALERT_TO`, `FRONT_DOOR_ALERT_TO`, `FRONT_DOOR_SECRET`, `ANTHROPIC_API_KEY`, `PIPEDRIVE_API_TOKEN`, `TURNSTILE_SECRET_KEY`, `GSAM_BRIDGE_KEYS`, `GSAM_DEEP_DIVE_SITE_KEY`, `GSAM_DEEP_DIVE_BASE_URL`, and the `PORTAL_ONEDRIVE_*` set. `npm run secrets:check` lists which are required. No new key is needed for this gate.

## Open before Next replaces Vite

- GRE-3703: font, Back overlap, spacing, Sign in link.
- GRE-3706: live Stripe on `/order-confirmed`.
- Privacy and cookie wording from GRE-1980 revision 2 is published at cutover, not before.
- Next `/account` does not show the "Email confirmed" note after `?verified=1`; the Vite app passed it as a prop. Sign-in still works.
