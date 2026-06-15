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
- Commit: `897f86e`.
- Deploy: dist re-synced (SEO + Stage split both in `puck-proof/`); combined deploy for #1+#3
  attempted → **same 500 Internal Server Error**.

**[23:27 BST] DEPLOY STATUS — Netlify deploys are DOWN tonight (server-side 500).** Two attempts,
both failed identically: `Failed to deploy site: 500 Internal Server Error` from `@netlify/mcp`'s
`zipAndBuild` (the proxy-token path that worked earlier today). This is server-side and not
fixable from here, so per the run rules I've STOPPED attempting deploys (no retry-loop) and am
continuing to build. **All work is committed locally and `greatstone-homepage-deploy/puck-proof/`
holds the latest built dist, ready to publish.** John: one manual/working deploy of
`greatstone-homepage-deploy` in the morning publishes the entire night's work at once. I'll make a
single fresh deploy attempt every few items in case the backend recovers, but won't loop on it.

**[23:28 BST] Yielding turn 1.** Shipped this cycle: fresh 20-item backlog (deep-dive `weuflbfv9`),
item #1 closed (Hero inline editing verified), R1-#1 SEO→head (`70b61d2`), R1-#3 three.js defer
(`897f86e`). Next turn (fresh context): R1-#2 lazy-load Puck off the public bundle — needs a small
custom public renderer so `@measured/puck`'s `Render` (and the 432KB puck chunk) leaves the public
path while the editor stays lazy. Then R1-#4 (modals) and the low-effort UX/a11y batch (#5–#7, #12).

**[23:38 BST] Item R1-#2 — Lazy-load Puck off the public bundle — BUILT, VERIFIED, COMMITTED.**
- Confirmed `@measured/puck`, its `Render`, and `puck.css` were used ONLY in App.jsx, and every
  block is flat (no Puck zones/slots; none read the `puck` render prop). So a public visitor was
  downloading the entire 432KB editor + 45KB editor CSS just to view static pages.
- Built `src/PublicRender.jsx`: a tiny renderer that maps `data.content` → each block's registered
  `render(props)` (stable `props.id` key, gs-blk anchors preserved). Built `src/EditorMount.jsx`:
  a lazy entry that imports Puck + `puck.css`, loaded via `React.lazy` only when an admin opens
  edit mode (wrapped in `Suspense` with an on-brand `.gs-editor-loading` fallback). App.jsx now
  renders the public site through PublicRender and the editor through the lazy PuckEditor.
- Files: `src/PublicRender.jsx` (new), `src/EditorMount.jsx` (new), `src/App.jsx`, `src/studio.css`.
- Verify: `npm run build` PASS (139 modules). **Public first-load: CSS 81.7KB→36.5KB, and the
  432KB puck JS + 45KB puck CSS are now async/editor-only** (alongside three.js 520KB deferred from
  R1-#3). Preview: public home renders all 8 blocks via PublicRender (16 sections, gs-blk anchors
  intact, header/footer/SEO correct); signed in + entered edit mode → lazy Puck chunk loads, canvas
  + toolbar work, fallback resolves; zero new console errors on either path (the 40 console entries
  are frozen from two dead mid-edit HMR versions, not growing across hard reloads). PASS.
- Commit: `cd8ead9`.
- Deploy: dist synced; fresh attempt → **3rd consecutive 500** (`zipAndBuild`). Netlify's deploy
  backend is confirmed down for the night. Pausing deploy attempts entirely now; `puck-proof/`
  holds the full current build (SEO + three.js defer + Puck-off-public-bundle), ready for one
  morning deploy. Will only re-attempt much later if there's a signal the backend recovered.

