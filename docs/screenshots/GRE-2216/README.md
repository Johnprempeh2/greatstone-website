# GRE-2216 local visual check

Captured on 24 October 2026 with the Next.js dev server and headless Chromium at
1440 × 900 and 390 × 844, with dark and light colour preferences and reduced motion.
The site currently renders the dark theme under either preference; the separate light
effect stills are exported in `public/motion/` for a future light surface.

`before-*` uses the committed release. For `after-*`, a temporary local release draft
selected Meridian on DX Consultancy, Datum on Dev Tools, Veil on Insights, Ascent on
Proof and Orbit on Contact. It also inserted a Tide divider after Dev Tools and selected
the static glow divider on the two door blocks and Insights. This draft passed
`validateRelease` and was restored after capture. No page content or home page block
was committed or deployed.

The files pair each page's before and after view at both sizes and both preferences.
`editor-dev-tools-1440-dark.png` shows the local GSAM frame handshake, the selected
Dev Tools block, the Motion effect choices and the Divider choice. Selecting Datum in
that editor revealed Intensity; the change was not saved.

For body contrast, each rendered paragraph was hidden without moving it, then its
computed text colour was compared with sampled pixels across the exposed background
in its original box. Across five non-home blocks at both widths and both colour
preferences, the lowest result was 8.92:1 (Insights at 390 px). The light preference
currently uses the dark site palette.

Bedrock is exported as a still and preview but is not placed on a service hero, per
Mikey's review. The proof edge curve awaits John's separate decision and remains Off.
The six pairs of stills are `public/motion/<effect>-{dark,light}.webp`; their 2-second
previews are `public/motion/previews/<effect>.webm`. The existing Tide still is
`public/motion/tide-still.png`; its short preview is
`public/motion/previews/tide.webm`.
