# GRE-2262 stone hero review

These captures use the local Method page with `statement`, `stone: right`, and the optional scroll cue set in browser-local storage. No page copy or published content was changed. The earlier GRE-2217 review frames provide the before images.

At 1440 px, the white sphere is gone from the live stone and its regenerated transparent still; the existing point light supplies the highlight. The cue starts at the lede's left edge and sits 205 px below its bottom edge, so no position change was needed. The header now has a 94% dark surface and 12 px blur, hiding the headline as it passes underneath. The stone fade begins at progress 0.4 and reaches zero at 0.7; the sunk frame leaves card 03 clear. At 390 px the WebGL canvas remains absent and the static mark is hidden as before.

`before-1440.png` / `after-1440.png` and `before-390.png` / `after-390.png` are the dark viewport comparisons. The matching `*-light.png` files show both widths on a temporary light review surface. The `*-1440-mid.png` and `*-1440-sunk.png` pairs show the header and exit. The local capture disabled scroll snap to hold those exact scroll positions. The light preview confirms the step body uses the light token, measured as `rgb(60, 69, 62)` on a white card. The site still ships a dark theme only. Review route: `http://127.0.0.1:5180/#method`, with the browser-local settings above.

`inspection.json` records layout bounds and page errors. `verification.json` records one desktop canvas and 0 WebGL draw calls in an 800 ms rest window after the scroll settled (1309 before and after). The phone mounted 0 canvases. Browser page errors: 0.

`npm run preflight` passed. `npm run design:detect` found three existing `side-tab` borders in `src/studio.css` at lines 323, 587 and 802; they are unrelated to this header change and remain in place.
