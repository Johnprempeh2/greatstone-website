# GRE-1971 visitor function map

The staging Next build keeps the same-origin Netlify function layout established in GRE-1967. This map covers the visitor paths relevant to this issue. The full page and analytics map is in `docs/GRE-1970-route-function-map.md`; legacy redirects are in `next-proof/legacy-routes.mjs`.

| Vite route or function | Next equivalent or disposition |
| --- | --- |
| `#go/contact` and the `BookDeepDive` form | `/contact` through `app/[...slug]/page.jsx`. The same block posts to `/api/enquiry`; the current Vite editor remains active until GSAM cutover. |
| `/api/enquiry` (`netlify/functions/enquiry.mjs`) | Same path and handler in the isolated Next Netlify deploy. It saves under `anon` RLS, alerts the owner, and returns a clear error when neither path keeps the lead. The form offers the contact address on failure. |
| `/api/catalogue` (`netlify/functions/catalogue.mjs`) | Same path and handler in the isolated Next Netlify deploy. GRE-1967 owns catalogue store data and RLS; this issue only preserves the function in the proof package. |
| `#shop`, `#shop/<vendor>`, `#product/<slug>` | `/shop`, `/shop/[vendor]`, `/product/[slug]` from GRE-1949. Their release data is GRE-1967 scope. |
| `#enquire/<interest>` | The existing block helper retains this interest choice in the enquiry payload when the contact form is opened. No separate server route. |
| Supabase `front-door` and store checkout edge functions | Remain on their existing service during this stage. They are not Netlify functions; their migration belongs to separate work. |

The Next proof copy includes `netlify/functions` and its shared server imports. The root Vite build and editor stay in place. No public deployment or domain change is part of this issue.
