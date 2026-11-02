# GRE-1936 release 1 parity

Captured 2 Nov 2026 from `npm run dev` (Vite, current site, `/#<slug>`) and `next dev` (Next, `/<path>`) at 1440 and 390 px wide, 900 px high, reduced motion. Pages: home, `/dx-consultancy`, `/services`, `/contact`.

## Published pages

`<page>-vite-<width>.jpg` and `<page>-next-<width>.jpg`, full page. All 16 captures load with no page errors, and each Vite and Next pair shows the same h1. The Puck blocks match in order, copy and form fields.

Before GRE-3715, the site shell did not match. The Next header had no Transformation Services menu, no "Begin the Conversation" button and no search. The Next footer had only the three legal links, and no logo, strapline, page links or email. The `<page>-next-<width>.jpg` captures show that state (before).

## Site shell (GRE-3715)

`<page>-next-shell-<width>.jpg` is the after capture. The Next site now renders the studio's own `src/Header.jsx`, `src/Footer.jsx` and `src/cms/CommandPalette.jsx`, fed from the release navigation and site settings. The header has the Transformation Services menu with its subtext, DX Dev Tools with Products, "Begin the Conversation", Sign in and search (⌘K). The footer has the logo, strapline, page links, email, legal row and copyright. At 390 the header folds into the same single menu.

`menu-<site>-<width>.jpg` shows the Transformation Services menu at 1440 and the phone menu at 390, on Next and on Vite. `search-<site>-<width>.jpg` shows the ⌘K palette after typing "serv". Next and Vite match.

Two differences remain, and neither is in the shell. The Vite footer also lists "AI Market Intelligence", a page the studio renders as a built-in route but which is not a published page in the release. And each Next page is still 56 to 280 px shorter than Vite. The gap is inside the blocks (for example, the space under the contact hero), not in the header or footer, and it was there before this change.

## Editor

`<page>-next-editor-<width>.jpg` shows the page as loaded. `<page>-next-editor-edited-<width>.jpg` shows it after typing ` PARITY` into the first visible text field. The Next editor ran on a local `editor.localhost` host, framed by a mock GSAM host at `localhost:5182`. The host used the protocol 1 handshake. It loaded each page's GSAM draft revision, which is now the live content after the release 1 apply. At both widths, for all four pages, the edit marked the page dirty and the typed text reached the `save` request. The mock host answered the save, so nothing was written to GSAM. The red "1 Issue" badge is the Next dev overlay for a hydration attribute warning. It appears only in development.

The current Vite editor was not captured. Its sign-in now uses Better Auth, which needs its server and database. The "Demo staff" hint on the sign-in screen is stale: those details are refused locally.