**[23:40 BST] Turn 2 done — yielding.** Shipped R1-#2 (Puck off the public bundle, `cd8ead9`):
public first-load JS ~1.2MB→243KB, CSS 82KB→36.5KB; editor lazy-loads on demand. Next turn: R1-#4
on-brand modal replacing `window.prompt/confirm` (newPage/retitle/delete/restore/discard), then the
low-effort UX/a11y batch (#5–#7, #12). Deploys remain blocked server-side; all work committed locally.

**[23:52 BST] Item R1-#4 — On-brand modal replacing window.prompt/confirm — BUILT, VERIFIED, COMMITTED.**
- Editor used raw OS `window.prompt`/`window.confirm` for new page, rename, delete, restore, and
  discard — unstyled, off-brand, unvalidatable, and inconsistent across browsers.
- Built `src/cms/Modal.jsx`: a Promise-driven modal with two kinds — `prompt` (labelled input,
  Enter-to-confirm, confirm disabled while empty) and `confirm` (message + optional danger styling).
  Focus moves in on open, Escape + backdrop-click cancel, simple Tab focus-trap. App.jsx gets a
  `modal` state + `ask()` (opens the modal, resolves with the input string or true/false) and a
  branded `.gs-modal` / `.gs-btn.danger` style. Converted all five flows (newPage, retitlePage,
  deletePage, restoreVersion, discardDraft) to `await ask(...)`.
- Files: `src/cms/Modal.jsx` (new), `src/App.jsx`, `src/studio.css`.
- Verify: `npm run build` PASS (140 modules). Preview: created a test page through the prompt
  modal (default value pre-selected, auto-focused, "Create page" → page made, entered edit mode);
  deleted it through the confirm modal (correct message, red danger button, no input → "Page
  deleted.", back to 9 pages). Test page cleaned up. Zero new console errors (still the 40 frozen
  dead-version entries). PASS.
- Commit: `8f0ee16`.
- Deploy: deferred (Netlify still 500ing). dist synced for the morning deploy.

**[23:58 BST] Item R1-#6 — Reduced-motion guard on the ambient aurora — BUILT, VERIFIED, COMMITTED.**
- Found the audit's "aurora" is the `gsDrift` keyframe driving the blurred glow behind StatStrip
  (`.b-proof-aurora`, 24s) and Invite (`.b-invite-aurora`, 26s) — both `infinite alternate` and
  NOT gated by `prefers-reduced-motion` (only `[data-reveal]` + a few blocks were). Real WCAG gap.
- Gated both auroras: `@media(prefers-reduced-motion:reduce){…{animation:none}}`, matching the
  codebase's existing per-block reduced-motion pattern (RoiBar/Timeline/MaturityMap do the same).
- Files: `src/blocks/StatStrip.jsx`, `src/blocks/Invite.jsx`.
- Verify: `npm run build` PASS (140 modules). CSS guard is a straightforward static rule. PASS.
- Commit: `pending (committed below)`.

**[23:59 BST] Item R1-#7 — Scroll-to-top + fade on page navigation — BUILT, VERIFIED, COMMITTED.**
- `navigate()` switched pages but never reset scroll, so visitors landed mid-page on the next one.
- `navigate()` now `window.scrollTo({top:0, behavior:'instant'})`; added a brief `gsPageIn` opacity
  fade on the `.gs-public` remount (`key={current}`) — opacity-only, reduced-motion-safe.
- Files: `src/App.jsx`, `src/index.css`.
- Verify: `npm run build` PASS. Preview: scrolled home to 1200px, clicked Services → scroll reset
  to 0 and title updated; zero new console errors. PASS.
- Commit: `pending (committed below)`.
- Deploy: both deferred (Netlify 500); dist synced for the morning deploy.

**[00:01 BST] Turn 3 done — yielding.** Shipped 3 items: R1-#4 on-brand modals (`8f0ee16`),
R1-#6 aurora reduced-motion guard (`74f741b`), R1-#7 scroll-to-top + page fade (`d299084`). Dist
re-synced to `puck-proof/` — now carries R1 #1,#2,#3,#4,#6,#7. Round 1 remaining: #5 default Hero
CTA (needs a judgment call — the homepage hero deliberately uses the scroll cue, not a button;
will scope to new-Hero defaults only), #8 mobile nav drawer, #9 undo/redo, #10 activity timeline,
#11 alt-text preflight, #12 skip-link, #13 footer columns, #14 release board, #15 block diff, #16
review notes, #17 resolveFields, #18 site settings, #19 Products (NORTH STAR), #20 Team panel
(NORTH STAR). Deploys still down server-side; everything committed locally.

**[00:10 BST] Item R1-#5 — Default Hero CTA — BUILT, VERIFIED, COMMITTED.**
- Hero `defaultProps.ctaLabel` was `''`, so a newly-added Hero rendered with no button. Set the
  default to `'Book a Deep Dive'` (`ctaHref` already `#book`). Checked the seed: EVERY seeded hero
  already carries an explicit `ctaLabel` ("Book a Deep Dive" / "Subscribe"), so this changes nothing
  on existing pages — it only gives blocks an editor adds a sensible starting CTA (clearable).
- Files: `src/blocks/Hero.jsx`. Verify: build PASS (140 modules); home/services heroes unchanged
  (their CTAs are seeded). PASS. Commit: pending below.

**[00:12 BST] Item R1-#8 — Mobile nav drawer — VERIFIED ALREADY WORKING; no build (audit false positive).**
- Tested the public header at 375px: it does NOT overflow, the page nav collapses into an on-brand
  "Pages" dropdown (measured, not breakpoint-guessed), and the search field auto-hides. Opened the
  dropdown on mobile — all 9 pages listed, fits the viewport, large tap targets, 3D + CTA render
  behind. Screenshot confirms a clean mobile nav.
- The audit's "unused drawer CSS" is the LIVE SITE's `site.css` `.nav.open .nav-links` drawer —
  genuinely unused by the studio, but `site.css` is the real shared stylesheet kept verbatim for
  parity, so it's intentionally left as-is. The studio has its own working responsive nav
  (`Header.jsx` collapse). Building a second mobile drawer would be redundant. Skipped with rationale.

**[00:22 BST] Item R1-#9 — Undo/redo buttons + shortcuts — BUILT, VERIFIED, COMMITTED.**
- Puck binds ⌘Z / ⌘⇧Z / ⌘Y for undo/redo natively (confirmed in the dist), but our custom
  `headerActions` override replaced Puck's default header (which carried the buttons), so they were
  invisible. Added visible Undo/Redo buttons.
- Built `src/cms/UndoRedo.jsx` (uses `usePuck().history`; `hasPast()/hasFuture()` are functions in
  0.20) and rendered it in the toolbar via `<Suspense><UndoRedo/></Suspense>`. It's a separate lazy
  module so `@measured/puck` stays off the public bundle (its own 0.66KB chunk). No extra keyboard
  handler — Puck's native hotkeys already work; double-binding would double-undo.
- Files: `src/cms/UndoRedo.jsx` (new), `src/App.jsx`, `src/studio.css`.
- Verify: build PASS (141 modules; `UndoRedo-*.js` 0.66KB async). Preview: signed in, entered edit;
  both buttons present and correctly DISABLED with no history; made an inline edit → Undo enabled;
  clicked Undo → reverted, Undo disabled + Redo enabled. Zero new console errors. PASS.
- Commit: pending below. Deploy: deferred (Netlify 500).

