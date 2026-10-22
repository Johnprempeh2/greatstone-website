# GRE-1947 route comparisons

These are full-page captures of the published Vite page (`/#<slug>`) and the Next production build (`/<slug>`). Each slug has four JPEGs: `vite-1440`, `next-1440`, `vite-390`, and `next-390`. The captures use reduced motion and the same 900px laptop or 844px phone viewport height.

Routes: `dx-consultancy`, `how-we-help`, `services`, `method`, `proof`, `about`, `insights`, `climb`, `industries`, `contact`, `privacy`, `cookies`, `terms`.

All 26 Next captures returned 200 with nonempty page text. Playwright reported no page errors or horizontal overflow. The Vite and Next captures use the same published Puck content. Their shared header and footer differ because the Next shell is still the migration proof; GRE-1949 handles legacy link routes.
