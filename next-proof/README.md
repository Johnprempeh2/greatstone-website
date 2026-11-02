# GRE-1833: Next.js proof

This proof renders the published marketing and legal Puck pages through Next.js App Router. `npm run build:next` exports every published page with content from `src/store.js` into a baked GRE-1916 schema 1 release file, then builds the Next app. The Vite site and its production build remain in place during the move. The draft refunds page and the empty AI Market Intelligence page stay out of the release.

## Check it locally

```bash
npm ci
npm run dev:next
```

Open `/`, `/dev-tools`, `/services`, `/privacy`, `/editor/home` and `/editor/dev-tools` on port 5181. The editor uses Puck 0.23 from `@puckeditor/core`; its iframe is enabled with 390px and 1440px viewports. **Export draft** downloads edited Puck JSON. This proof has no save or publish endpoint.

The page data comes from `seedState().pages[slug].published`. `data/release.json` wraps those pages in the approved release schema, with site navigation, one theme token file, and the organisation id. The same release feeds the public route and editor. Next returns headings, title, description, canonical and social metadata in the initial HTML. Public routes run on the Next server. The editor remains a proof and reads the baked release.

GRE-2134 reads the site-wide Netlify Blobs store `gsam-content` (override with `GSAM_RELEASE_BLOBS_STORE`). Set `GSAM_SITE_ID` at build and runtime, with `GSAM_ORG_ID` only when the release has an organisation id. A configured Next build reads `current` with strong consistency, checks its schema, release number, key, SHA-256, switch time and fence, then verifies and bakes `releases/<n>.json`. A missing or invalid release fails the build, leaving the previous Netlify deploy in place. With no site id, local builds export the proof seed. Runtime reads `current` strongly on each request; a bad read keeps the last valid release in a warm process, or the baked snapshot in a cold process. Public pages emit `gsam-release` metadata and `/_release` returns the same accepted release number without response caching. Media asset ids resolve through the release map to `media/<sha256>.<ext>`. GSAM starts one content-only Netlify build through the site builds API; the engine has no build hook and does not deploy or switch `current`.

The Insights page lists released article pages at `/insights/<slug>`. Each card uses
the released page title and SEO description, and links to that page's published
Puck content. To publish an Intelligence Hub briefing, prepare and approve its
site article page through GSAM, then include it in a site content release. The
browser reads only the site's accepted release; it makes no request to GSAM.

GRE-1947 adds the remaining published marketing and legal pages and their existing block types. The server uses the existing rich text sanitiser with the already installed DOM parser, so rich text appears in the initial HTML. Desktop and phone comparisons with Vite are in `docs/screenshots/GRE-1947`. Catalogue and legacy link routes are GRE-1949.

GRE-1949 adds server-rendered `/shop`, `/shop/<vendor>` and `/product/<slug>` routes. The export reads the public catalogue through the Netlify Database access layer when `NETLIFY_DB_URL` or local `DATABASE_URL` is configured. Each read uses the same transaction-local `anon` role and RLS policies as `/api/catalogue`. It snapshots published vendors, categories and offerings into release collections, including product detail, variants and public pricing calculated by the existing data layer. The Next preview build requires this connection and fails when it is missing. Local proof builds without those settings keep empty catalogue collections and show an explicit availability message. The product route reuses the existing detail and basket UI, while Vite retains its current routes and editor. Legacy path redirects and the full URL audit are tracked in GRE-1955.

GRE-1955 maps the 108 paths in `scripts/legacy-urls.txt` to Next routes through `next.config.mjs`. Published page paths stay live, old catalogue paths reach the corresponding shop or vendor route, and obsolete account paths reach contact. Old marketing aliases and legal paths use their published equivalents where present. Run `npm run check:legacy:next` against a running Next server (`PROOF_BASE` overrides port 5181); it checks the redirect response and final page for every path. Local catalogue checks need `NEXT_CATALOGUE_FIXTURE=next-proof/fixtures/public-catalogue-2026-10-22.json` when starting the server. The root `_redirects` file and Vite editor remain unchanged until the engine switch.

For local visual comparison, set `NEXT_CATALOGUE_FIXTURE=next-proof/fixtures/public-catalogue-2026-10-22.json` before `npm run dev:next`. This fixture is a 24-item sample of the public catalogue captured on 22 October 2026. Price fields were removed. The production-required export rejects the fixture, so it cannot stand in for a release data connection.

