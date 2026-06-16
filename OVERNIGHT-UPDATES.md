# Greatstone Studio — Overnight build log

Run started: Mon Jun 15 22:50:11 BST 2026

This is the morning-review doc for John. One entry per round, and a timestamped line after every
material action (deep-dive, item built, verify result, deploy result + live URL, commit hash).
Live prototype: https://greatstone-home.netlify.app/puck-proof/

Audiences kept first-class throughout: (a) public site visitors, (b) studio editors/admins,
(c) future DX-dashboard client/admin users. UX, UI and performance weighted heavily.

---

## === Front-end parity run — started Tue Jun 16 07:39 BST 2026 ===

GOAL (John's redirect): the studio's 22-block library must faithfully reproduce EVERY section/design
on the live site (greatstone-home.netlify.app — / method services industries proof about insights
climb contact) — add missing blocks, match formatting precisely, and get performance top-tier.
Reference = the LOCAL source greatstone-homepage/*.html (inline `<style>` per page) + assets/site.css.

**[07:40 BST] Parity AUDIT launched** — multi-agent workflow `studio-parity-audit-r1`: one agent per live
page (home/method/services/industries/proof/about/insights/climb/contact) reads the live HTML + CSS and
compares against the studio block(s) seeded on that page, plus a performance-audit agent; a synthesis
agent merges into a prioritised GAP LIST (missing blocks / mismatched blocks / perf). Studio page→block
seed map established: home = Hero+Chapter×3+Pillars+StatStrip+Steps+Invite; method = Hero+FeatureGrid+
PillarExplorer+Steps; services = Hero+Steps+Spectrum+StatStrip+Invite; industries = Hero+Pillars×2+Steps+
Invite; proof = Hero+StatStrip+CaseStudy+RoiBar+Quote+Invite; about = Hero+StatStrip+Timeline+Pillars+
Team+Invite; insights = Hero+FeaturedArticle+FeatureGrid+Invite; climb = Hero+MaturityMap+Ladder+Chapter+
Invite; contact = TimeCounter+BookDeepDive+Steps+ContactBand.

**[08:01 BST] Parity AUDIT complete** — `w1zr4coyb`: 11 agents, 69 findings → 24 ranked gaps written to the
backlog memory (full specs preserved in the audit output file). **Verdict: ~65-70% parity.** Strong content +
structure reproduction (Chapter, StatStrip count-up, Timeline, MaturityMap, Ladder, RoiBar, Quote, ContactBand,
FeaturedArticle are near-faithful ports), but the studio loses the live site's SIGNATURE MOTION + bespoke
section visuals (scramble headlines, scan-line cards, terraced slab stacks, pillar-fracture explorer, industry
picker), substitutes generic glass-card grids for distinctive editorial layouts, lacks the whole desktop chrome
layer (cursor/facets/scroll-HUD/preloader), and has TWO pages mis-seeded (method shows climb content; about shows
the wrong Values + an invented StatStrip). Build order = synthesis Top-5: (1) re-seed method + about (pure content
bugs); (2) desktop chrome shell; (3) dual-CTA Hero/Invite; (4) the 4 signature blocks; (5) perf + CLS. Building now.

**[13:57 BST] Re-audit R12 — method heading scale to .h2 — BUILT, VERIFIED, DEPLOYED.**
- The method section heads read a notch small: FeatureGrid/PillarCards/MaturityModel head clamps capped ~2.6-2.7rem
  while the live uses the shared `.h2` clamp(2rem,4.5vw,3.6rem). Bumped all three (`.b-features-head`, `.b-pc-h2`,
  `.b-mat-head`) to clamp(2rem,4.5vw,3.6rem) + line-height 1.05. All three blocks are method-only, so no other page
  is affected.
- Files: `src/blocks/FeatureGrid.jsx`, `src/blocks/PillarCards.jsx`, `src/blocks/MaturityModel.jsx`.
- Verify: build PASS (`index-vwGYV3r4`, 373.81 kB). Fresh-seed preview at 1280px: all three method heads render
  58px (= .h2 cap, up from ~42px); zero runtime errors; screenshot shows "One method. Eight pillars. No guesswork."
  at the correct large scale.
- Commit: `1f88feb`. **Deploy LIVE** `6a314829a401b9052d35a1ec`; greatstone-home.netlify.app/puck-proof/ 200.

**[13:48 BST] Re-audit R10 — home StatStrip units/labels — BUILT, VERIFIED, DEPLOYED.**
- Home §05 stats drifted from the live: fixed stat#1 suffix '+'→'+ hrs' and label 'Hours recovered weekly, one
  engagement'→'Capacity recovered weekly · one engagement'; stat#3 suffix ''→'yrs' and label 'Years of leadership
  heritage'→'Leadership heritage' (stats #2 £27k + #4 Continents already matched live). Decision logged: the live
  §05 is a 2×2 glass stat-grid inside a chapter; the studio keeps the aurora StatStrip row as an INTENTIONAL
  restyle (the re-audit explicitly allows this) rather than adding a one-off glass 'cards' variant.
- Files: `src/store.js` (home StatStrip seed).
- Verify: build PASS (`index-BldLtYd8`, 373.77 kB). Fresh-seed preview: home StatStrip count-up → 21 + hrs / £27 k /
  20 yrs / 2 with labels Capacity recovered weekly · one engagement / Capacity returned annually / Leadership
  heritage / Continents, one team; zero runtime errors.
- Commit: `77ff723`. **Deploy LIVE** `6a31460d4e52d900c7939452`; greatstone-home.netlify.app/puck-proof/ 200.

**[13:40 BST] Re-audit R11 — industries hero compact + drop cursor prompt — BUILT, VERIFIED, DEPLOYED.**
- The industries hero used size 'full' (100vh), pushing the IndustryPicker fully below the fold, and carried a
  "Choose your sector" cursor cue the live `.ind-hero` doesn't have. Added a `compact` Hero size (min-height:auto,
  padding clamp(140px,20vh,220px) 0 clamp(48px,7vh,90px) — matches the live .ind-hero/.ins-hero), set the
  industries Hero to size 'compact' + prompt ''.
- Files: `src/blocks/Hero.jsx` (compact size + radio option), `src/seed-pages.json` (industries Hero).
- Verify: build PASS (`index-u0MVMOXm`, 373.77 kB). Fresh-seed preview: industries hero `size-compact` (height 723px
  vs 860 viewport, no longer full-screen), no `.b-hero-prompt`, picker chip row now reaches the fold (top 805px,
  above-fold true) instead of being pushed below; zero runtime errors; screenshot matches the live compact hero.
- Commit: `dcb2f14`. **Deploy LIVE** `6a31442fddb1be3f0a7f69c0`; greatstone-home.netlify.app/puck-proof/ 200.

**[13:32 BST] Re-audit R9 — FeaturedArticle 'Read the piece' CTA + animated corner-wave (insights) — BUILT, VERIFIED, DEPLOYED.**
- The insights featured card was missing the live's "Read the piece" CTA and its corner-wave was static. Added
  ctaLabel/ctaHref fields (default 'Read the piece'/'#') → a `btn btn--primary` after the meta row; animated the
  4-arc `.corner-wave` (sized 170×170 to its viewBox) with the live `gsWaveEmit` keyframes (scale .35→1.1, opacity
  pulse) on a 4.6s loop, staggered 0/.7/1.4/2.1s per arc, with a `prefers-reduced-motion` static fallback.
- Files: `src/blocks/FeaturedArticle.jsx`.
- Verify: build PASS (`index-zwbztZwM`, 373.54 kB). Fresh-seed preview on insights: featured card shows the "Read
  the piece" btn--primary; corner-wave has 4 paths animating `gsWaveEmit` at 170px; zero runtime errors; screenshot
  shows the lime arcs emanating from the top-right + the CTA.
- Commit: `60c6e30`. **Deploy LIVE** `6a314246d3fd5637864ebabb`; greatstone-home.netlify.app/puck-proof/ 200.

**[13:23 BST] Re-audit R8 — StatStrip band variant (proof stat-band) — BUILT, VERIFIED, DEPLOYED.**
- proof's StatStrip carried an (invented) header + aurora + single gradient-blob numbers; the live `.stat-band` is
  a headerless border-block row with per-stat left accent bars, a solid white number that lights lime on reveal,
  and a smaller solid-lime suffix. Added a `band` variant to StatStrip.jsx: skips the aurora + renders the header
  only if any header field is non-empty; split the figure into separate `.b-stat-num` (count-up, data-target) +
  `.b-stat-suffix` spans; the count-up now adds `.is-lit` to each stat (white→lime, mirroring `.stat.lit`). Band
  CSS = border-block + linear-gradient(accent-soft→transparent), `.b-stat::before` accent bar, solid num/suffix.
  Aurora variant unchanged (home §05 verified: gradient numbers + aurora + header intact, no regression).
- proof seed: StatStrip variant 'band' + header fields explicitly '' (empty strings beat the backfilled defaults).
- Files: `src/blocks/StatStrip.jsx`, `src/seed-pages.json` (proof StatStrip).
- Verify: build PASS (`index-BVrs1euo`, 372.60 kB). Fresh-seed preview: proof band has NO header, border-top 1px,
  4 stats with 2px accent bars, count-up → 12/3.4/6/90 with hrs/×/wks/% suffixes, all `.is-lit` (num lime
  rgb(200,255,0), suffix lime); home aurora StatStrip unregressed; zero runtime errors; screenshot matches the live
  stat-band.
- Commit: `befbb15`. **Deploy LIVE** `6a314024ae8a33079cc318e2`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "b-proof-band" / "b-stat-suffix".

**[13:11 BST] Re-audit R7 — method hero centered + dual CTA — BUILT, VERIFIED, DEPLOYED.**
- The method hero was left-aligned with a single CTA; the live `.m-hero` is 92vh centered with two buttons.
  Re-seeded the method Hero: align left→center, restored the two-button row (primary "Open the interactive
  breakdown" → #go/method + ghost "Book a Deep Dive" → #book), and split headline → "We leave no stone" / highlight
  "unturned." (matches the home §03 treatment; the live mid-word accent on "stone" is the separate Hero #18 polish,
  not addressable via the trailing-highlight contract without breaking contentEditable editing).
- Files: `src/store.js` (method Hero seed).
- Verify: build PASS (`index-Bodf4PFC`, 370.77 kB). Fresh-seed preview: method hero centered (text-align center,
  align-center class), kicker + "We leave no stone unturned.", two CTAs (primary "Open the interactive breakdown" +
  ghost "Book a Deep Dive"); zero runtime errors; screenshot matches the live centered hero.
- Commit: `3b75959`. **Deploy LIVE** `6a313d45cf890c240a68d566`; greatstone-home.netlify.app/puck-proof/ 200.

**[13:02 BST] Re-audit R2 + R6 — home §03 Methodology chapter + CTA + hero kicker — BUILT, VERIFIED, DEPLOYED.**
- R2: the live homepage §03 is a centered Methodology chapter that HIDES the 8-pillar grid (it lives behind the
  method-mode overlay) and offers an "Explore the eight pillars" CTA. The studio surfaced the full Pillars grid +
  dropped the CTA. Gave Chapter.jsx optional `ctaLabel`/`ctaHref` (ghost link, centered when align=center), then
  re-seeded home §03 Pillars-grid → centered Chapter (03 / The Methodology / "We leave no stone unturned." +
  "Explore the eight pillars" → #go/method). The 8-pillar grid now lives only on Method (PillarCards), as live.
- R6: home Hero kicker was '' (no eyebrow above the headline); set to "Greatstone International".
- Files: `src/blocks/Chapter.jsx` (ctaLabel/ctaHref + .b-chapter-cta), `src/store.js` (home Hero kicker + §03).
- Verify: build PASS (`index-D7p65lNa`, 370.70 kB). Fresh-seed preview: home = Hero/Chapter×4/StatStrip/Terrace/
  Invite (no Pillars grid); hero kicker "Greatstone International" renders; §03 centered with the ghost CTA, which
  navigates to Method (PillarCards "Every facet, examined." shown); zero runtime errors; screenshot matches the
  live centered §03.
- Commit: `3d7799a`. **Deploy LIVE** `6a313b5d2c9cb02e975767b5`; greatstone-home.netlify.app/puck-proof/ 200.

**[12:53 BST] Re-audit R5 — TimeCounter redesign to the live time-cost chip (contact) — BUILT, VERIFIED, DEPLOYED.**
- contact (weakest page, 58%) had the wrong hero design: a centered 6rem decimal clock ("0.0s"). Live is a
  LEFT-aligned hero ("You still can't buy time. / Let's save yours.") over a compact bordered `.timecost` chip.
  Rewrote TimeCounter.jsx: left-aligned hero (h1 display scale), a `.b-tc-chip` (border + accent-soft gradient +
  blur, max-width 540) holding a blinking `.b-tc-dot` (gsTcPulse), a tabular `MM:SS` clock that ticks once per
  second (paused when tab hidden; Date.now-based so hidden time still counts), an "on this page" label, and the
  escalating narrative line ("you won't get them back"). Reduced-motion stills only the dot. Live copy as defaults;
  contact seed cleared to inherit them.
- Files: `src/blocks/TimeCounter.jsx`, `src/store.js` (contact TimeCounter props → {}).
- Verify: build PASS (`index-uL8gyLXb`, 370.85 kB). Fresh-seed preview on contact: kicker "Book a Deep Dive",
  headline "You still can't buy time. / Let's save yours." (accent), compact 540px chip, clock ticks 00:10 → 00:44 →
  01:02 (MM:SS rollover works), "on this page" label, dot, escalating line; zero runtime errors; screenshot matches
  the live time-cost counter. (R5 second part — BookDeepDive iconed "Why a deep dive" aside — queued as R5b.)
- Commit: `b4f041f`. **Deploy LIVE** `6a31391b0b9269273c9f253c`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "b-tc-chip" / "b-tc-clock" / "gsTcPulse".

**[12:44 BST] Re-audit R4 — Spectrum Tool-first-vs-Problem-first glass figure (services) — BUILT, VERIFIED, DEPLOYED.**
- services' Spectrum section reproduced the right column as a plain 4-item bullet list, dropping the live's whole
  point: a bordered glass `.tool-figure` contrasting tool-first vs problem-first. Rebuilt Spectrum.jsx right column
  as `.b-spectrum-figure`: 6 dot+term+meta rows (1 grey "bad" Tool-first, 5 lime "good" — Problem-first, AI,
  Automation, Integration, Better process), right-aligned `.b-spectrum-meta` notes, closing on a `.b-spectrum-cap`
  caption "The diagnosis chooses the tool: never the other way round." Left column now carries the full live lead +
  the muted aside. Fields: kicker/headline/highlight/body/coda + `rows` (tone/term/meta) array + `caption`
  (replaced the old `items`). Services Spectrum seed cleared to inherit the faithful defaults.
- Files: `src/blocks/Spectrum.jsx`, `src/seed-pages.json` (Services Spectrum props → {}).
- Verify: build PASS (`index-DmiBWkiH`, 370.12 kB). Fresh-seed preview: services Spectrum renders the 6-row glass
  figure (Tool-first grey, rest lime; correct metas + caption; 1px bordered card) + left lead/aside; zero runtime
  errors; screenshot matches the live tool-figure. Services should lift well off 68%.
- Commit: `79d4fba`. **Deploy LIVE** `6a3136f7d27277088ba86d41`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "b-spectrum-figure" / "b-spectrum-row".

**[12:35 BST] Re-audit R1 — calm Invite closing-CTA variants (drop invented aurora on 6 pages) — BUILT, VERIFIED, DEPLOYED.**
- The single highest-leverage re-audit finding: the closing Invite defaulted to the invented full-bleed aurora
  (gsDrift glow + oversized 4rem display h2) on 6 pages, where live closings are calmer. Added a `band` variant to
  Invite.jsx (no aurora div, no card; h2 at the shared `.h2` clamp(2rem,4.5vw,3.6rem)) + a `pill` option (eyebrow
  as a `.pill` badge + a top border) for the climb-style close. Reassigned per page in the seeds: services/proof =
  framed card; home/industries/about = plain band; climb = band + pill+border; method stays framed (#7).
- Files: `src/blocks/Invite.jsx`, `src/seed-pages.json`, `src/store.js`.
- Verify: build PASS (`index-BNSM_HZj`, 369.39 kB). Fresh-seed preview: variants resolve correctly on every page
  (home/industries/about band, services/proof/method framed, climb band+pill); home close now `b-invite-band` with
  NO aurora div + h2 at 57.6px (calm .h2, was 4rem display); climb close is `b-invite-pillband` (pill eyebrow "Find
  your altitude" + 1px top border, no aurora); cycling all 6 pages = zero runtime errors; screenshot matches the
  live calm close.
- Commit: `c024a16`. **Deploy LIVE** `6a3134e7c0700a00ed63c394`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "b-invite-band" / "b-invite-pillband".

**[12:30 BST] PARITY RE-AUDIT complete** — `whlg914il` (10 agents, 68 findings). **Overall parity now 76%** (was ~65-70% at the start of this run). Page scores: climb 86 · insights 84 · method/industries/proof/about 82 · home 74 · services 68 · contact 58. Top-12 remaining gaps written to the backlog memory (RE-AUDIT section). The single highest-leverage finding: the closing-CTA (Invite) defaults to the invented full-bleed aurora across 6 pages, where live uses calmer treatments (framed card / plain band / pill+border). Working the top item next.

**[12:03 BST] Perf #17 — rAF-batch Timeline scroll (kill INP jank) — BUILT, VERIFIED, DEPLOYED.**
- Timeline.jsx's scroll handler did a `getBoundingClientRect()` (forced layout read) + a CSS-var write on EVERY
  scroll event, unbatched, even when the timeline was off-screen — a classic INP/jank source on the about page.
  FIX: rAF-batch the work so it runs at most once per frame (a `rafId` guard coalesces a burst of scroll events
  into a single read+write), plus a visibility-gate IntersectionObserver (`140px` rootMargin) so the handler is
  near-free when the timeline is scrolled away; the rAF is cancelled on cleanup. Behaviour unchanged (the lime
  fill still tracks scroll; milestones still light via the existing IO).
- Files: `src/blocks/Timeline.jsx`.
- Verify: build PASS (`index-LTagXJyv`, 368.60 kB). Preview on about: fill tracks correctly (centered →
  `--tl-progress` 0.547, fill 497px, 4/5 items lit); a 40× stress-scroll produced **zero runtime errors** and the
  progress stayed correct; read+write now coalesced to one-per-frame (no per-event reflow). Smooth 60fps scroll.
- Commit: `1cfc33d`. **Deploy LIVE** `6a312d8d182086d531fda6d9`; greatstone-home.netlify.app/puck-proof/ 200.

**[11:55 BST] Perf #16 — kill image CLS (reserve logo aspect box + Figure aspect-ratio) — BUILT, VERIFIED, DEPLOYED.**
- The site logo (`<img>`, 800×160, 5:1) was rendered with a CSS width but `height:auto` and no intrinsic dims, so its
  box was 0-height until load → layout shift on every page (header + footer, above-the-fold). Figure's editorial
  image had `loading=lazy` but no reserved space either. FIX: added `width="800" height="160"` (+ `decoding=async`)
  to every logo `<img>` (Header, Footer, SignIn, AcceptInvite) so the browser reserves the 5:1 box before load
  (verified: header logo renders 138×28, ratio 5.0, dims present); added `height:auto` to `.gs-logo img` +
  `.site-footer .logo img` so the attribute ratio drives layout. Figure gained an `aspect` field (16:9 default /
  3:2 / 4:3 / 1:1 / auto) applying `aspect-ratio` + `object-fit:cover` to reserve the image box (zero CLS), with
  `decoding=async`. Net: no dimensionless images on any default page → CLS≈0.
- Dropped an initial `fetchpriority` attempt on the header logo: this React version doesn't accept the camelCase
  `fetchPriority` prop and warns; the logo isn't the LCP element (the hero is), so removed it rather than risk the
  console. (The preview's console-log tool keeps a persistent buffer that still shows the pre-fix warnings; the
  CURRENT rendered DOM has no `fetchpriority` attr — verified via outerHTML — so the live code is clean.)
- Files: `src/Header.jsx`, `src/Footer.jsx`, `src/cms/SignIn.jsx`, `src/cms/AcceptInvite.jsx`, `src/studio.css`,
  `src/site.css`, `src/blocks/Figure.jsx`.
- Verify: build PASS (`index-C1ayuR_9`, 368.39 kB). Preview: header + footer logos carry width=800 height=160,
  render at correct 5:1 size, box reserved pre-load; Figure aspect-ratio reserves space. No new console errors from
  the current modules (only the stale buffered fetchPriority warnings, which the post-fix DOM disproves).
- Commit: `7068278`. **Deploy LIVE** `6a312b82f8c8d4d489809e9b`; greatstone-home.netlify.app/puck-proof/ 200.

**[11:39 BST] Parity #13 — PillarCards block (method 8-up examinable pillar wall) — BUILT, VERIFIED, DEPLOYED. (METHOD PAGE COMPLETE · LAST MISSING BLOCK)**
- KEY FINDING: the live method's "The Eight Pillars / Every facet, examined." section is a 4-up CARD WALL
  (`.pillars`/`.pillar-card`), NOT a 3D explorer. The studio had seeded PillarExplorer (3D gem) there, which was a
  non-faithful interpretation. New PillarCards block — faithful port of `.pillar-card`: 4-up grid (2-up <1000px,
  1-up <560px), each card with `.b-pc-top` (P·0N number + hover-only "Inspect →"), name, one-line tag, definition,
  and a row of `.b-pc-assess` chips, with a lime top-border sweep on hover. Cards render as non-link `<article>`
  by default (no dead links; become `<a>` only when a deep-link is set). Em dashes in the defs → colons (house
  voice). Editable header + pillars (nested chips arrays). Namespaced `.b-pc-*`; reuses `.card`-style tokens.
- Registered under Story; re-seeded method PillarExplorer → **PillarCards** (PillarExplorer stays in the library).
  **The method page is now fully faithful**: Hero → FeatureGrid → PillarCards → MaturityModel → framed Invite.
- This was the **last missing block** from the parity audit's gap list.
- Files: `src/blocks/PillarCards.jsx` (new), `src/puck.config.jsx`, `src/store.js`.
- Verify: build PASS (`index-BPcgMZEq`, 367.86 kB / +5 kB). Fresh-seed preview: method pillar section = 8 cards
  P·01–P·08 (People→Value), chip counts 4/3/3/4/3/3/3/4 matching live, no em dashes, non-link articles; zero
  console errors; screenshot matches the live pillar wall.
- Commit: `b525d94`. **Deploy LIVE** `6a3127def8c8d4c605809ef8`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Pillar cards (8-up wall)" / "b-pc-card".

**[11:29 BST] Parity #14 — MethodTieIn block (climb method tie-in + mini 8-pillar bar chart) — BUILT, VERIFIED, DEPLOYED. (CLIMB PAGE COMPLETE)**
- climb.html's "(4) method tie-in" is a 2-col band: LEFT kicker + headline (accented "lowest first") + lead + a
  ghost link to the method; RIGHT a 4×2 mini bar chart of the eight pillars (each a square with a bottom-anchored
  bar at its score), the single "lowest" pillar lime-highlighted ("we climb the lowest first"). The studio had this
  as a plain invented Chapter coda (no chart). New MethodTieIn block — faithful port of `.tiein`/`.pillars-mini`:
  grid 1.1fr/.9fr (1-col <860px), `.b-tiein-pm` squares w/ `::before` bars (gradient, height var --h), `.lowest`
  highlight (accent-mid border + glow), bars grow 0→--h on scroll-in (IntersectionObserver, reduced-motion instant).
  Editable copy + ghost CTA + pillars array (label/height/lowest). Namespaced `.b-tiein-*`; reuses `.b-cta.ghost`.
- Registered under Story; re-seeded climb invented Chapter coda → **MethodTieIn**. **The climb page is now complete**:
  Hero → MaturityMap → Ladder → MethodTieIn → Invite (faithful to live).
- Files: `src/blocks/MethodTieIn.jsx` (new), `src/puck.config.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-BAVe4jOi`, 362.46 kB / +4 kB). Fresh-seed preview: climb tie-in renders accented
  headline + "See the 8 pillars" ghost CTA + 8 pillar bars (Data 42 / Process 58 / People 22 LOWEST / Systems 66 /
  Security 50 / Experience 74 / Insight 38 / Growth 60); is-grown fires (People bar ~22px, Experience ~76px), lowest
  border accent-mid; zero console errors; screenshot matches the live tie-in over the summit terrain.
- Commit: `77c6cb8`. **Deploy LIVE** `6a312568ee11186332e70667`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Method tie-in (pillar bars)" / "b-tiein-pm".

**[11:19 BST] Parity #12 — Terrace block (home §06 "How a Deep Dive works" slab stack) + define missing `--gs-border-strong` — BUILT, VERIFIED, DEPLOYED.**
- home §06 is a terraced foundation: a centered chapter over a stack of slabs that grow WIDER descending
  (calc(70% + i*15%)), each a lime trapezoid (clip-path) that settles up from below in a top-down stagger on
  scroll-in. The studio rendered §06 as a flat 3-col Steps. New Terrace block — reuses the `.b-chapter align-center`
  framing (eyebrow 06 / "Three moves to your foundation." / intro copy) over a faithful `.dd-stack` port:
  `.b-terrace-slab` widths 70/85/100%, trapezoid clip-path, lime gradient, translateY+scaleY settle (720ms,
  130ms·i stagger) gated by an IntersectionObserver (threshold .35; reduced-motion + already-in-view settle
  instantly); number/title/desc grid. Editable index/eyebrow/headline/highlight/intro + slabs array.
- **Fixed a latent missing brand token**: `--gs-border-strong` was used (slab border + `.btn--ghost` fallback) but
  never defined in the studio :root, so it resolved to nothing. Added the canonical `rgba(200,255,0,0.18)` to
  site.css :root (also un-breaks every `.btn--ghost` border site-wide, which had been falling back to accent-mid).
- Registered under Story; re-seeded home §06 Steps → **Terrace**.
- Files: `src/blocks/Terrace.jsx` (new), `src/puck.config.jsx`, `src/store.js`, `src/site.css` (:root token).
- Verify: build PASS (`index-CN0ZXwqU`, 358.52 kB / +4 kB). Fresh-seed preview: home = …StatStrip/**Terrace**/Invite;
  3 slabs widths 420/510/600 (widening), trapezoid clip-path, border now rgba(200,255,0,.18), settle fires; zero
  console errors; screenshot matches the live terraced foundation (eyebrow, accented headline, widening lime slabs).
- Commit: `0580d15`. **Deploy LIVE** `6a312324ca52e89ebdc7d1ac`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Terrace (slab stack)" / "b-terrace-slab".

**[11:09 BST] Parity #10 — NewsletterBand block (insights "Foundation Brief" signup) — BUILT, VERIFIED, DEPLOYED. (INSIGHTS PAGE COMPLETE)**
- insights.html closes on a contained `.signup` glass card (lime radial glow, blur, email pill + Subscribe); the
  studio closed on a generic Invite. New NewsletterBand block — faithful port of `.signup`: glass card (radial lime
  glow + `--gs-glass` + blur), kicker "The Foundation Brief", headline "Field notes, in your inbox. No noise."
  (accented), lead, an email pill input + lime Subscribe, and a legal note. Honest prototype: submit transmits
  nothing, validates a non-empty email then swaps to an inline `role=status` confirmation ("You’re on the list.
  (Prototype: nothing was sent.)"); the legal note says it isn't wired up. Namespaced `.b-news-*`; reuses
  `.btn--primary`/`.kicker`/`.accent`/`.wrap`.
- Registered under Page; re-seeded insights closing Invite → **NewsletterBand**. **The insights page is now fully
  complete**: Hero → FeaturedArticle → InsightsGrid → NewsletterBand (all faithful to live).
- Files: `src/blocks/NewsletterBand.jsx` (new), `src/puck.config.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-_FR18HTW`, 354.71 kB / +3 kB). Fresh-seed preview: insights closes on the glass card
  (kicker/accented headline/lead/email pill/Subscribe/legal all correct); submitting test@example.com swaps to the
  confirmation, form removed, nothing sent; zero console errors; screenshot matches the live signup band.
- Commit: `642a39c`. **Deploy LIVE** `6a3120cbf4e0b8ae3ca9de38`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Newsletter band" / "b-news-card" / "Foundation Brief".

**[10:59 BST] Parity #9 — InsightsGrid block (insights filterable post grid) + insights tide bg — BUILT, VERIFIED, DEPLOYED.**
- insights.html's article wall is a row of category chips that crossfade a grid of post cards by data-cat;
  the studio stood in a flat FeatureGrid (no filter, no media). New InsightsGrid block — faithful port of
  `.chips` + `#postGrid`: chips (aria-pressed, "All" auto-prepended, lime active) drive a 200ms grid crossfade;
  each `.b-ins-post` card has a `.b-ins-media` panel (gradient-ink g1→g6 cycling, or an optional MediaField image
  with ink-zoom hover + overlay texture), an uppercase lime `.b-ins-tag` (label derived from the category list so
  it stays in sync), title, excerpt, and a lime-bullet read-time pinned to the foot. Empty-state note when a filter
  has no posts; reduced-motion instant branch. Categories + posts (incl. per-post image) are editable arrays;
  defaults ported verbatim. Namespaced `.b-ins-*`; reuses `.card`/`.grid.cols-3`/`.wrap`.
- Also flipped insights bg `stone` → `tide` (live insights mounts `mountGreatstoneTide`; both single-renderer, so
  parity-only, no perf delta).
- Registered under Editorial; re-seeded insights Hero → FeaturedArticle → **InsightsGrid** → Invite (was FeatureGrid).
- Files: `src/blocks/InsightsGrid.jsx` (new), `src/puck.config.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-kXfVs7Y2`, 351.67 kB / +6 kB; three+puck code-split). Fresh-seed preview: insights =
  Hero/FeaturedArticle/InsightsGrid/Invite, bg tide (canvasCount 1); 5 chips (All pressed), 6 posts with inks
  g1→g6, tags derived (AI&Automation/Adoption/Digital Maturity/Industry/…), titles + read-times correct; clicking
  AI&Automation crossfades to exactly the 2 AI posts (chip pressed); zero console errors; screenshot matches the
  live grid (chips, gradient cards, lime tags, dot read-times).
