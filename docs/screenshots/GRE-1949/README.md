# Catalogue comparison, 22 October 2026

The old Vite site and the local Next release were compared at 1440px and 390px using the same 24 public catalogue entries. The entries were captured from the live site's first catalogue page. The fixture removes price fields, so these images do not verify live pricing or the full 159-item catalogue. No test connection to Supabase was available.

| Route | Desktop | Phone |
| --- | --- | --- |
| Shop | [Vite](shop-vite-1440.png) / [Next](shop-next-1440.png) | [Vite](shop-vite-390.png) / [Next](shop-next-390.png) |
| Vendor | [Vite](vendor-vite-1440.png) / [Next](vendor-next-1440.png) | [Vite](vendor-vite-390.png) / [Next](vendor-next-390.png) |
| Product | [Vite](product-vite-1440.png) / [Next](product-next-1440.png) | [Vite](product-vite-390.png) / [Next](product-next-390.png) |

The old Vite screenshots use the live Vite build with its public catalogue requests replaced by fixture responses. For the vendor view, the vendor facet was selected after opening the hash route to match the filtered Next view. The Next screenshots use `npm run dev:next` with `NEXT_CATALOGUE_FIXTURE` set to the fixture file. [comparison.json](comparison.json) records heading, card count, title and document width for each pair.

The product heading and catalogue card counts matched. The old product view was 413px wide at a 390px viewport; the Next view was 390px. The Next release shell still has its shorter header and footer, inherited from the earlier renderer PR.
