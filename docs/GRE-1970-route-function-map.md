# GRE-1970 Vite to Next map

Scope: consent, analytics and SEO for the staging Next build. The Vite site and its editor remain active until GSAM cutover. The full 108-path redirect audit is in `next-proof/legacy-routes.mjs` and GRE-1955; this map covers the routes and functions relevant to this issue.

| Vite route or function | Next equivalent or disposition |
| --- | --- |
| `/` and `#<published-page>` / `#go/<published-page>` | `/` and `/[...slug]` render the active release. `app/page-metadata.mjs` supplies server-rendered title, description, canonical and social tags. |
| `#go/cookies`, `#go/privacy`, `#go/terms` | `/cookies`, `/privacy`, `/terms` through `/[...slug]`. The consent link now uses `/cookies`. |
| `#shop`, `#shop/<vendor>` | `/shop`, `/shop/[vendor]`, implemented in GRE-1949. Each has canonical metadata. |
| `#product/<slug>` | `/product/[slug]`, implemented in GRE-1949, with product metadata and structured data. |
| `#service/<slug>` | No separate Next route yet. Published service pages render through `/[...slug]`; legacy path handling is recorded in GRE-1955. Do not add a sitemap URL for this hash view. |
| `#intel/<id>`, `#intel`, `#breakdown` | No dedicated Next route in the current published release. These Vite views remain available during the transition and are absent from the root-only sitemap. |
| `#admin`, `#catalogue`, `#account`, `#org`, `#invoice/<id>`, `#join/<token>` and portal hashes | Editing remains on Vite until GSAM cutover. The Next `/editor/[slug]` and `/preview/[slug]` surfaces are proof-only; both are excluded from indexing. Legacy path redirects are GRE-1955. |
| `src/ConsentBanner.jsx` and footer Cookie settings | `app/ConsentAnalytics.jsx` and the SiteFrame footer. They reuse the approved banner wording, keyboard focus on reopen, and the `gs-consent` storage key. |
| `src/lib/analytics.js` `initAnalytics`, `setConsent`, `pageview`, `track` | `app/consent-analytics.mjs` loads GTM only after consent and sends Next path views. Shared Puck blocks still call `src/lib/analytics.js`; its `track` guard suppresses their events on Next before consent, while Vite retains its current advanced-mode behaviour. |
| `src/lib/analytics.js` `getAttribution`, `optionalStorageAllowed` | Shared block helpers remain in use. Next captures the visit in memory and persists optional attribution only after Accept. Decline clears the same optional storage keys. |
| Vite `applyHead` / `injectStructuredData` | Next `generateMetadata` in published, shop and product routes, product structured data, and `app/site-structured-data.mjs` in the root layout. The published page fallback social image is preserved. |
| Vite `public/sitemap.xml`, `public/robots.txt` and `src/lib/seo-files.mjs` | The same static files are served by Next from `public/`. Their one root sitemap URL and robots rules are checked by `app/seo-parity.test.mjs`. No new URLs are added to the sitemap in this phase. |

The current cookie policy describes cookieless Google signals on Decline from Vite's advanced consent mode. The Next gate sends no analytics request before Accept. Harbor owns policy wording, so the published copy must be reconciled before switching the public site to Next.
