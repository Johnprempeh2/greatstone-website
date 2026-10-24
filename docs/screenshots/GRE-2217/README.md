# GRE-2217 stone review

The production home page remains unchanged. These are local previews of the existing Method hero with its approved copy, using the `statement` layout and `stone: right` option in browser-local storage. The Method page background was set to `none` in the preview so the trace counts only this hero's WebGL work. No preview change was saved to the site seed or deployed.

`before-*` renders `origin/main` (`4506da0`), `after-*` renders this branch. Each has 1440 and 390 px views in dark and light. The current public site has a dark palette only. The light views apply a temporary light surface and token override in the browser for contrast review; they do not claim a shipped light theme.

`performance.json` records Chrome Headless WebGL draw calls during an 800 ms resting window after the hero settles. On desktop, the old mount drew 150 to 360 calls and the shared mount drew **zero**. The shared mount served two symbol hosts with one canvas. At 390 px, the new path mounted **zero** WebGL canvases and showed the static accent.

`paint-trace.json` contains five fresh 1440 px loads for each version. Median first contentful paint: **456 ms before, 428 ms after**. The new `stone-motion.mjs` request started after first contentful paint in all five after runs (about 34 to 38 ms later). This is a local headless comparison, not a field metric. Browser page errors: zero in the screenshot runs.

`behaviour.json` verifies the fallback in a browser: normal desktop creates one shared canvas; reduced motion, Save Data, low-power hardware and phone each create zero canvases and keep both stills visible.

`public/motion/stone-shared-still.png` is a transparent still rendered from the new scene, and `public/motion/previews/stone.webm` shows the settle and scroll split for the GRE-2212 Motion library. The static accent is `public/motion/stone-accent.svg`.