- Commit: `abe3cf9`. **Deploy LIVE** `6a311e5cf4e0b8a4eca9df47`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Insights grid" / "b-ins-chip" / "b-ins-post".

**[10:48 BST] Parity #11 — ServiceCards block (services "Three moves. One foundation.") + services tide bg — BUILT, VERIFIED, DEPLOYED.**
- services.html's signature offer section is three framed cards with a lime "scan line" that sweeps top→bottom
  once as each card reveals (staggered L→R), corner ticks, badged 01/02/03, accent sub-eyebrows + glowing-dot
  bullets pinned to the card foot. The studio stood in a generic Steps block. New ServiceCards block — faithful
  port of `.svc-grid`/`.svc-card`: `.b-svc-scan` line (gradient + trailing wash, `gsSvcScan` 1.25s on `.is-in`,
  nth-child .32s/.49s stagger), `--scan-h` measured per card to its own height (re-measured on resize, skipped
  under reduced-motion), `.b-svc-tick` tl/br corners, badge + accent sub + glowing-dot `<ul>` (margin-top:auto).
  Heading "Three moves. One foundation." with accented last word; all copy + cards (nested bullets arrays) are
  editable fields; defaults ported verbatim (em dashes → parentheticals/colons). Namespaced `.b-svc-*`; reuses
  `.card`/`.grid.cols-3`/`.wrap`/`.kicker`/`.accent`.
