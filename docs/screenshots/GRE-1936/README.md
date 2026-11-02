# GRE-1936 release 1 parity

Captured 2 Nov 2026 from `npm run dev` (Vite, current site, `/#<slug>`) and `next dev` (Next, `/<path>`) at 1440 and 390 px wide, 900 px high, reduced motion. Pages: home, `/dx-consultancy`, `/services`, `/contact`.

## Published pages

`<page>-vite-<width>.jpg` and `<page>-next-<width>.jpg`, full page. All 16 captures load with no page errors, and each Vite and Next pair shows the same h1. The Puck blocks match in order, copy and form fields.

The site shell does not match yet. The Next header has no Transformation Services menu, no "Begin the Conversation" button and no search. The Next footer has only the three legal links, and no logo, strapline, page links or email. That is why each Next page is 350 to 680 px shorter. This is tracked as a child issue of GRE-1936.

## Editor

`<page>-next-editor-<width>.jpg` shows the page as loaded. `<page>-next-editor-edited-<width>.jpg` shows it after typing ` PARITY` into the first visible text field. The Next editor ran on a local `editor.localhost` host, framed by a mock GSAM host at `localhost:5182`. The host used the protocol 1 handshake. It loaded each page's GSAM draft revision, which is now the live content after the release 1 apply. At both widths, for all four pages, the edit marked the page dirty and the typed text reached the `save` request. The mock host answered the save, so nothing was written to GSAM. The red "1 Issue" badge is the Next dev overlay for a hydration attribute warning. It appears only in development.

The current Vite editor was not captured. Its sign-in now uses Better Auth, which needs its server and database. The "Demo staff" hint on the sign-in screen is stale: those details are refused locally.
