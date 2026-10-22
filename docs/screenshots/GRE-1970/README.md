# GRE-1970 consent comparison

Captured from local `npm run dev` (Vite, port 5180) and `npm run dev:next` (Next, port 5181) on 22 October 2026 with `GTM-TEST`, reduced motion, fresh browser storage, and 900px viewport height. The browser schemes were light and dark; the Greatstone site intentionally uses its dark brand surface in both.

| Width | Scheme | Before, Vite | After, Next |
| --- | --- | --- | --- |
| 1440 | Light | [vite-1440-light.png](vite-1440-light.png) | [next-1440-light.png](next-1440-light.png) |
| 1440 | Dark | [vite-1440-dark.png](vite-1440-dark.png) | [next-1440-dark.png](next-1440-dark.png) |
| 390 | Light | [vite-390-light.png](vite-390-light.png) | [next-390-light.png](next-390-light.png) |
| 390 | Dark | [vite-390-dark.png](vite-390-dark.png) | [next-390-dark.png](next-390-dark.png) |

The browser blocked the external GTM request after the script was inserted so these local captures sent no analytics data. The Next interaction check found no GTM script before Accept, one afterwards, and `gs-consent=denied` with the banner hidden after reopening Cookie settings and declining.