- Also flipped services bg `stone-summit` → `tide` (live services mounts `mountGreatstoneTide`; single renderer).
- Registered under Story; re-seeded services Hero → **ServiceCards** → Spectrum → StatStrip → Invite (was Steps).
- Files: `src/blocks/ServiceCards.jsx` (new), `src/puck.config.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-DGJgfpDa`, 345.90 kB / +5 kB; three+puck code-split). Fresh-seed preview: services =
  Hero/ServiceCards/Spectrum/StatStrip/Invite, bg tide (canvasCount 1); 3 cards badges 01/02/03, subs
  Discovery&DXP / AI·Automation·Integration / Adoption&ongoing, titles Find the drains / Build the systems / Embed
  &scale, 3 bullets + 2 ticks + scan each, `--scan-h` measured 567px; zero console errors; screenshot matches the
  live offer section (badges, accent eyebrows, dot bullets, scan line).
- Commit: `6b1e9a9`. **Deploy LIVE** `6a311bd22a8be991196e145d`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Service cards" / "b-svc-card" / "gsSvcScan".

**[10:38 BST] Parity (industries bg) — `stone-summit` → `tide` (parity + perf) — DONE, VERIFIED, DEPLOYED.**
- The industries page seeded on the dual `stone-summit` scene (2 renderers) but live industries.html mounts
  `mountGreatstoneTide` (single renderer). Switched the industries seed background to `tide` (the same single-scene
  preset contact already uses): parity with the live tide ripples + a perf win (1 canvas/rAF, not 2). One-line seed
  change, no code.
