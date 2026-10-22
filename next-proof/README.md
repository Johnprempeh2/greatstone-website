# GRE-1833: Next.js proof

This proof renders the published marketing and legal Puck pages through Next.js App Router. `npm run build:next` exports every published page with content from `src/store.js` into a baked GRE-1916 schema 1 release file, then builds the Next app. The Vite site and its production build remain in place during the move. The draft refunds page and the empty AI Market Intelligence page stay out of the release.

## Check it locally

```bash
npm ci
npm run dev:next
```

Open `/`, `/dev-tools`, `/services`, `/privacy`, `/editor/home` and `/editor/dev-tools` on port 5181. The editor uses Puck 0.23 from `@puckeditor/core`; its iframe is enabled with 390px and 1440px viewports. **Export draft** downloads edited Puck JSON. This proof has no save or publish endpoint.

The page data comes from `seedState().pages[slug].published`. `data/release.json` wraps those pages in the approved release schema, with site navigation, one theme token file, and the organisation id. The same release feeds the public route and editor. Next returns headings, title, description, canonical and social metadata in the initial HTML. The public routes are prerendered by Next at build time; the editor route runs through the Netlify Next.js runtime. The baked release has fixture metadata and is not a published GSAM release. Blobs reads and full release validation are separate work under GRE-1933.

GRE-1947 adds the remaining published marketing and legal pages and their existing block types. The server uses the existing rich text sanitiser with the already installed DOM parser, so rich text appears in the initial HTML. Desktop and phone comparisons with Vite are in `docs/screenshots/GRE-1947`. Catalogue and legacy link routes are GRE-1949.

GRE-1949 adds server-rendered `/shop`, `/shop/<vendor>` and `/product/<slug>` routes. The export reads the public, RLS-gated Supabase catalogue only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured. It snapshots published vendors, categories and offerings into release collections, including product detail, variants and public pricing calculated by the existing data layer. The Next preview build requires this connection and fails when it is missing. Local proof builds without those settings keep empty catalogue collections and show an explicit availability message. The product route reuses the existing detail and basket UI, while Vite retains its current routes and editor. Legacy path redirects and the full URL audit are tracked in GRE-1955.

The Next renderer registers the blocks used by these published pages. The current Vite editor remains on Puck 0.20 until the full migration is approved. `TwoDoors.jsx` reads the Vite draft flag optionally so Next can render it. After review, the desktop divider became a grid column that follows the widening door; the Tide canvas spans the viewport as in v15. The six published DX Dev Tools supplier marks in the v15 mock-up are local image assets in the seed and appear when the tools door opens. The current Vite page shares those block and seed changes.

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

The v15 mock-up contains draft facts and consultancy client marks that the published seed intentionally omits. The side-by-side screenshots show that content difference; the Next proof uses the published projection rather than exposing unconfirmed material. Consultancy client marks still require recorded written permission before they can appear on a public page.
