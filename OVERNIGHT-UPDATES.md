# Greatstone Studio — Overnight build log

Run started: Mon Jun 15 22:50:11 BST 2026

This is the morning-review doc for John. One entry per round, and a timestamped line after every
material action (deep-dive, item built, verify result, deploy result + live URL, commit hash).
Live prototype: https://greatstone-home.netlify.app/puck-proof/

Audiences kept first-class throughout: (a) public site visitors, (b) studio editors/admins,
(c) future DX-dashboard client/admin users. UX, UI and performance weighted heavily.

---

## Round 1 — started Mon Jun 15 22:50 BST 2026

**Plan:** close out in-progress backlog item #1 (Hero inline on-canvas editing + alignment),
run a fresh multi-agent deep-dive to refresh the prioritised backlog against current state and
the north star (Products/e-commerce + DX dashboard), then work the refreshed backlog in priority
order — one verified, committed, deployed item per cycle.

**[22:51 BST] Item #1 — Hero inline on-canvas text editing + alignment — VERIFIED & CLOSED.**
- Found the code already complete and committed (Hero.jsx uses `align`; all five text fields
  carry `contentEditable: true`; `permissions:{delete:false}` set). The backlog's "in progress"
  note was stale (predated commit `3c03a3c`).
- Verified live in the editor: signed in via `#admin`, entered the Puck editor, selected the
  Hero. Puck wraps kicker/headline/highlight/body/prompt in `_InlineTextField` spans; on focus
  the headline flips `contenteditable` `false`→`plaintext-only` (Puck's active inline-edit mode).
  Public render shows `align-center` correctly. Zero console errors across the whole flow.
- Files: src/blocks/Hero.jsx, src/puck.config.jsx (already committed in `3c03a3c`).
- Deploy: already live (item #1 shipped in the `3c03a3c` deploy). No new deploy needed.
- Result: PASS. Item #1 done.

**[22:52 BST] Round 1 deep-dive launched** — background workflow `weuflbfv9` (studio-deep-dive-r1):
15 lens agents (editor-ux, visitor-ux, ai-authoring, collaboration, content-modeling, publishing,
performance-dx, a11y-seo, i18n-personalisation, media-dam, analytics-insights, 3d-editing,
products-ecom, dx-dashboard, laravel-migration) → 1 synthesis agent that dedups against
already-built + the SKIP list and returns a fresh value/effort-ranked backlog. Findings will be
written to the backlog memory file and logged here, then build cycles resume in priority order.

**[23:08 BST] Deep-dive complete** — `weuflbfv9`, 16 agents, 15/15 lenses returned, 82 raw items
→ synthesised into a 20-item value/effort-ranked backlog (911s, 1.39M subagent tokens). Written
to the backlog memory file. The build order for the rest of Round 1:
1. SEO → document head (panel previews but never writes title/meta/og to the head)  · v5
2. Lazy-load Puck off the public bundle (~432KB parsed by every visitor)  · v5
3. Defer three.js Stage (~520KB on every load)  · v5
4. On-brand modals replacing window.prompt/confirm  · v5
5. Default Hero CTA  · v4 · 6. Reduced-motion guard on the ambient aurora  · v4
7. Scroll-to-top + fade on page nav  · v4 · 8. Mobile nav drawer  · v5
9. Undo/redo + shortcuts  · v4 · 10. Activity timeline tab  · v5
11. Alt-text field + pre-publish preflight  · v5 · 12. Skip-link + focus on nav  · v3
13. Richer footer columns  · v3 · 14. Site-wide Release board  · v5
15. Block-level diff on restore  · v4 · 16. Review notes on transitions  · v5
17. resolveFields/enum hardening  · v3 · 18. Global Site Settings tab  · v4
19. **[NORTH STAR]** Products/Catalog model + Storefront block  · v5/high
20. **[NORTH STAR]** Org-admin Team panel (prototype roles + invites)  · v5

Each verified before building (audit `why` lines are single-agent claims). Building in order now.

### Round 1 build cycles

**[23:18 BST] Item R1-#1 — SEO → document head — BUILT, VERIFIED, COMMITTED. Deploy: BLOCKED (Netlify 500).**
- Confirmed the gap: `SeoPanel` only previewed meta; nothing wrote to `document.head`, so the
  document title/description/canonical/social stayed on index.html's placeholder and never
  changed on navigation.
- Built `applyHead()` + a `useEffect` in App.jsx that writes, from the current page's stored
  `seo`: `document.title`, meta description, `<link rel=canonical>`, Open Graph
  (type/site_name/title/url/image) and Twitter (card/title/description/image). Image + description
  families clear when a page has none, so nothing lingers across navigation. Kept index.html's
  `noindex` (prototype). `SITE_ORIGIN=https://greatstone.com` matches the SeoPanel URL preview.
- Files: `src/App.jsx`.
- Verify: `npm run build` PASS (136 modules, 1.88s). Preview smoke: head updates correctly across
  6 pages (home→`/`, services, proof, about, insights all got correct title + canonical +
  per-page description); zero NEW console errors across repeated navigation (the only console
  errors are 16 frozen entries from a momentary broken-HMR version, dead module timestamp, not
  growing). PASS.
- Commit: `70b61d2`.
- Deploy: synced `dist/` → `greatstone-homepage-deploy/puck-proof/` (new bundle `index-BJVgmUzk.js`
  in place). Ran the proxy-token deploy → **FAILED: 500 Internal Server Error from Netlify's
  `zipAndBuild`** (server-side; the established proxy mechanism). Not retry-looped per instructions.
  Code committed locally + dist synced and ready; the next successful deploy will publish it.
  John: if deploys stay 500 all night, one manual deploy of `greatstone-homepage-deploy` in the
  morning publishes the whole night's work at once.

**[23:25 BST] Item R1-#3 — Defer three.js Stage — BUILT, VERIFIED, COMMITTED.** (Built #3 before #2:
#2 needs a custom public renderer to drop the Puck chunk — `@measured/puck`'s `Render` renders the
public pages — so it's a focused task for the next turn; #3 is a clean, contained win and deploy
order doesn't matter tonight while deploys are 500ing.)
- three.js (~520KB) was in the initial module graph via App→Stage→three, blocking first paint
  though the 3D is purely a decorative background.
- Lazy-loaded `Stage` via `React.lazy` + `Suspense` (transparent fallback). Page content paints
  immediately; the 3D fades in when its chunk arrives. Same `<Stage .../>` call sites.
- Files: `src/App.jsx`.
- Verify: `npm run build` PASS (137 modules) — new async `Stage-*.js` chunk (19.8KB), entry
  260→242KB, `three-*.js` (520KB) now loads on demand, not on first paint. Preview: 16 sections
  render immediately, Stage canvas still mounts after the deferred load, SEO title correct, zero
  new console errors (still the same 16 frozen dead-version entries, not growing). PASS.
- Commit: pending below.
- Deploy: dist re-synced; one combined deploy attempt for #1+#3 follows.