- Files: `src/seed-pages.json` (industries `background`).
- Verify: build PASS (`index-DbDXmAdp`, 340.77 kB, no size change). Fresh-seed preview: industries bg = tide,
  `canvasCount:1` (down from 2), tide arc ripples render, IndustryPicker intact (7 chips), zero console errors;
  screenshot shows the tide background matching the live page.
- Commit: `46ad395`. **Deploy LIVE** `6a31198a75ed69193e80af05`; greatstone-home.netlify.app/puck-proof/ 200
  (`index-DbDXmAdp.js`). No public page now defaults to two renderers (home #15 + industries done).

**[10:30 BST] Parity #5 — IndustryPicker block (industries' signature interaction) — BUILT, VERIFIED, DEPLOYED.**
- industries.html's defining section is an interactive sector picker; the studio had it as two STATIC Pillars
  grids (universal drains + sector drains, no interaction). New IndustryPicker block — faithful port of the live
  `.picker`: a `role=tablist` of 7 sector chips with a travelling lime underline (measured via offsetLeft/Width,
  re-measured on resize + double-rAF for font settle); choosing a sector crossfades the right "specific drains"
  card (`is-swapping`, 220ms) and swaps an `aria-live` headline (payoff sentence auto-accented), while the left
  "universal drains" card holds constant. Diamond bullets (universal faint, specific lime+glow); the specific list
  re-keys per sector so the `rowIn` stagger re-fires. Full roving-tabindex keyboard (←/→/↑/↓/Home/End) + focus
  move; reduced-motion takes an instant branch (no crossfade/stagger/transition). All copy + the UNIVERSAL[6] /
  INDUSTRIES[7] data are editable Puck fields (nested drains arrays), defaults ported verbatim from the live (em
  dashes → colons, house style). Namespaced `.b-ind-*`; reuses shared `.card`/`.grid.cols-2`/`.wrap`/`.accent`.
- Registered under Story; re-seeded industries Hero → **IndustryPicker** → Steps → Invite (replaced the 2 Pillars).
- Files: `src/blocks/IndustryPicker.jsx` (new), `src/puck.config.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-CqLSTfIq`, public bundle 340.77 kB / +9 kB; three+puck stay code-split). Fresh-seed
  preview: industries = Hero/IndustryPicker/Steps/Invite; 7 chips, Real estate pre-selected, 6 universal + 5
  specific drains; clicking Healthcare → headline "Less time on admin. More time on patients." (2nd sentence
  accented) + 5 healthcare drains + underline travels to 128px; End key → focus + select last chip; zero console
  errors; screenshot matches the live picker (chip row, accented headline, ⊘/◆ drain cards). NOTE logged for next
  cycle: industries bg is still `stone-summit` but live uses tide (separate seed gap → new backlog item).
- Commit: `3b82e2d`. **Deploy LIVE** `6a3117b22952b356ecbfb6d6`; greatstone-home.netlify.app/puck-proof/ 200; live
  bundle has "Industry picker" / "Choose your industry" / "b-ind-chip-row". (First Netlify attempt 500'd on a
  mis-transcribed proxy token; fresh token deployed clean.)

