# GRE-1833: Next.js proof

This proof renders the published home and DX Dev Tools Puck data through Next.js App Router. `npm run build:next` exports those two pages from `src/store.js`, then builds the Next app. The Vite site and its production build remain in place while John decides on the full move.

## Check it locally

```bash
npm ci
npm run dev:next
```

Open `/`, `/dev-tools`, `/editor/home` and `/editor/dev-tools` on port 5181. The editor uses Puck 0.23 from `@puckeditor/core`; its iframe is enabled with 390px and 1440px viewports. **Export draft** downloads edited Puck JSON. This proof has no save or publish endpoint.

The page data comes from `seedState().pages[slug].published`. The same generated JSON feeds the public route and editor. Next returns the headings, title and description in the initial HTML. The two public routes are prerendered by Next at build time; the editor route runs through the Netlify Next.js runtime.

Only `TwoDoors.jsx` needed a block change: optional access to Vite's `import.meta.env` lets Next render it without that Vite global. The other four block modules are unchanged. This proof registers only the five blocks used by its two pages. The current Vite editor remains on Puck 0.20 until the full migration is approved.

## Draft deploy

`next-proof/netlify.toml` builds this proof with the Next.js runtime. The existing root Netlify configuration and SPA redirects remain for the current site. `prepare-netlify.mjs` copies the proof into a scratch folder without the SPA redirect and header files. Install its dependencies there with `npm ci`, then use `netlify deploy --context deploy-preview --site <existing-site-id>`. Leave off `--prod`.

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

The v15 mock-up contains draft facts and logos that the published seed intentionally omits. The side-by-side screenshots show that content difference; the Next proof uses the published projection rather than exposing unconfirmed material.