The Next renderer registers the blocks used by these published pages. The current Vite editor remains on Puck 0.20 until the full migration is approved. `TwoDoors.jsx` reads the Vite draft flag optionally so Next can render it. After review, the desktop divider became a grid column that follows the widening door; the Tide canvas spans the viewport as in v15. The six published DX Dev Tools supplier marks in the v15 mock-up are local image assets in the seed and appear when the tools door opens. The current Vite page shares those block and seed changes.

## Draft deploy

`next-proof/netlify.toml` builds this proof with the Next.js runtime. The existing root Netlify configuration and SPA redirects remain for the current site. `prepare-netlify.mjs` copies the proof into a scratch folder without the SPA redirect and header files. Install its dependencies there with `npm ci`, then use `netlify deploy --context deploy-preview --site <existing-site-id>`. Leave off `--prod`.

For the isolated GSAM editor alias, run `node next-proof/scripts/prepare-netlify.mjs <new-scratch-directory> --editor`, then `npm ci` and `netlify build --context branch:gsam-editor` inside that directory. The editor copy includes the reviewed root `middleware.js`, uses `next-proof/netlify.editor.toml`, and builds the checked-in release snapshot without exporting a catalogue. It omits Netlify Database dependencies and visitor functions, which this editor-only alias must not serve. From the prepared directory, upload with `node scripts/deploy-editor-alias.mjs <existing-site-UUID>`. This command uses `netlify deploy --alias gsam-editor --no-build --dir .netlify/static`, then fetches `/editor/home` and fails unless the deployed page reports GSAM's site ID and editor contract 2. The explicit directory is required: the Next adapter writes public assets under `.netlify/static/_next/static`, while the configured `.next` publish directory has only `.next/static` and produces 404s for every `/_next/static/*` URL when used with `--no-build`. Use the UUID, not the site name, so the Next runtime's deploy blobs are uploaded to the right site. The editor-only config supplies `GSAM_EDITOR_HOST`, `GSAM_EDITOR_ORIGINS` and `GSAM_EDITOR_SITE_ID` at build time; the same values must also exist in Netlify's `branch:gsam-editor` **Functions** scope for the edge middleware and editor runtime. Set those once with `netlify env:set <key> <value> --site <existing-site-UUID> --context branch:gsam-editor --scope functions`. `GSAM_EDITOR_SITE_ID` is the GSAM website site ID; it overrides only the editor frame identity, while the editor still renders checked-in proof content. The editor runtime uses the checked-in proof release even if the Netlify site supplies production `GSAM_SITE_ID` and `GSAM_ORG_ID` to all contexts. The root Netlify configuration and public site are unaffected. The weekly train runs these steps itself after the `greatstone-home` production upload (`docs/WEEKLY-RELEASE.md`, GRE-2804). For a manual run, set `GSAM_ENGINE_COMMIT=<commit>` for both the build and the upload: the build bakes it in as the editor's `engine.commit`, and the upload check fails unless `/editor/home` reports it.

The isolated copy includes the existing `netlify/functions` entries and their shared server code. Netlify serves `/api/enquiry` and `/api/catalogue` beside Next, using the same handlers, database access and visitor responses as Vite. Resend, Turnstile and database credentials remain Netlify server environment variables; they are not Next public variables. Run `node scripts/check-dist-secrets.mjs .next/static` after a Next build to scan client assets. Do not switch the public site during this phase.

The checked draft is [GRE-1833 Next.js proof](https://gre-1833-next-proof--greatstone-home.netlify.app/). It is separate from the production URL. The editor is a review surface only. It has no Supabase connection, authentication or content writes. Existing links to the shop and other pages still need real routes in the full move.

## What the full move still needs

These are engineering estimates, assuming the existing content and design stay in scope and the second Netlify function is identified. Review and deployment decisions add calendar time.

| Work | Estimate |
| --- | ---: |
| All page routes and shared navigation, from the current content store | 2 to 3 days |
| Studio shell and durable draft, publish and history flow | 3 to 5 days |
| Server enforced sign-in and editor permissions | 2 to 3 days |
| Port and verify the two Netlify functions | 1 to 2 days |
| Legacy redirects and URL audit | 1 day |
| Sitemap, robots, social metadata and canonical URLs | 1 day |
| Phone and laptop regression checks across the site | 2 to 3 days |
| **Total** | **12 to 18 days** |

The repository currently contains `netlify/functions/enquiry.mjs` as its one named function. GRE-1835 calls the second function “the other one”; Everest needs to identify it before that part of the full move is estimated firmly.

The v15 mock-up contains draft facts and consultancy client marks that the published seed intentionally omits. The side-by-side screenshots show that content difference; the Next proof uses the published projection rather than exposing unconfirmed material. Consultancy client marks still require recorded written permission before they can appear on a public page.
