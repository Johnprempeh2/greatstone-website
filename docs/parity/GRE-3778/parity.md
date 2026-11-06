# GRE-3778 parity: today's render against the HTML export

Captured from http://127.0.0.1:5193 at 2026-11-03T13:05Z, reduced motion, full page. A pixel counts as changed when any colour channel differs at all. Height is today → export.

| Page | Width | Changed pixels | Share | Height |
| --- | ---: | ---: | ---: | --- |
| / | 1440 | 0 | 0.00% | 4423 → 4423 |
| /dx-consultancy | 1440 | 0 | 0.00% | 4586 → 4586 |
| /dev-tools | 1440 | 0 | 0.00% | 1759 → 1759 |
| /transformation-services | 1440 | 0 | 0.00% | 2935 → 2935 |
| /how-we-help | 1440 | 0 | 0.00% | 13017 → 13017 |
| /services | 1440 | 0 | 0.00% | 6286 → 6286 |
| /method | 1440 | 0 | 0.00% | 2522 → 2522 |
| /case-studies | 1440 | 0 | 0.00% | 3533 → 3533 |
| /about | 1440 | 0 | 0.00% | 5474 → 5474 |
| /insights | 1440 | 0 | 0.00% | 2995 → 2995 |
| /climb | 1440 | 36364 | 0.57% | 4438 → 4438 |
| /industries | 1440 | 0 | 0.00% | 3172 → 3172 |
| /contact | 1440 | 0 | 0.00% | 2935 → 2935 |
| /privacy | 1440 | 0 | 0.00% | 5346 → 5346 |
| /cookies | 1440 | 0 | 0.00% | 3678 → 3678 |
| /terms | 1440 | 0 | 0.00% | 4175 → 4175 |
| /support | 1440 | 0 | 0.00% | 3246 → 3246 |
| /dev-tools/choosing-tools | 1440 | 0 | 0.00% | 3503 → 3503 |
| /dev-tools/trials | 1440 | 0 | 0.00% | 3090 → 3090 |
| /dev-tools/document-solutions | 1440 | 0 | 0.00% | 2566 → 2566 |
| / | 390 | 0 | 0.00% | 5303 → 5303 |
| /dx-consultancy | 390 | 0 | 0.00% | 5286 → 5286 |
| /dev-tools | 390 | 0 | 0.00% | 2908 → 2908 |
| /transformation-services | 390 | 0 | 0.00% | 4304 → 4304 |
| /how-we-help | 390 | 0 | 0.00% | 28276 → 28276 |
| /services | 390 | 0 | 0.00% | 7777 → 7777 |
| /method | 390 | 0 | 0.00% | 2952 → 2952 |
| /case-studies | 390 | 0 | 0.00% | 3653 → 3653 |
| /about | 390 | 0 | 0.00% | 8638 → 8638 |
| /insights | 390 | 0 | 0.00% | 3852 → 3852 |
| /climb | 390 | 3465 | 0.19% | 4654 → 4654 |
| /industries | 390 | 0 | 0.00% | 4349 → 4349 |
| /contact | 390 | 0 | 0.00% | 3679 → 3679 |
| /privacy | 390 | 0 | 0.00% | 6145 → 6145 |
| /cookies | 390 | 0 | 0.00% | 4500 → 4500 |
| /terms | 390 | 0 | 0.00% | 4695 → 4695 |
| /support | 390 | 0 | 0.00% | 3547 → 3547 |
| /dev-tools/choosing-tools | 390 | 0 | 0.00% | 3997 → 3997 |
| /dev-tools/trials | 390 | 0 | 0.00% | 3243 → 3243 |
| /dev-tools/document-solutions | 390 | 0 | 0.00% | 3259 → 3259 |

## Notes

- The last four pages are the GRE-1822 pages, GSAM drafts staged into the baked release for this run (`next-proof/scripts/stage-export-drafts.mjs`). This capture used `PARITY_CHROME=1`, so both sides show the footer links to them. The committed export keeps the published footer, with no links to unpublished pages.
- /climb: the chart loses its trail glow, because the sanitiser refuses `filter` (John, 3 Nov). The footer wave also differs, by at most 2 colour levels out of 255 on the anti-aliased edges of its strokes (2,419 pixels at 1440, 1,002 at 390). That is not visible. The wave markup and CSS are the same on every page, and every other page's footer matches exactly, so the cause is how the browser draws the page with the glow layer gone, not the export.
