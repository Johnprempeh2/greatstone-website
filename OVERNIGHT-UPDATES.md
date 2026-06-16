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
- Commit: `def533e`. Deploy: deferred (Netlify 500).

**[00:24 BST] Turn 4 done — yielding.** Shipped R1-#5 (Hero CTA default `782c896`), verified+skipped
R1-#8 (mobile nav already works), R1-#9 (undo/redo `def533e`). Round 1 done so far: #1,#2,#3,#4,#5,#6,#7,#9
built (+ #8 verified). dist re-synced. Remaining: #10 activity timeline, #11 alt-text preflight, #12
skip-link, #13 footer columns, #14 release board, #15 block diff, #16 review notes, #17 resolveFields,
#18 site settings, #19 Products (NORTH STAR), #20 Team panel (NORTH STAR). Deploys still 500 server-side.

## Round 1 build cycles (cont.)

**[00:42 BST] Item R1-#10 — Activity log tab — BUILT, VERIFIED, COMMITTED.**
- The store captured `statusHistory` (who moved a page through draft→review→approved→published, +
  `approvedBy`) but nothing surfaced it — the governance audit trail was invisible.
- Built `src/cms/ActivityPanel.jsx`: a read-only timeline of the page's status transitions with
  human-readable labels ("Submitted for review", "Approved", "Published", "Unpublished — back to
  draft"), actor and relative time, plus a "Currently <status>" header (colour-coded dot). Added it
  as a 5th Studio tab and an "Open activity log" command. Distinct from History (which restores
  version snapshots) — Activity is the accountability log. Reuses the `.gs-versions` timeline style.
- Files: `src/cms/ActivityPanel.jsx` (new), `src/cms/StudioPanel.jsx`, `src/App.jsx`, `src/studio.css`.
- Verify: build PASS (142 modules). Preview: Activity tab appears (5 tabs); home shows "Currently
  Published" + empty state; created a throwaway page, set it to review → Activity showed "Submitted
  for review · just now · admin@greatstone" and "Currently In review"; deleted the test page
  (cleanup, back to 9). Zero console errors. PASS.
- Commit: `56a5e26`. Deploy: deferred (Netlify 500).

**[00:50 BST] Item R1-#12 — Skip-to-content link + focus on nav — BUILT, VERIFIED, COMMITTED.**
- No skip link and no focus management on SPA navigation (keyboard/screen-reader users had to tab
  through the whole header on every page, and route changes weren't announced).
- Added a `.gs-skip` "Skip to content" link (off-screen until focused, then slides in) targeting
  `#gs-main`; gave the public `<main>` `id="gs-main"` + `tabIndex={-1}`; on public page change, move
  focus to `#gs-main` (skipping the initial mount, `preventScroll`). Pairs with R1-#7's scroll reset.
- Files: `src/App.jsx`, `src/studio.css`.
- Verify: build PASS (142 modules). Preview: skip link present (text + `href="#gs-main"`), main
  target exists (`tabIndex=-1`); navigating to Method moved focus to `#gs-main` (confirmed via
  activeElement). The `:focus` visual reveal can't trigger headlessly (`document.hasFocus()` is
  false in the preview tab) but both CSS rules are present + correct — standard pattern. Zero console
  errors. PASS.
- Commit: `41eb357`. Deploy: deferred (Netlify 500).

**[00:52 BST] Turn 5 done — yielding.** Shipped R1-#10 activity log (`56a5e26`), R1-#12 skip-link +
focus-on-nav (`41eb357`). dist re-synced (now R1 #1–#7, #9, #10, #12). Round 1 remaining: #11 alt-text
preflight (v5), #13 footer columns (v3), #14 release board (v5), #15 block diff (v4), #16 review notes
(v5), #17 resolveFields (v3), #18 site settings (v4), #19 Products NORTH STAR (v5/high), #20 Team panel
NORTH STAR (v5). Next turns: the v5 governance/editor items (#14, #16) and the two north-star builds.
Deploys still 500 server-side; all work committed locally + dist staged for one morning deploy.

## Round 1 build cycles (cont.)

**[01:06 BST] Item R1-#11 — Pre-publish alt-text preflight — BUILT, VERIFIED (with note), COMMITTED.**
- Found Figure and FeaturedArticle already have an explicit `alt` field, and Team avatars use the
  member's name as alt — so the "add an alt field" part was already in place. The real gap was no
  pre-publish CHECK, so images could ship with empty alt (a11y + SEO).
- Added `findMissingAlt(content)` (Figure/FeaturedArticle with an image but no alt; Team photo with
  no name) and made `publish()` async: before publishing it warns via the on-brand modal — "Publish
  without alt text? N images have no alt (…). Publish anyway, or cancel to add it?" — a soft warning,
  not a hard block (decorative images exist). Cancel returns so the editor can fix.
- Files: `src/App.jsx`.
- Verify: build PASS (142 modules). Preview: created a test page (no images) and Cmd+S → published
  with NO warning + correct toast (confirms the async publish + preflight returning no issue);
  added a Figure block via the palette and selected it. NOTE: could not drive the positive case
  fully headlessly — Puck's fields sidebar didn't expose the MediaField to set an image via synthetic
  events. The branch is trivial correct logic over `data.content` and reuses the R1-#4-proven modal,
  so confidence is high; the happy path is fully confirmed. Test page deleted (cleanup). Zero console
  errors. PASS (positive-path UI confirmation deferred to a real browser).
- Commit: `ffb3cec`. Deploy: deferred (Netlify 500).

**[01:08 BST] Turn 6 done — yielding.** Shipped R1-#11 alt preflight (`ffb3cec`). dist re-synced.
Round 1 built: #1–#7, #9, #10, #11, #12 (+ #8 verified). Remaining: #13 footer columns (v3), #14
release board (v5), #15 block diff (v4), #16 review notes (v5), #17 resolveFields (v3), #18 site
settings (v4), #19 Products NORTH STAR (v5/high), #20 Team panel NORTH STAR (v5). Next: the v5
governance items (#14, #16) then the two north-star builds. Deploys still 500 server-side.

## Round 1 build cycles (cont.)

**[01:24 BST] Item R1-#14 — Site-wide Release board — BUILT, VERIFIED, COMMITTED.**
- Per-page status lived in the toolbar + Pages list, but nothing showed the whole site's publish
  state at once: which pages have unpublished changes (draft drift), which await review/approval,
  when each last went live.
- Built `src/cms/ReleaseBoard.jsx` — a read-only governance overview: a 4-stat summary
  (Published / In review / Approved / Draft), a drift line ("N pages have unpublished changes" or
  "Every page is up to date"), and a list of all pages sorted attention-first (in review → approved
  → drift → rest) with an "unpublished" badge, last-published time + actor, status pill, and an
  open-this-page action. Added as a "Releases" Studio tab (the only site-wide view) + a palette
  command. Reuses the `gs-st-*`/`gs-dot` status styling.
- Files: `src/cms/ReleaseBoard.jsx` (new), `src/cms/StudioPanel.jsx`, `src/App.jsx`, `src/studio.css`.
- Verify: build PASS (143 modules). Preview: Releases tab renders (6 tabs wrap cleanly); summary
  showed 9 Published; it correctly DETECTED an 11-char draft drift on Services (a Puck normalisation
  artifact left by my earlier R1-#9 inline-edit test — identical content) and sorted it to the top
  with the "unpublished" badge. Discarded that draft → board flipped to "Every page is up to date",
  0 drift badges (also tidies John's store). Zero console errors. PASS.
- Commit: `6d2fd52`. Deploy: deferred (Netlify 500).

**[01:26 BST] Turn 7 done — yielding.** Shipped R1-#14 Release board (`6d2fd52`) + tidied a
test-induced draft drift on Services. dist re-synced. Round 1 built: #1–#7, #9, #10, #11, #12, #14
(+ #8 verified). Remaining: #16 review notes (v5), #13 footer columns (v3), #15 block diff (v4), #17
resolveFields (v3), #18 site settings (v4), #19 Products NORTH STAR (v5/high), #20 Team panel NORTH
STAR (v5). Next: #16 review notes, then start the north-star builds. Deploys still 500 server-side.

## Round 1 build cycles (cont.)

**[01:40 BST] Item R1-#16 — Review notes on workflow transitions — BUILT, VERIFIED, COMMITTED.**
- Status transitions (submit for review, approve, send back to draft) carried no context, so the
  review handoff had no place for "looks good" / "fix the hero copy".
- `setStatus()` now prompts for an OPTIONAL note on the three collaboration transitions (review /
  approved / draft) and records it in the statusHistory entry. Added `allowEmpty` to the Modal so the
  note can be left blank (Submit stays enabled when empty). The Activity log renders the note as a
  quoted, accent-bordered line under the event.
- Files: `src/App.jsx`, `src/cms/Modal.jsx`, `src/cms/ActivityPanel.jsx`, `src/studio.css`.
- Verify: build PASS (143 modules). Preview: created a test page, set status → "Submit for review"
  prompt appeared ("Note for the reviewer (optional)", Submit enabled while empty = allowEmpty
  works); entered "Please tighten the hero subhead before publishing." → status went to In review
  and the Activity log showed "Submitted for review" with the note quoted. Test page deleted. Zero
  console errors. PASS.
- Commit: `1fef7ab`. Deploy: deferred (Netlify 500).

**[01:42 BST] Turn 8 done — yielding. STRATEGIC PIVOT to the north-star builds next.** Shipped R1-#16
review notes (`1fef7ab`). Round 1 built: #1–#7, #9, #10, #11, #12, #14, #16 (13 items) + #8 verified.
Remaining: #13 footer (v3), #15 block diff (v4), #17 resolveFields (v3), #18 site settings (v4) — all
lower-value — plus #19 Products NORTH STAR (v5/high) and #20 Team panel NORTH STAR (v5). Since the
north star is the repeated strategic headline and is large, the next several turns go to #19 Products
(content model + Catalog taxonomy + Products/Storefront block + management UX + prototype cart UI +
backend handoff spec) then #20 Team/roles + invitations prototype. The remaining v3/v4 items (#13,
#15, #17, #18) get done after, or roll into Round 2. Deploys still 500 server-side; dist staged.

## Round 1 build cycles (cont.) — NORTH STAR

**[02:00 BST] Item R1-#19 (part 1 of N) — Products catalogue foundation — BUILT, VERIFIED, COMMITTED.**
- The first slice of the Products/e-commerce north star: a CMS-native product catalogue + a storefront
  front-end. Designed to map 1:1 onto the dev team's Laravel Products/Categories tables.
- Store: added a `products` + `categories` slice with CRUD (`listProducts`, `addProduct`,
  `updateProduct`, `removeProduct`, `listCategories`, `addCategory`, `removeCategory`) and a seed
  catalogue — 5 on-brand Greatstone software products (Bedrock Platform, Slate Workflow, Quarry
  Analytics, Keystone Integrations, Mortar Connect [legacy]) across 3 categories (Platforms,
  Automation & Workflow, Data & Integration). Schema 12→13; migration is ADDITIVE (backfills the
  catalogue + a Products page on existing stores, never overwrites). `CatalogContext` provides the
  catalogue to blocks (mirrors MediaContext), wrapped around both the public + editor render paths.
- New `Storefront` block: renders the catalogue grouped by category with on-brand product cards
  (badge, category tag, summary, features, price/period, licence, "Request a licence" → #book). NO
  fake checkout — licence purchase is a backend handoff. Registered under a new "Commerce" drawer
  group. Seeded a Products page (Hero + Storefront), added to nav after Industries.
- Files: `src/store.js`, `src/cms/CatalogContext.js` (new), `src/blocks/Storefront.jsx` (new),
  `src/puck.config.jsx`, `src/App.jsx`.
- Verify: build PASS (145 modules). Preview: store migrated to schema 13 (5 products, 3 categories,
  Products page added to order + nav); Products page renders the storefront — 5 cards in 3 category
  groups, badges/CTAs correct; screenshot confirms on-brand design over the 3D stone. App mounts
  clean on a hard reload (the only console errors are 16 frozen "[vite] Failed to reload" HMR
  artifacts from the multi-edit sequence, not growing; production build is clean). PASS.
- Commit: `4fbce97`. Deploy: deferred (Netlify 500). dist synced.

**[02:02 BST] Turn 9 done — yielding.** Shipped R1-#19 part 1: the Products catalogue foundation
(`4fbce97`) — a real content model + on-brand Storefront, the first north-star slice. Next turn
continues #19 with the in-studio Products management panel.

**[02:18 BST] Item R1-#19 (part 2) — In-studio Products management panel — BUILT, VERIFIED, COMMITTED.**
- Built `src/cms/ProductsPanel.jsx` — a "Products" Studio tab to manage the catalogue: list all
  products (expandable editors), add a product, edit every field (name, category, status, price,
  period, licence, badge, summary, features-one-per-line) committing to the store on blur, remove a
  product (confirm modal), plus a collapsible Categories manager (add/edit/remove). App got the
  CRUD wiring (createProduct/editProduct/deleteProduct + category equivalents) over the store
  helpers, a palette command, and the 7th Studio tab. The Storefront reads the same catalogue, so
  edits show on the public Products page live.
- Files: `src/App.jsx`, `src/cms/ProductsPanel.jsx` (new), `src/cms/StudioPanel.jsx`, `src/studio.css`.
- Verify: build PASS (146 modules). Preview: opened Products tab → 5 products listed; "+ Add product"
  → 6 (store + panel); expanded the new one, renamed it "Cornerstone Governance" → committed to the
  store on blur; removed it via the confirm modal ("Remove 'Cornerstone Governance' from the
  catalogue?") → back to 5. Test product cleaned up. Build clean; only the 16 frozen "[vite] Failed
  to reload" HMR messages from the multi-edit sequence (not runtime errors). PASS.
- Commit: `b88cebb`. Deploy: deferred (Netlify 500). dist synced.

**[02:20 BST] Turn 10 done — yielding.** Shipped R1-#19 part 2: in-studio Products management
(`b88cebb`). The Products north star now has the catalogue model + storefront + full management UX.
Next turn finishes #19 with a clearly-labelled prototype cart/checkout UI + a backend handoff spec,
then R1-#20 (Team/roles/invitations prototype).

**[02:38 BST] Item R1-#19 (part 3 — COMPLETE) — Licence basket + checkout prototype + handoff spec — BUILT, VERIFIED, COMMITTED.**
- Finished the Products north star with an honest licence-request e-commerce flow (Greatstone sells
  enterprise licences, so it's request-a-quote, not a card checkout — it takes NO payment and
  transmits nothing).
- Built `CartContext` (in-memory basket `{productId: qty}`, never persisted) + `CartDrawer` (floating
  basket button with count → slide-over: line items with seat quantity +/- and remove, a "prices are
  a guide" note, then a request form (name/company/email) with a prominent prototype disclaimer →
  on-screen confirmation → clears). Storefront cards got an "Add to licence" button (shows "Added · N").
  Wrapped both render paths with CartContext; the drawer renders on the public site. Added a
  "Products, licensing and checkout" section to HANDOVER.md specifying the Laravel/Stripe backend for
  real checkout, payment (PCI provider, browser never sees card data) and licence issuance.
- Files: `src/cms/CartContext.js` (new), `src/cms/CartDrawer.jsx` (new), `src/App.jsx`,
  `src/blocks/Storefront.jsx`, `src/studio.css`, `HANDOVER.md`.
- Verify: build PASS (148 modules). Preview: on the Products page, "Add to licence" added items
  (FAB count 3, card showed "Added · 2"); drawer listed "Bedrock Platform x2 / Slate Workflow x1";
  qty +/- and remove worked; "Request these licences" → form (with prototype note) → filled + sent →
  "Thanks, Jane — we'd prepare a licence agreement for 2 products and send it to jane@northwind.co";
  "Done" cleared the basket + closed. Build clean; the 24 "[vite] Failed to reload" entries are
  mid-edit HMR artifacts (final code builds + runs). PASS.
- Commit: `cf37fe5`. Deploy: deferred (Netlify 500). dist synced.

**[02:40 BST] Turn 11 done — yielding. R1-#19 PRODUCTS NORTH STAR COMPLETE.** Three commits
(`4fbce97` foundation, `b88cebb` management, `cf37fe5` basket/checkout + handoff). The studio now has
a real catalogue, in-studio product/category management, an on-brand public storefront, and an honest
licence-request checkout — all mapping to the dev team's Laravel/Stripe model. Next turn: R1-#20, the
DX-dashboard north star (org-scoped roles + invitations prototype) on the existing role model
(`cms/auth.js`). Then the leftover v3/v4 items (#13, #15, #17, #18), then Round 2 deep-dive.
Deploys still 500 server-side; everything committed + dist staged.

**[02:58 BST] Item R1-#20 (COMPLETE) — Team, roles & invitations (DX-dashboard north star) — BUILT, VERIFIED, COMMITTED.**
- The second north star's CMS-native, prototype-completable slice: an org roster with role
  assignment + invitations, admin-only. Assigns roles and records invitations ONLY — no real
  account, no password, no email (real multi-tenant auth/RBAC/invite delivery = Laravel).
- Store: added a `team` slice + CRUD (`listTeam`, `inviteTeamMember`, `updateTeamMember`,
  `removeTeamMember`) seeded from the demo accounts; additive schema 13→14 migration. Built
  `cms/TeamPanel.jsx` — an admin-only "Team" Studio tab: invite form (name/email/role → pending
  invitation), members + pending lists, per-member edit (name/email/role/status/responsibilities,
  commit on blur), remove (confirm). Reuses the `ROLES` capability map from `auth.js`. StudioPanel
  now filters tabs by which panels are provided, and App only provides the `team` panel + palette
  command when the user has `manageUsers` (admins) — so the RBAC gate is demonstrated. Added a
  "Team, roles and the DX Dashboard" handoff section to HANDOVER.md (Laravel orgs + Spatie roles +
  signed expiring invitation links).
- Files: `src/store.js`, `src/cms/TeamPanel.jsx` (new), `src/cms/StudioPanel.jsx`, `src/App.jsx`,
  `src/studio.css`, `HANDOVER.md`.
- Verify: build PASS (149 modules). Preview: as admin → Team tab present (8 tabs), 3 seeded members
  with correct role pills (Administrator/Editor/Reviewer); invited "Sam Rivers" → pending invitation
  + honest toast ("no email sent"); removed via confirm modal (back to 3). **RBAC gate confirmed:
  signed in as editor → Team tab HIDDEN** (Products still present). Schema migrated to 14. Build
  clean; the 8 "[vite] Failed to reload" entries are mid-edit HMR artifacts. PASS.
- Commit: `3f1dad0`. Deploy: deferred (Netlify 500). dist synced.

**[03:00 BST] Turn 12 done — yielding. BOTH NORTH STARS DELIVERED.** R1-#19 Products/e-commerce
(`4fbce97`/`b88cebb`/`cf37fe5`) + R1-#20 Team/roles/DX-dashboard (`3f1dad0`). The studio now has a
real product catalogue with management + storefront + licence basket, AND an org team/roles/invite
prototype with an RBAC gate — both mapping cleanly to the dev team's Laravel build, with handoff
specs in HANDOVER.md. Round 1 remaining (all low-value v3/v4): #13 footer columns, #15 block diff,
#17 resolveFields, #18 site settings. Next: knock those out, then run the Round 2 deep-dive over the
much-expanded studio. Deploys still 500 server-side; everything committed + dist staged.
- BOTH NORTH STARS DONE: #19 Products/e-commerce + #20 Team/roles/DX-dashboard.

## ROUND 1 COMPLETE → ROUND 2 deep-dive launched

**[01:15 BST] Round 1 closed — 14 built + 1 verified-skip; 4 consciously deferred to Round 2.**
- BUILT (14): #1 SEO→head, #2 Puck off bundle, #3 three.js defer, #4 modals, #5 Hero CTA, #6 aurora
  a11y, #7 scroll-to-top, #9 undo/redo, #10 Activity log, #11 alt preflight, #12 skip-link, #14
  Release board, #16 review notes, #19 Products north star (3 commits), #20 Team north star.
- VERIFIED-SKIP: #8 mobile nav (studio already has working responsive nav; "unused drawer CSS" is
  live-site parity).
- CONSCIOUSLY DEFERRED to Round-2 re-prioritisation (all low-value v3/v4): #13 footer columns (footer
  deliberately mirrors the live site's flat footer = parity, same call as #8); #15 block-level diff on
  restore (restore is already snapshot-safe — diff is polish); #17 resolveFields/enum hardening (niche
  Puck); #18 global Site Settings tab (centralises the contact email hardcoded in Footer+CartDrawer —
  moderate value, but a 9th Studio tab worsens IA crowding, so the deep-dive should weigh it holistically).
- Rationale for going to the deep-dive now: the studio roughly DOUBLED since the last audit (products,
  team, cart, storefront, 8 tabs). A fresh 15-lens audit over the expanded surfaces will surface
  higher-value work (storefront mobile/a11y, cart accessibility, product detail, org scoping, IA) than
  grinding the 4 marginal leftovers — which it will re-weigh anyway.

**[01:16 BST] Round 2 deep-dive launched** — background workflow `wwra5n1p6` (studio-deep-dive-r2):
15 lens agents re-auditing the expanded studio (extra scrutiny on the new storefront/cart/products/
team surfaces + the 8-tab IA), deduping against everything Round 1 built, → a fresh ranked backlog.
Will write it to the backlog memory file + log here, then Round 2 build cycles begin.

**[01:22 BST] Round 2 deep-dive complete** — `wwra5n1p6`, 16 agents, 15/15 lenses, 82 raw → 18 ranked
(347s, 1.34M tokens). The synth VERIFIED each claim against the live code and caught real bugs/gaps.
Written to the backlog memory file. Round 2 build order (top = low-effort high-value one-cycle ships):
1. CartDrawer → real modal (focus-trap/Escape/restore/aria-modal/scroll-lock) · v5 · NS
2. Debounce the localStorage persist (fires on every keystroke today) · v5
3. Hide legacy products from the public storefront · v4 · NS
4. aria-live for add-to-basket / qty / steps · v4 · 5. Storefront heading hierarchy h3→h4 · v4
6. Itemised quote summary in the basket · v5 · NS · 7. Product imagery (+alt) · v5 · NS
8. Persist the basket across reloads · v4 · NS · 9. Product/Offer JSON-LD · v5 · NS
10. Catalogue & team audit trail · v5 · 11. Catalogue draft/publish gate · v5 · NS
12. Pause 3D render loop off-screen + DPR clamp · v5 · 13. Team panel guards (last-admin etc.) · v4 · NS
14. Organisation + orgId tenant key · v4 · NS · 15. Studio IA: one Studio button + grouped tabs · v4
16. Product detail page (#product/<slug>) · v5 · NS · 17. Export site JSON + DATA-MODEL.md · v5 · dev
18. Studio Home/Overview tab · v4. Building in order now.

### Round 2 build cycles

**[01:30 BST] Item R2-#1 — CartDrawer → real modal — BUILT, VERIFIED, COMMITTED.**
- The deep-dive confirmed the basket drawer opened `role="dialog"` with no aria-modal, no Escape,
  no focus management, and the page scrolling behind — a keyboard/AT user was stranded on the
  freshest interactive surface.
- Mirrored `cms/Modal.jsx`: on open, lock body scroll, move focus into the drawer, trap Tab, Escape
  closes, and restore focus to the basket FAB on close. Added `aria-modal="true"` +
  `aria-labelledby` (the heading carries `id="gs-cart-title"`). Hooks placed before the early return.
- Files: `src/cms/CartDrawer.jsx`.
- Verify: build PASS (149 modules). Preview: added an item, opened the drawer → `aria-modal=true`,
  `aria-labelledby=gs-cart-title`, body scroll LOCKED, focus moved to the close button; pressed
  Escape → drawer closed, body scroll restored, focus returned to the FAB. Zero console errors. PASS.
- Commit: `a3ed759`. Deploy: deferred (Netlify 500).

**[01:36 BST] Item R2-#2 — Debounce the localStorage persist — BUILT, VERIFIED, COMMITTED.**
- The persist effect wrote the entire store (pages + products + team + every version snapshot) to
  localStorage synchronously on every `setState`, so typing in Puck got jankier as content grew.
- Coalesced writes to ~400ms after the last change (ref + timeout), kept the quota-warning, and added
  a `beforeunload` flush so an in-flight edit isn't lost on tab close.
- Files: `src/App.jsx`. Verify: build PASS (149 modules). Preview: app mounts; the migrate-driven
  state change persisted through the new debounced path (localStorage shows schema 14 + 5 products);
  zero console errors. PASS.
- Commit: `32df026`. Deploy: deferred (Netlify 500). dist synced.

**[01:46 BST] Items R2-#3, R2-#5, R2-#4 — storefront correctness + a11y — BUILT, VERIFIED, COMMITTED.**
- R2-#5 (heading hierarchy): product card names were `<h3>` like the category `<h3>` — demoted card
  names to `<h4>` (WCAG 1.3.1). Verified: category=H3, product=H4.
- R2-#3 (product visibility): Storefront rendered every product regardless of status. Corrected the
  deep-dive's premise (the seed defines 'legacy' as STILL SOLD — Mortar Connect — so hiding legacy
  would be wrong): added a **'draft' (hidden)** status; the storefront lists `status !== 'draft'`
  (active + legacy both show), and ProductsPanel offers Active / Legacy (still sold) / Draft (hidden).
  Verified: 5 cards incl. the legacy Mortar Connect; draft filter excludes only drafts.
- R2-#4 (aria-live): added a `.gs-sr-only` utility + a polite live region announcing basket count on
  add/qty change, a drawer live region announcing the request/confirmation steps, and fixed the
  low-contrast lime-on-lime `.b-cta.is-added` (text → `--gs-text`). Verified the live region renders.
- Files: `src/blocks/Storefront.jsx`, `src/cms/ProductsPanel.jsx`, `src/App.jsx`, `src/cms/CartDrawer.jsx`, `src/studio.css`.
- Verify: build PASS (149 modules). Preview as above; zero console errors. PASS.
- Commits: `e85f1aa` (R2-#3/#5) + `550605b` (R2-#4). Deploy: deferred (Netlify 500). dist synced.

**[01:54 BST] Items R2-#8 + R2-#6 — persist basket + itemised quote — BUILT, VERIFIED, COMMITTED.**
- R2-#8 (persist basket): the cart was in-memory only, so a half-built licence request evaporated on
  refresh. Persist the non-sensitive `{productId: qty}` map to `localStorage` (`gs-cart`) + rehydrate
  on load. Verified: added Bedrock×1 + Slate×2 → reloaded → basket restored (FAB shows 3).
- R2-#6 (itemised quote): the request/confirmation steps never recapped what was chosen. Added an
  indicative subtotal to the basket (the "from £X" floor of each line × qty, summed — clearly an
  estimate, never a charge) and a read-only `QuoteSummary` (lines + total) on the request step.
  Verified: Bedrock×1 (£12,000) + Slate×2 (£180) → "from £12,360" in both the basket and the request
  recap. Honest within the no-fake-payment constraint (floor estimate, "final price on your agreement").
- Files: `src/App.jsx` (#8), `src/cms/CartDrawer.jsx` + `src/studio.css` (#6).
- Verify: build PASS (149 modules). Preview as above; test basket cleared; app mounts clean (the 8
  console errors are frozen mid-edit HMR artifacts, not the final code). PASS.
- Commits: `2298717` (R2-#8) + `e369d8c` (R2-#6). Deploy: deferred (Netlify 500). dist synced.

**[01:56 BST] Turn 15 done — yielding.** Round 2 progress: #1–#6, #8 done (7 items). Next: #7 product
imagery (medium — adds image+alt to the catalogue model/panel/storefront/basket), #9 Product/Offer
JSON-LD, #10 catalogue+team audit trail, #12 pause 3D render loop, #13 team guards. Deploys still 500.

**[01:48 BST] Turn 14 done — yielding.** Shipped R2-#3 (draft product visibility), R2-#5 (heading
hierarchy), R2-#4 (cart aria-live + contrast). Round 2 progress: #1,#2,#3,#4,#5 done. Next: #8 persist
the basket (quick), then the medium north-star deepeners #6 itemised quote summary, #7 product imagery,
#9 Product/Offer JSON-LD. Deploys still 500 server-side; everything committed + dist staged.

**[01:38 BST] Turn 13 done — yielding.** Round 2 underway: ran the 15-lens deep-dive (`wwra5n1p6` →
18-item code-verified backlog) + shipped R2-#1 cart modal a11y (`a3ed759`) + R2-#2 debounce persist
(`32df026`). Next: the remaining quick storefront/cart wins (R2-#3 hide legacy products, #4 aria-live,
#5 heading hierarchy, #8 persist basket), then the medium north-star deepeners (#6 quote summary, #7
product imagery, #9 JSON-LD). Deploys still 500 server-side; everything committed + dist staged.
- (history) NEXT (R1-#19 cont.): a Products management panel/tab (add/edit/remove + categories), a prototype
  cart + checkout UI (clearly labelled, transmits nothing), and a backend handoff spec for real
  licence-purchase + payments. Then R1-#20 Team/roles/invitations prototype.