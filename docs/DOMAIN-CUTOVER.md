# Domain cutover runbook

How we move the studio from `greatstone-home.netlify.app` to the real Greatstone public domain.
The permanent domain is **greatstoneint.com** (decided 2 Jul 2026; see `docs/DOMAIN-EMAIL-TRANSITION.md`).
The old greatstonesoftware.co.uk is to redirect to it (`public/_redirects` already maps the old shop's paths).
The whole point: this is a **config change, not a migration.** The app builds every URL it needs from
`location.origin`, so it already works on any domain served at root. Nothing below requires a rewrite.

## What's already true (so this stays config-only)

- Vite `base` is `/` — the studio is the site root, not a subpath.
- Auth redirects, Stripe return URLs, invite links, and 3D asset paths are all built from
  `location.origin + location.pathname`, so they retarget automatically.
- The one canonical-domain assumption (SEO canonical / og:url / schema.org / the editor's SEO preview)
  reads from `VITE_SITE_ORIGIN` via `src/lib/site-origin.mjs`, defaulting to the live host. One env var
  pins it to the real domain.
- The logo is bundled locally (`public/assets/greatstone-logo-web.png`), no cross-origin dependency.
- Legacy `/puck-proof/*` URLs 301 to root (`public/_redirects`).

## The cutover, when the domain is ready

1. **Decide the shape.** Either the studio is the public site on the apex (`greatstoneint.com`),
   or it lives on a subdomain (`app.greatstoneint.com`) with a separate marketing site on the
   apex. Subdomain is the cleaner default if a separate marketing site is planned: separate deploys,
   no path collisions.
2. **Netlify: attach the domain.** Site `greatstone-home` (id `3b1e97e6-e184-4251-badd-deed532be3ab`)
   → Domain management → add the custom domain → point DNS as instructed → Netlify provisions SSL.
   No rebuild. The old `*.netlify.app` URL keeps working as an alias and 301s to the primary domain.
3. **Pin the canonical origin.** Set `VITE_SITE_ORIGIN=https://<the real origin>` in the build env
   (local `.env`, and the Netlify env if ever building there), then redeploy. Canonical/og/schema now
   point at the real domain regardless of which host served the page.
4. **Supabase auth.** Authentication → URL Configuration: set **Site URL** to the new origin and add it
   to **Redirect URLs** (keep the `netlify.app` entry during the transition). This is the only piece
   that lives outside the code.
5. **Stripe.** Nothing to change (success/cancel/return URLs are origin-based). Confirm with one test
   checkout on the new domain.
6. **SEO indexing.** `index.html` currently carries `<meta name="robots" content="noindex">` for the
   interim host. Remove it when the public site should be indexed. Then, after the production build,
   run `npm run seo:report -- dist` and expect `Summary: INDEXABLE`. Any `NOINDEX` line names its
   source (meta tag, `X-Robots-Tag` in `_headers`, or a robots.txt `Disallow`); fix that and rebuild.
   The report only reads the build; it always exits 0, so read the summary line.
7. **Saved content (low priority).** Old Puck content may still reference the old absolute logo URL
   (`greatstone-home.netlify.app/assets/...`). It still resolves, but to fully cut the old host either
   re-save those pages (the code default is already the local `/assets/...` path) or scrub the content.
8. **Verify on the new domain:** root 200; sign-in works (no "Store backend not configured"); a deep
   link like `…/#account` routes; `curl` a legacy `/puck-proof/` URL still 301s; view-source shows the
   canonical tag = the new domain.

## Rule going forward

Keep it config-only. Never hardcode a site host in code — build URLs from `location.origin`, or read
`VITE_SITE_ORIGIN` for the canonical domain. Contact emails and external links are exempt (they are not
the site host). See memory `greatstone-domain-portability`.
