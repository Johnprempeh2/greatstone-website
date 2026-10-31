# GRE-3407 ComposeExplorer

Local Vite screenshots of the block on its own, with the site stylesheet and Montserrat, at 1440 by 900 (`desktop-`), 390 by 844 (`phone-`) and 320 by 700 (`narrow-`). The services are the bundled 78-service catalogue; no basket, payment or customer data was loaded.

Second pass after Mikey's review: the answer now sits right under the problems, and the full catalogue is folded until asked for.

- `*-idle`: nothing picked yet. Six problem cards (3 by 2 at 1440), "Or build your own" as a text-button under the row, and the empty answer panel.
- `*-lit`: "Too much manual admin" picked. Its six services light up as emerald chips in the answer panel, with the areas and the basket button, in the same view as the click. At 1440 the problem row to the bottom of the answer is 604px. On a phone the answer scrolls into view after the pick.
- `*-edit-board`: "Edit this list" opens the catalogue and scrolls to the first lit service. Unlit services drop to 45% opacity. The one-line bar (62px) keeps the count and basket in reach.
- `phone-bar-expanded`: tapping the count opens the bar to show the areas and the quote link.
- `*-build-your-own`: "Or build your own" opens the catalogue; two services toggled with the keyboard only (Enter, then Space).

Checked in the same run: no sideways scroll at 1440, 390 or 320; every visible button and link at least 44px tall; no console errors; under reduced motion the chip animation is off and every transition is 0s.
