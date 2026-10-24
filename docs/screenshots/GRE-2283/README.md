# GRE-2283 portal storage state

Desktop (1440 × 900) and phone (390 × 844) screenshots from `npm run dev` and a local
Playwright fixture of the real `PortalStaff` component. The fixture used an example
organisation, mocked staff data and a mocked status response (`connected: false`).
No Microsoft account, live portal data or deployment was used.

`*-before.png` shows the staff view before the storage status appeared.
`*-after.png` shows the OneDrive not connected state in the same view.

`design-report.json` is the design detector output. Its 3 `side-tab` findings are
existing quote and evidence markers at portal.css lines 86, 98 and 142. They
are semantic document markers outside this storage state change. The new state
uses a full border and text, and introduces no side tab.
