# /consultancy revision 10 captures

These captures use the saved, unpublished GSAM website draft revision 10 content, rendered by the current Vite block components and stylesheet. A plain 66px header stands in for the connected site's header; the page body is the real Puck render. They are evidence for the layout review, not a published site capture.

- `revision-10-1440-first-screen.png`: 1440 by 900 first screen.
- `revision-10-1440-full-page.png`: 1440 full page.
- `revision-10-390-full-page.png`: 390 full page.

Playwright waited for `document.fonts.ready` and scrolled through the page to trigger reveal states before capture. The hero heading computed `font-family: Montserrat, ...`, and `document.fonts.check('900 56px Montserrat')` returned `true` at both widths. At 1440 the logo row ended at 626px and the first screen included the start of Capabilities. At 390 the buttons ended at 462px and the document width was 390px.