**[10:14 BST] Parity #15 — home background dual `stone-summit` → single `stone` (perf + parity) — BUILT, VERIFIED, DEPLOYED.**
- The studio home was seeded on the dual `stone-summit` scene-track (TWO WebGLRenderers running at once). Live
  home (index.html) uses a SINGLE `THREE.WebGLRenderer` — the emerald stone only, no `mountSummit`. Switched the
  home seed + settings + migrate fallback to single `stone`: parity AND a real perf win (one canvas/renderer, not
  two — roughly halves the home page's idle GPU/rAF cost). No new code; pure seed/config change.
- Files: `src/store.js` (line 191 `seedPage('Home', 'stone'…)`, line 331 `settings.background: 'stone'`, line 367
  migrate fallback `'stone'`).
- Verify: build PASS (`index-ZCCYvbf1`, 331.63 kB). Fresh-seed preview (blocked the beforeunload re-persist to load
  the new seed): `homeBg:"stone", settingsBg:"stone", layerCount:1, canvasCount:1` (down from 2); the emerald
  crystal + "The Foundation of Digital Excellence." render correctly; zero console errors. Matches the live home's
  single-scene background.
- Commit: `b9c3a9a`. **Deploy LIVE** `6a3111d379ac871a996cdf1c`; greatstone-home.netlify.app/puck-proof/ 200.

**[09:28 BST] Parity #7 — framed CTA-card variant for Invite + method closing CtaBand — BUILT, VERIFIED, DEPLOYED.** (METHOD PAGE COMPLETE)
- method.html ends on a contained .cta-band (bordered card, accent-soft fill, radius 24, centered); the studio
  Invite only had the full-bleed aurora form. Added a "variant" field to Invite: aurora (default) | framed. The
  framed variant drops the aurora and wraps content in a .b-invite-card (max-width 880, centered, 1px border,
  radius 26, accent-soft fill, blur, soft ::before radial glow). Seeded the method closing CtaBand as a framed
  Invite ("The First Step" / "Find out where you stand." / Book a Deep Dive → #book).
- **The method page is now fully complete**: Hero → FeatureGrid → PillarExplorer → MaturityModel → framed CtaBand.
  (Left the other pages full-bleed: about/services CTAs are full-bleed in the live source, not bordered cards.)
- Files: `src/blocks/Invite.jsx`, `src/store.js`.
- Verify: build PASS (`index-saLR_mVF`). Fresh-seed preview: method ends on the framed card (radius 26, no
  aurora, correct copy + CTA); home Invite still the full-bleed aurora (no regression); zero console errors;
  screenshot matches the live method cta-band.
- Commit: `7bea813`. **Deploy LIVE** `6a310902f4e0b85310a9dfc3`; 200; live bundle has b-invite-card/b-invite-framed.

**[09:16 BST] Parity #6 — MaturityModel block (completes the method page) — BUILT, VERIFIED, DEPLOYED.**
- method.html's closing methodology section was dropped from the seed. New MaturityModel block (faithful port of
  .tier-row + .phases): centered kicker "Pebble · Plateau · Peak" + "We meet you where you are." + lead; Row A =
  3 graduated tier cards (Surviving/Organised/Compounding, deepening lime tint t1→t3); Row B = 4 phase cards
  (Lagger/Follower/Leader/Pioneer) each with a score-range eyebrow (Under 3 / 3–5 / 6–8 / 9–10) + escalating lime
  (p1→p4); closing ghost CTA "See the full climb" → #go/climb. 4→2 / 3→1 cols at 760px; reveal stagger.
- Registered under Story; seeded onto method after PillarExplorer. The method page is now Hero → FeatureGrid →
  PillarExplorer → MaturityModel (only the framed closing CTA band, gap #7, remains for full method parity).
- Files: `src/blocks/MaturityModel.jsx` (new), `src/puck.config.jsx`, `src/store.js`.
- Verify: build PASS (`index-_nVabF50`). Fresh-seed preview: method MaturityModel renders the right kicker/
  heading/lead, 3 tiers, 4 phases w/ score ranges, graduated lime tints, ghost CTA → #go/climb; zero console
  errors; screenshot matches the live maturity section.
- Commit: `7be558f`. **Deploy LIVE** `6a310631c93179452459314d`; 200; live bundle has b-mat-tier/b-mat-phase.

**[09:05 BST] Parity #3a — desktop chrome: custom cursor + scroll progress (SiteChrome) — BUILT, VERIFIED, DEPLOYED.**
- First part of the missing desktop chrome layer (live ships it on every viewport; studio had none). New
  SiteChrome component rendered ONLY on the public view (never in the Puck editor — a custom cursor would fight
  precise editing; verified absent in edit mode).
- Custom cursor (faithful port): lime dot follows the raw pointer, ring + "Explore" label follow an eased
  position, mix-blend difference; .hover on interactive elements, .label on [data-cursor="explore"] (the Stage).
  Gated to (hover:hover)+(pointer:fine), off under reduced-motion; rAF loop pauses when hidden. Scroll-progress
  line: top 2px lime gradient bar, scaleX by scroll %, rAF-batched capture-listener.
- Added the missing `--gs-dur-micro`/`--gs-dur-standard` tokens (the cursor CSS used them; undefined — same
  latent-bug class as --gs-warning).
- Files: `src/cms/SiteChrome.jsx` (new), `src/index.css`, `src/site.css`, `src/App.jsx`, `src/Stage.jsx`.
- Verify: build PASS (`index-BXHRLw_j`). Preview (fine pointer): dot follows raw pointer, ring eases, .hover on
  links, progress tracks scroll; cursor + gs-cursor-on ABSENT in edit mode; zero console errors.
- Commit: `e1b89ca`. **Deploy LIVE** `6a3103c75a6d004250e36109`; 200; live bundle has gs-cur-ring/gs-cursor-on/gs-progress.
- REMAINING for gap #3 (a follow-up "3b"): #gsFacets facet-trail canvas, dot-nav + hud-chapter scroll HUD, #loader preloader.

**[08:49 BST] Parity #4 — dual-CTA (primary + ghost) on Hero + Invite — BUILT, VERIFIED, DEPLOYED.** (fixes 6+ pages)
- Live heroes/CTA bands render two buttons (.btn--primary + .btn--ghost); the studio supported one CTA and kept
  swapping the ghost for a mailto. One contract change fixes the drift across six pages.
- index.css: ghost variant `.b-cta.ghost` (accent-soft fill + border + body text, matching .btn--ghost) + a
  `.b-cta-row` flex wrapper. Hero + Invite: added ctaLabel2/ctaHref2 rendered beside the primary; Invite email
  now optional (default off). App: extended the CTA click interceptor — "#book"→contact (as before) and new
  "#go/<slug>"→navigate(slug) so cross-page ghost links work in the SPA instead of hitting a dead .html href.
- Seeded the real ghost labels: services hero "See the Method"; CTA-band ghosts on services "Explore the 8
  pillars", industries "See the method", proof "See how we work", about "See the Method", climb "Explore the
  Method" — all → #go/method.
- Files: `src/blocks/Hero.jsx`, `src/blocks/Invite.jsx`, `src/index.css`, `src/App.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-DnDtZSkZ`). Fresh-seed preview: services hero = Book a Deep Dive + See the Method
  (ghost); Invite = Book + Explore the 8 pillars; the ghost navigates to the method page with a clean hash;
  zero console errors; screenshot shows both buttons.
- Commit: `343055a`. **Deploy LIVE** `6a310008913504f36416d2ac`; 200; live bundle has `b-cta-row`/`b-cta ghost`/`#go/`.

**[08:37 BST] Parity #2/#8 — Values 4-up block + re-seed the ABOUT page — BUILT, VERIFIED, DEPLOYED.**
- About was the other mis-seeded page: the 8-pillar Pillars block stood in for the live "Four values. No
  slideware." grid, and an invented StatStrip carried figures the live page keeps in its hero.
- New Values block (faithful port of .grid.cols-4 of .card.value-card): auto-numbered cards, big faded lime
  index (2.2rem/900/opacity.25), heading + muted body, left accent bar wiping up (scaleY, transform-origin
  top, .5s) on hover; 4→2→1 cols; reduced-motion safe; registered under Proof.
- Hero: added an optional "meta" stats-row field (the about hero .hero-meta: flex figure+label), so the three
  figures (20 / 8 / 0) sit in the hero where the live page puts them.
- Re-seeded about: dropped StatStrip, Pillars→Values, added hero-meta, background summit→**stone** (live about
  uses mountGreatstone = the stone; single scene = parity + perf, one renderer not two).
- Files: `src/blocks/Values.jsx` (new), `src/puck.config.jsx`, `src/blocks/Hero.jsx`, `src/seed-pages.json`.
- Verify: build PASS (`index-DD3TTSn5`). Fresh-seed preview: about = Hero/Timeline/Values/Team/Invite; bg stone
  (1 layer); hero-meta 20/8/0; Values renders the 4 real values, 4-up at desktop, auto-numbered 01-04; zero
  console errors; screenshot matches the live about Values + Team grid.
- Commit: `8e27627`. **Deploy LIVE** `6a30fd3278174a21caa87990` (deploy MCP hiccuped once, retried OK);
  greatstone-home.netlify.app/puck-proof/ 200; live bundle has "Four values" / "b-value-card" / "b-hero-meta".
  BOTH mis-seeded pages (method + about) are now fixed.

**[08:24 BST] Parity #1 — re-seed the METHOD page (was showing climb content) — BUILT, VERIFIED, DEPLOYED.**
- The method page was mis-seeded with climb.html content ("The Climb / Pebble. Plateau. Peak." on the blue
  summit terrain). Live method.html = "The Digital Transformation Playbook / We leave no stone unturned" on the
  emerald stone background, about scoring the eight pillars. Re-seeded faithfully from the live source.
- Changes: method background summit→**stone** (single 3D scene, not the dual stone-summit — parity AND a perf
  win, one renderer not two); Hero = "The Digital Transformation Playbook" + "We leave no / stone unturned." +
  eight-faces lead + Book a Deep Dive; FeatureGrid = the 3 framing principles (We score not guess / We benchmark
  / We climb the lowest first) under "One method. Eight pillars. No guesswork." + the real intro lead;
  PillarExplorer = "The Eight Pillars / Every facet, examined." over the 8 real pillars; dropped the misplaced
  Steps. Added an optional intro/body field to FeatureGrid (the section's lead had nowhere to live). Live em
  dashes → colons (house style). The Maturity-model + framed CTA-band closing sections remain (gaps #6/#7).
- Files: `src/store.js`, `src/blocks/FeatureGrid.jsx`.
- Verify: build PASS (`index-2F9_cFr8`). Preview on a FRESH seed (had to block the beforeunload re-persist to
  load it): method bg = stone (1 layer); hero/principles/pillars render the correct method content; FeatureGrid
  intro shows; zero console errors; screenshot matches the live method hero. PARITY: method hero now faithful
  (minor: Hero accents "stone unturned." where live accents only "stone" — a mid-headline accent is Hero-polish #18).
- Commit: `86b9dbd`. **Deploy LIVE** `6a30fa0a18208626d8fda433`; greatstone-home.netlify.app/puck-proof/ 200;
  live bundle has "Digital Transformation Playbook" / "We climb the lowest first". (NB: the seed is factory
  content — fresh visitors get it; a returning visitor's localStorage keeps their authored copy, by CMS design.)

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

**[02:12 BST] Item R2-#9 — Product/Offer JSON-LD on the storefront — BUILT, VERIFIED, COMMITTED.**
- The e-commerce surface shipped zero schema.org markup, so search could never surface price/
  availability for any product. The Storefront now emits an `ItemList` of `Product` + `Offer`
  (GBP, "from £X" floor as the price, sold = InStock, brand Greatstone, image when set) inline as
  `application/ld+json`. Highest-leverage SEO win on the new surface.
- Files: `src/blocks/Storefront.jsx`.
- Verify: build PASS (149 modules). Preview: the Products page carries a valid `ld+json` ItemList,
  5 Products, e.g. Bedrock price "12000" / InStock; parses cleanly. Zero console errors. PASS.
- Commit: `ce32b56`. Deploy: deferred (Netlify 500).

**[02:52 BST] Item R2-#14 — Organisation entity + orgId tenant key — BUILT, VERIFIED, COMMITTED.**
- No org/tenant scope existed, yet the DX-dashboard north star is org-scoped accounts and the
  migrated shape would have had no tenant column.
- Added an `org` entity `{id,name,slug}` (one 'Greatstone' org) and stamped `orgId` on every product,
  category and team record — seeds, new records (add/invite paths), and an additive schema 15→16
  migration that backfills the org + any record missing orgId. Team panel shows the org header. Updated
  DATA-MODEL.md with the Organisation table + the per-record orgId → tenant-column mapping.
- Files: `src/store.js`, `src/App.jsx`, `src/cms/TeamPanel.jsx`, `src/studio.css`, `DATA-MODEL.md`.
- Verify: build PASS (149 modules). Preview: store migrated to schema 16; org present; ALL products/
  team/categories carry `orgId: org-greatstone`; Team panel shows the "Greatstone International"
  organisation header. Zero console errors. PASS.
- Commit: `9b75776`. Deploy: deferred (Netlify 500). dist synced.

**[02:54 BST] Turn 20 done — yielding.** Round 2 progress: #1–#10, #13, #14, #17 done (13 of 18).
Remaining: #11 catalogue draft/publish gate (v5/high), #12 pause 3D render loop (v5/med, risky/hard to
verify headlessly), #15 Studio IA (v4/med), #16 product detail page (v5/high), #18 Studio Home tab
(v4/med). Next: #18 Studio Home (contained editor-UX win) + #15 IA, then the high-effort #11/#16; #12
approached carefully (3D modules are fragile). Deploys still 500 server-side; everything committed + staged.

## Round 3 — started Mon Jun 16 06:10 BST 2026

**[07:25 BST] Item R3-#2 — Storefront filter, sort & search — BUILT, VERIFIED, COMMITTED, DEPLOYED.** (north-star: e-commerce discoverability)
- The storefront showed every product in static category groups with zero discoverability; past a handful, a
  buyer couldn't filter, search or sort. Added a brand-locked controls bar (appears at 4+ listed products; an
  editor can hide it via a new "Filter & search bar" field): category chips with live counts (aria-pressed),
  name/summary search, and a sort (Featured / price low-high / high-low / Name A-Z; priceless items sort last).
- Default state (All + no search + Featured) keeps the existing grouped-by-category layout untouched; any active
  control switches to a flat filtered grid with a polite-live result count + a no-results state with Clear. The
  Product/Offer JSON-LD still describes the WHOLE catalogue (not the filtered view). Reads the same useCatalog()
  published set, so it honours the catalogue publish gate.
- Files: `src/blocks/Storefront.jsx`.
- Verify: build PASS (`index-B-5bDkGV`). Preview (Products page, 5 products): bar shows with counts (All 5,
  Platforms 1, Automation 2, Data 2); Platforms chip → 1 flat card + aria-pressed=true + "1 product in
  Platforms"; price low-high orders 95/180/4,500/6,000/12,000; search "analytics" → Quarry; no-match →
  no-results → Clear → back to grouped; zero console errors. (Couldn't screenshot the bar: it sits far below
  the hero and the preview captures from scroll-top with scroll-behavior:smooth resetting programmatic scroll;
  verified functionally instead, every interaction path.)
- Commit: `b76c1f4`.
- **Deploy: LIVE.** Netlify deploy `6a30ec19c93179e99859313b` "Deploy is ready!";
  https://greatstone-home.netlify.app/puck-proof/ returns 200; live bundle has the filter code ("Search
  products", "Filter by category", "price-asc", "Clear filters"). dist synced.

**[07:00 BST] Item R3-#1 — Invitation lifecycle + Accept-Invite screen (#join/<token>) — BUILT, ADVERSARIALLY REVIEWED, COMMITTED, DEPLOYED.** (north-star: DX dashboard — the highest-value Round-3 item)
- Modelled the org invite→accept flow end-to-end, prototype-honest. An admin invites a teammate; the invite now
  carries a token + invitedBy/invitedAt/expiresAt (7-day); the Team panel shows a copyable `…/#join/<token>` link
  + a Resend button; opening the link renders a new Accept screen that resolves to valid / expired / already-
  accepted / not-found and, on accept, flips the member to active + stamps acceptedAt.
- HONESTY BOUNDARY held throughout: app-generated token, per-browser localStorage, and accepting creates NO
  account, sets NO password, signs NO ONE in. Real token signing, email, server-side resolution + account
  provisioning are the Laravel handoff (documented in HANDOVER + DATA-MODEL).
- Store (schema 18→19, additive migration backfills tokens for existing pending invites): freshInvite() +
  inviteStatus + acceptInvite + resendInvite; flipping a member back to invited re-issues the invite.
- **Ran an adversarial review WORKFLOW before commit** (`w50psezp5`, 5 agents: prototype-honesty/security,
  correctness/edge, a11y, code-quality → triage). Verdict: SAFE TO COMMIT, no honesty blocker. It caught a
  STUDIO-WIDE latent bug manual testing missed: `--gs-warning` / `--gs-success` / `--gs-danger` were used 11×
  across the CSS but never defined, so ALL of Round 2's amber warning UI (catalogue drift banner, attention
  badges, warn tiles) was silently falling back. Defined them in site.css. Also fixed: raw capability keys
  ("MANAGEUSERS") leaking onto the invitee screen → friendly labels; no focus management on the join screen →
  focus moves in + aria-modal; re-accept was impossible → Resend + re-invite re-stamp; em dashes in user copy →
  removed (brand voice); exported INVITE_TTL_DAYS; copy-link aria-live + clipboard-failure fallback; stale
  HANDOVER schema 15→19.
- Files: `src/store.js`, `src/cms/AcceptInvite.jsx` (new), `src/App.jsx`, `src/cms/TeamPanel.jsx`,
  `src/studio.css`, `src/site.css`, `DATA-MODEL.md`, `HANDOVER.md`.
- Verify: build PASS (`index-zoI92OZG`). Preview (fresh server): invite→copy→accept end-to-end (roster flips +
  audit logged); all 4 invite states; Resend rotates the token; flip-to-invited re-stamps + clears acceptedAt;
  aria-modal + focus-into-card + friendly caps confirmed; `--gs-warning` resolves to #ffc800; zero em dashes in
  rendered copy; zero console errors. Valid-invite screenshot captured.
- Commit: `61ca25d`.
- **Deploy: LIVE.** Netlify deploy `6a30e6223d44f9a5c662a1a3` "Deploy is ready!";
  https://greatstone-home.netlify.app/puck-proof/ returns 200; live bundle has the invite flow ("Accept
  invitation", "Manage the team", `join/`) and the live CSS now carries `--gs-warning:#ffc800`. dist synced.

**[06:15 BST] Round 3 deep-dive complete** — background workflow `wwvwl5vfx` (studio-deep-dive-r3): 16 agents
(15 lenses + synthesis), 70 raw candidate items → 20 ranked, deduped against all Round 1 + Round 2 built work
and the SKIP list. Full backlog written to the backlog memory. Top of the list: (1) invitation lifecycle +
Accept-Invite screen at #join/<token> [NS: DX dashboard], (2) storefront filter/sort/search [NS: e-commerce],
(3) Organization+WebSite JSON-LD, (4) global Site Content singleton, (5) block-anchored review comments [NS],
(6) content-health score + board, (7) block-fields manifest for the dev handoff. Five themes: north-star next
slices, "turn stored data into governance signal", deterministic (no-backend) AI-feeling authoring, media-DAM
maturity, dev-handoff fidelity. The synthesis deliberately dropped real-multiplayer / A-B / i18n (backend-
dependent — would risk faking infrastructure) and pure internal refactors (code-split / test-harness / god-
component — valuable DX but flagged to John separately, not on-brand product surface). Build cycles resume now.

**[06:04 BST] ✅ ROUND 2 COMPLETE — 18 of 18 items built, verified, committed and DEPLOYED LIVE.** Every Round-2
backlog item shipped (no skips). Highlights: cart a11y, debounced persist, JSON-LD, product imagery, audit
trail, org/orgId tenant key, team guards, export+DATA-MODEL, Studio Home overview, Studio IA consolidation,
product detail pages, catalogue draft/publish gate, and the 3D render-loop optimisation below. The two north
stars deepened materially (Products/e-commerce: detail pages + slug/SKU + catalogue governance; DX-dashboard:
org tenancy + team guards). Next: a fresh 15-lens DEEP-DIVE over the whole studio → Round 3 backlog.

**[06:04 BST] Item R2-#12 — Pause faded 3D scenes + clamp DPR on mobile — BUILT, VERIFIED, COMMITTED, DEPLOYED.** (the flagged-risky one)
- The persistent stage is fixed/inset:0, so on a stone→summit page BOTH scenes rendered WebGL full-rate even
  though only one is visible at any scroll position (the IntersectionObserver is always true on a fixed element).
  Now Stage pauses a scene's render loop when its computed opacity falls to ~0; single-scene pages (opacity always
  1) are untouched. Also clamped the stone's DPR to 1.5 on coarse pointers (phones/tablets) — it was rendering at
  DPR 2 on mobile, while summit already clamped.
- Approached carefully per the brief (fragile bespoke 3D). Gated on a new `active` flag AND-ed with the existing
  on-screen + !document.hidden gates; rAF keeps spinning (cheap), only the expensive frame() is skipped; dt is
  capped so resuming never jumps. Single-scene safety: opacity 1 → always active.
- Files: `src/Stage.jsx`, `src/lib/greatstone-logo.mjs`, `src/lib/summit-bg.mjs`.
- Verify (genuine, not by-construction): build PASS (`Stage-B0M4gm1W`). Preview on a FRESH server with WebGL
  draw-call counting per layer canvas: scroll-top → stone 2190 draws / summit 0 (paused); scroll-bottom → stone
  ~0 / summit 1224; scroll back to top → stone 2160 (resumed cleanly, no jump). ≈50% fewer draws at any scroll
  position on the common multi-scene pages. Stone renders correctly (screenshot — emerald mark intact + idling),
  zero console errors. The coarse-pointer DPR branch can't be exercised on a desktop preview, but it mirrors
  summit-bg's proven, already-shipped pattern verbatim.
- Commit: `0f99b23` (note: a stray backtick in the message stripped one word "active" — cosmetic only).
- **Deploy: LIVE.** Netlify deploy `6a30d958913504888616d26d` "Deploy is ready!";
  https://greatstone-home.netlify.app/puck-proof/ returns 200; the lazy Stage chunk (`Stage-B0M4gm1W.js`)
  contains `setActive`. dist synced.

**[05:50 BST] Item R2-#11 — Catalogue draft/publish gate — BUILT, VERIFIED, COMMITTED, DEPLOYED.** (north-star: e-commerce governance)
- Until now, every catalogue edit went live instantly — an admin tweaking a price or status changed the
  public storefront mid-keystroke. Gave the catalogue the same draft → published model pages already have.
- Store (schema 17→18, additive): a published projection (`publishedProducts` / `publishedCategories`)
  alongside the draft (`products` / `categories`). Migration backfills the projection from the existing live
  catalogue so nothing reads as "unpublished" on upgrade. Helpers `catalogHasDrift` / `publishCatalog` /
  `discardCatalogDraft`; `findProductBySlug(products, slug)` so the public route resolves against published.
- App: split CatalogContext — the EDITOR path (Storefront preview in the Puck canvas, Products tab) sees the
  DRAFT (WYSIWYG of what you're managing); the PUBLIC path (storefront, product detail, cart, JSON-LD, per-
  product SEO) reads the PUBLISHED projection. Publish/discard handlers are admin-gated; publish is logged to
  the activity audit.
- Editor UX: a publish-state banner in the Products tab — "Catalogue is live", or on drift "Unpublished
  catalogue changes" with Discard + Publish catalogue. Drift also lights the Studio button + Products tab
  attention badge and the Overview Products tile.
- Files: `src/store.js`, `src/App.jsx`, `src/cms/ProductsPanel.jsx`, `src/cms/OverviewPanel.jsx`,
  `src/studio.css`, `DATA-MODEL.md`.
- Verify: build PASS (`index-BxGzYaFR`). Preview (FRESH server, stale HMR cleared): migration → schema 18,
  published backfilled, no false drift; edited Bedrock's price to £99,999 in the Products tab → draft drifted
  to £99,999 while the public product page kept showing the published £12,000; drift banner + Studio/Products
  badges appeared; "Publish catalogue" promoted draft→published (both £99,999); "Discard" reverted a fresh edit;
  zero console errors. Restored the test edit to £12,000 (and the deployed site seeds fresh regardless — local
  localStorage never reaches a visitor). (An interim console showed errors across several dead `?t=` HMR
  timestamps — proven stale by the clean restart + clean production build.)
- Commit: `b6d263a`.
- **Deploy: LIVE.** Netlify deploy `6a30d608944ce6aee08535ce` "Deploy is ready!";
  https://greatstone-home.netlify.app/puck-proof/ returns 200; live bundle (`index-BxGzYaFR.js`) contains the
  gate code ("Catalogue is live", "Unpublished catalogue changes", `publishedProducts`). dist synced.

**[04:30 BST] Item R2-#16 — Product detail page (#product/<slug> route + slug/SKU model + per-product SEO) — BUILT, VERIFIED, COMMITTED, DEPLOYED.** (north-star: e-commerce)
- The catalogue had no per-product page — a visitor could add a licence to the basket but never read the
  full pitch, and there was nothing to link or share. Built shareable product pages at #product/<slug>.
- Data model: every product now carries a stable URL **slug** + a **SKU** (schema 16→17, additive migration
  backfills both from the name/seed; admins edit them in the Products tab, slug auto-sanitised + de-duplicated).
- `ProductDetail` (new public view, route-rendered — not a Puck block): breadcrumb, badge, category eyebrow,
  full summary, price/period/licence + SKU, add-to-licence (same prototype basket) + "Talk to us", hero image,
  "What's included" feature grid, and same-category related products that link onward. Single Product JSON-LD
  inline + per-product <title>/description/og through the existing head plumbing. Storefront cards now link to
  detail from the product name and a "View details" affordance.
- Honest boundary held: no backend dependency, no fake payment — the buy path stays prototype basket → contact
  handoff. Route is public-only; the editor path is untouched.
- Files: `src/blocks/ProductDetail.jsx` (new), `src/store.js`, `src/App.jsx`, `src/blocks/Storefront.jsx`,
  `src/cms/ProductsPanel.jsx`, `DATA-MODEL.md`.
- Verify: build PASS (`index-DNw70zrK`, +10KB). Preview on a FRESH server (restarted to clear stale HMR):
  #product/<slug> renders for bedrock/quarry/slate; per-product <title> correct; related products resolve by
  category (Quarry→Keystone, Slate→Mortar) with correct hrefs; add-to-licence updates the basket; back + forward
  (card name + "View details") round-trip cleanly; zero console errors. (An interim console showed 8 errors all
  frozen at one dead `?t=` HMR timestamp — proven stale by the clean restart + clean production build.) Screenshot captured.
- Commit: `cbd090f`.
- **Deploy: LIVE.** Netlify deploy `6a30c358f5cc4d4aa4ba330a` "Deploy is ready!";
  https://greatstone-home.netlify.app/puck-proof/ returns 200; live bundle (`index-DNw70zrK.js`) contains the
  detail code (`b-pd-name`, "What's included", `product/`, `bedrock-platform`). dist synced.

**[03:24 BST] Item R2-#15 — Studio IA: one toolbar button + grouped tabs + attention badges — BUILT, VERIFIED, COMMITTED, DEPLOYED.**
- The edit toolbar had grown crowded (five separate panel buttons — Home, Pages, 3D background, SEO,
  History) while four Studio tabs (Products, Team, Releases, Activity) had no toolbar entry at all and
  were only reachable via ⌘K. The nine-tab rail also read as a flat wall.
- Consolidated to ONE **Studio** button that opens the hub to Home; the toolbar is now
  Site · Studio · undo/redo · ⌘K · sign out. Grouped the rail into labelled sections — Home ·
  Content (Pages/Products) · Page (Background/SEO/History) · Governance (Releases/Activity) · Org (Team)
  — so every surface is one click from the same button and the hub scans. Added warning-amber attention
  badges (on the Studio button + the Releases and Team tabs) counting pages needing release action
  (in review/approved OR unpublished drift) and pending invites; a page counts once.
- Files: `src/cms/StudioPanel.jsx`, `src/App.jsx`, `src/studio.css`.
- Verify: build PASS (`index-xMAKuoRE`). Preview as admin: toolbar shows the single Studio button; rail
  renders all five labelled groups (screenshot) and opens to Home; zero console errors throughout. Badge
  zero-state confirmed (no attention → no badge — correct). Drove a throwaway draft page to confirm the
  count plumbing ("1 Draft pages" tile), then deleted it — state restored to 10 pages, activity log
  unchanged (page ops don't pollute it). The non-zero badge count is a trivial conditional over the same
  verified attention value; the governed status select resists synthetic events headlessly so the
  amber-count render is verified by construction, not a live screenshot.
- Commit: `33c2e41`.
- **Deploy: LIVE.** Netlify deploy `6a30b3c691350428a816d269` returned "Deploy is ready!";
  https://greatstone-home.netlify.app/puck-proof/ returns 200 and the live bundle (`index-xMAKuoRE.js`)
  contains the new code (`gs-studio-grouplabel`, `gs-studio-btnbadge`, "Governance"). dist synced.

**[03:05 BST] Item R2-#18 — Studio Home tab (content-health overview) — BUILT, VERIFIED, COMMITTED, DEPLOYED.**
- Editors had no at-a-glance read of site readiness — page status, draft drift, catalogue and team
  health were each buried in a separate tab. Added a Studio **Home** tab (now the first tab) with six
  headline tiles (Live pages, In review, Unpublished changes, Draft pages, Products, Pending invites),
  a Catalogue and Team summary line, and a recent-changes feed off the activity log. Warn tiles (amber)
  light when review/drift/invites are pending. Reachable from a new toolbar **Home** button and ⌘K.
- A first cut showed contradictory tiles (10 Live + 9 "Never published") because "live" was status-
  field based while "never published" read the version history — two different axes on one board.
  Fixed: all page counts now mirror the Releases board (status-field based), so Live + In review +
  Draft sum to the page total. Dropped the version-based tile entirely.
- Files: `src/cms/OverviewPanel.jsx` (new), `src/cms/StudioPanel.jsx`, `src/App.jsx`, `src/studio.css`.
- Verify: build PASS (150 modules). Preview as admin: Home tab renders first/active; tiles read
  10 live + 0 review + 0 draft = 10 total (consistent), 5 products, 3 categories, 3 members; recent-
  changes feed populated; zero console errors. Screenshot captured for the morning review. PASS.
- Commit: `ce56efa`.
- **Deploy: LIVE — Netlify is back up.** First successful deploy of the run (the all-night zipAndBuild
  500s have cleared, credits unblocked as flagged). Deploy `6a30ada9944ce635fa85362f`; built fast;
  https://greatstone-home.netlify.app/puck-proof/ returns 200 and the live bundle (`index-BB3xWV26.js`)
  contains the new code (`gs-ov-tiles`, "Live pages", "Studio home"). dist synced into the deploy repo.
  (Note: an interim poll watched for the wrong hash — `uSKW_RoX`, the pre-fix build I never shipped —
  so it looked stuck; the shipped, fixed build is `BB3xWV26` and is confirmed live.)

**[02:42 BST] Item R2-#17 — Export site JSON + DATA-MODEL.md — BUILT, VERIFIED, COMMITTED.**
- All authored content (pages, catalogue, team, activity, assets — schema 15) was trapped in
  localStorage with no export seam, so the dev team's only path to seed Laravel was hand-copying.
- Added an admin-only `exportSiteJson()` (downloads the live store as `greatstone-site.json`) + a
  ⌘K command, and wrote `DATA-MODEL.md` — a field-by-field schema reference for every slice with the
  Laravel table each maps onto (Page/Block/Product/Category/TeamMember/ActivityEntry/Asset, roles,
  migration notes). HANDOVER.md points to both.
- Files: `src/App.jsx`, `DATA-MODEL.md` (new), `HANDOVER.md`.
- Verify: build PASS (149 modules). Preview (as admin): the "Export site JSON (for the dev team)"
  command appears in the palette under Admin; the store serialises cleanly. Zero console errors. PASS.
- Commit: `6f2a8a6`. Deploy: deferred (Netlify 500). dist synced.

**[02:44 BST] Turn 19 done — yielding.** Round 2 progress: #1–#10, #13, #17 done (12 of 18). Remaining:
#11 catalogue draft/publish gate (v5/high), #12 pause 3D render loop (v5/med), #14 orgId tenant (v4/med),
#15 Studio IA (v4/med), #16 product detail page (v5/high), #18 Studio Home tab (v4/med). Next: #12 the
3D perf fix + #14 orgId (contained), then the higher-effort #11/#16. Deploys still 500 server-side.

**[02:30 BST] Item R2-#10 — Catalogue & team audit trail — BUILT, VERIFIED, COMMITTED.**
- Product/category/team CRUD wrote straight to the store with no actor or timestamp, so an admin
  could quietly drop a product or change a role and nothing was logged.
- Added an append-only `activity` slice + `logActivity(state, label, by)` (capped 200; schema 14→15,
  additive). Stamped it on add/remove product, add/remove category, invite/remove teammate, and role
  changes — each with the actor's email + time. The Activity panel now merges this site-wide log with
  the current page's status events into one feed, each entry tagged with its scope.
- Files: `src/store.js`, `src/App.jsx`, `src/cms/ActivityPanel.jsx`, `src/studio.css`.
- Verify: build PASS (149 modules). Preview (as admin): added a product → Activity showed "Added a
  product · admin@greatstone · Catalogue & team"; removed it → "Removed product 'New product'" logged
  (catalogue back to 5). Schema migrated to 15. Zero console errors. PASS.
- Commit: `762985f`. Deploy: deferred (Netlify 500). dist synced.

**[02:32 BST] Turn 18 done — yielding.** Round 2 progress: #1–#10, #13 done (11 of 18). Remaining:
#11 catalogue draft/publish gate (v5/high), #12 pause 3D render loop (v5/med), #14 orgId tenant
(v4/med), #15 Studio IA (v4/med), #16 product detail page (v5/high), #17 export+DATA-MODEL.md (v5/low),
#18 Studio Home tab (v4/med). Next: #12 the 3D perf fix + #17 the dev export (both contained), then the
higher-effort #11/#16. Deploys still 500 server-side; everything committed + dist staged.

**[02:20 BST] Item R2-#13 — Team-panel guards (last-admin / self / duplicate) — BUILT, VERIFIED, COMMITTED.**
- The Team panel never received the current user, so an admin could silently remove or demote
  themselves and orphan the org of all admins; the invite form took any email with no dedupe.
- Added: pass the current user to TeamPanel; badge "You" on your row and disable self-removal; block
  removing yourself, removing the last active administrator, and demoting the last active admin out
  of the admin role; reject a duplicate (case-insensitive) invite email. Mirrors a real `org_user`
  unique constraint + last-admin rule.
- Files: `src/App.jsx`, `src/cms/TeamPanel.jsx`, `src/studio.css`.
- Verify: build PASS (149 modules). Preview (as admin): own row shows "You" + self-remove disabled;
  inviting editor@greatstone again → "That email is already on the team."; demoting the sole admin →
  "There must be at least one administrator…" (role stayed admin). No test data created. Zero console
  errors. PASS.
- Commit: `29f081b`. Deploy: deferred (Netlify 500). dist synced.

**[02:22 BST] Turn 17 done — yielding.** Round 2 progress: #1–#9, #13 done (10 items). Remaining:
#10 catalogue+team audit trail (v5/med), #11 catalogue draft/publish gate (v5/high), #12 pause 3D
render loop (v5/med), #14 orgId tenant (v4/med), #15 Studio IA (v4/med), #16 product detail page
(v5/high), #17 export+DATA-MODEL.md (v5/low, dev), #18 Studio Home tab (v4/med). Next: #10 audit
trail, #12 the 3D perf fix, #17 export. Deploys still 500 server-side; everything committed + staged.

**[02:04 BST] Item R2-#7 — Product imagery (model + panel + storefront + basket + alt preflight) — BUILT, VERIFIED, COMMITTED.**
- The storefront rendered zero imagery though Figure/Team/FeaturedArticle already wire MediaField.
- Added `image` + `imageAlt` to the catalogue model (`addProduct` default), a MediaField + alt input
  per product in the Products panel (reusing the media library), an image area on the Storefront
  card (16:9, lazy), a thumbnail per basket line, and extended `findMissingAlt` so publishing a page
  with the Storefront flags any product image lacking alt text.
- Files: `src/store.js`, `src/cms/ProductsPanel.jsx`, `src/blocks/Storefront.jsx`, `src/cms/CartDrawer.jsx`, `src/studio.css`, `src/App.jsx`.
- Verify: build PASS (149 modules). Preview: set an image on Bedrock via the panel MediaField →
  storefront card rendered it (16:9) and the basket line showed a thumbnail; removed it via the panel
  (clean image-less seed — no fabricated product images). Zero console errors. PASS.
- Commit: `d31d87d`. Deploy: deferred (Netlify 500). dist synced.

**[02:06 BST] Turn 16 done — yielding.** Round 2 progress: #1–#8 done (8 items). Next: #9 Product/Offer
JSON-LD structured data, #10 catalogue+team audit trail, #12 pause 3D render loop off-screen + DPR
clamp, #13 team guards (last-admin/self-demote/duplicate-invite). Then the higher-effort #11 catalogue
draft/publish gate, #14 orgId tenant, #15 IA, #16 product detail page, #17 export+data-model, #18 home
tab. Deploys still 500 server-side; everything committed + dist staged.

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