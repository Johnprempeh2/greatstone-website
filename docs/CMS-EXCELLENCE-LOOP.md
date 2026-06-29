# CMS Excellence Loop

A recurring (~10 min) loop that critically finds and ships ONE genuinely new, non-redundant,
high-value editor/admin feature per cycle, each cycle from a different angle, consistently raising
the bar. Started 2026-06-28. Cron job `bc49b0a0` (session-only, 7-day expiry).

## The cycle (every fire)
1. Read this doc — pick a FRESH angle not yet covered; never duplicate an existing feature.
2. Ultracode: a Workflow of multiple agents explores different use cases/personas, surfaces +
   scores candidates grounded in the real code (no redundancy with what exists).
3. Build the top non-redundant, shippable-to-excellence pick properly (great UX, WCAG-AA, real
   empty/error/loading states, responsive; pure logic → .mjs + unit tests).
4. Verify: `npm run build` clean + `npm test` green + preview 0 new console errors.
5. Scoped `git add <only my files>` + pathspec commit (NEVER `git add -A`; shared repo). NO DEPLOY
   (John tests locally first; deploy is ASK-FIRST).
6. Update this doc: angle covered, feature shipped + commit, redundancy check, refreshed shortlist.

## Guardrails
TEST/sandbox keys only · no secrets · only write within greatstone-puck-proof · park
big/irreversible (migrations, infra, RLS go-live, auth, payments) for John, never autonomously ·
leave `.claude/launch.json` + the deleted `src/blocks/ProductDetail.jsx` WIP untouched.

## Existing CMS capabilities (redundancy baseline — do NOT re-build these)
Pages CRUD (create/edit/delete/duplicate/reorder/rename/slug) · Puck block editor with inline
edit + a large block set · Media library (image pick/upload) · 3D background editor · **Editable
navigation builder** (this session) · **Per-block link picker** resolveLink/LinkField (this
session) · SEO & social (per-page meta, OG/social card, sitemap, robots) · Releases (draft→publish)
· Version history · Activity log · ⌘K command palette · Catalogue (products/categories) · Pricing &
discounts · FX · SKU bulk import · Customer accounts · Orders · Quotes/POs/Invoices · Stripe (test)
· Staff auth + roles · Analytics foundation (GTM dormant) · domain-portability layer.

## Angles covered
- **Cycle 1 — Content integrity (site admin + dev + QA).** Link/reference integrity across the
  structured page references the nav builder + link picker created.
- **Cycle 2 — Rollback safety / publishing confidence.** Make version-restore informed (show exactly
  what changes) instead of blind. Completes the editorial-governance spine (draft → publish → version).
- **Cycle 3 — Editor findability.** Full-text search across all page prose (the ⌘K palette only matched
  page/command names) so editors can find where a phrase lives and jump to it.
- **Cycle 4 — Ops governance (routing table).** Manage the redirect table renames write + the #go
  self-heal consumes: view/add/repoint/remove, with cycle-safe validation. Completes the redirects story.
- **Cycle 5 — Editor velocity / content reuse.** Save a configured block as a named preset and insert
  a fresh-id copy into any page. Panel-driven (no Puck-selection seam); insert is a pure store append.
- **Cycle 6 — Content quality / on-brand voice.** Check every page's prose against the Greatstone house
  voice (banned filler, em-dashes, "not just X it's Y", metaphor clichés, "whilst") with suggestions.
- **Cycle 7 — Accessibility quality.** Content a11y pre-flight beyond alt text: vague link text (2.4.4)
  + H1 structure (missing/duplicate/empty main heading, 2.4.6/1.3.1) with WCAG refs + suggestions.
- **Cycle 8 — SEO / discoverability quality.** Site-wide SEO Health scorecard: every page's meta audited
  together for presence + length (SeoPanel's own 40–60 / 110–158 thresholds) + cross-page DUPLICATE
  titles/descriptions, with a Fix deep-link into the per-page SEO editor.
- **Cycle 9 — Navigation integrity.** The menu's OWN health (vs Link health's link targets): a menu item
  pointing at an unpublished page (public header silently drops it), a dead custom link, an empty dropdown,
  or a published page in no menu at all. The publish-status-blind gap link-audit leaves open.
- **Cycle 10 — Asset governance.** The first media lens: unused library images (crowd the localStorage
  quota), untracked page images (used but not in the library), and missing alt — a key-gated image walker
  over the keys content-search deliberately SKIPS, so genuinely new ground.
- **Cycle 11 — Holistic synthesis.** The capstone roll-up: ONE quality score (0-100 / A-F) across all six
  audits, worst-first per-dimension breakdown + deep-links. Pure synthesis of the reports App already
  computes; the one aggregate cycles 1-10 deliberately skipped.
- **Cycle 12 — Publishing / scheduling (NEW family, first safe write).** An additive, reversible
  page.publishAt intent field + a read-only Scheduled/Overdue surface. NOTHING auto-publishes — go-live
  stays the manual gated publish(); publishAt is a reminder, not an actor. First non-audit capability.
- **Cycle 13 — Collaboration (editorial notes).** An additive, reversible page.note ({text,by,ts}) an
  editor pins to a page for the team + a panel to set/clear/list them. A reminder, never a publish gate;
  fills the gap statusHistory (machine transitions) leaves — no human-authored standing intent existed.
- **Cycle 14 — Safe-actions (bulk status).** The studio's FIRST multi-select: select pages on the Pages
  list, flip status in one gesture — restricted by a hard allowlist to the reversible draft↔review edges.
  Structurally can NEVER bulk-publish/approve/delete. First batch interaction.
- **Cycle 15 — Content-analytics (content inventory).** A read-only, SORTABLE table of every page's word
  count / read time / block count / words-per-block + thin/skeleton/bulk flags. The first quantitative
  content-VOLUME lens; an always-populated dashboard, not a defect audit.
- **Cycle 16 — Enablement (getting-started guide).** A read-only first-run setup checklist that derives each
  task's done-ness from real state ("changed from the Greatstone default", not merely filled) + deep-links to
  the fixing tool + a studio map. Manager-gated. The first orientation/enablement surface.
- **Cycle 17 — Authoring (page templates).** A static, curated set of named page recipes (Landing/Article/
  Service/Proof) seeded into a brand-new draft via a Templates gallery. The first feature to touch the
  create-a-page moment (cycles 1-16 all act on pages that already exist).
- **Cycle 18 — Composition analytics (block usage).** A read-only, sortable table mapping each registered
  block TYPE → the pages that use it, with instance counts + an UNUSED-component list. A new content-analytics
  axis (which components, where) orthogonal to cycle 15's word-volume; spans every page.
- **Cycle 19 — Bulk page metadata (safe-actions + collaboration).** The c14 multi-select bar grows from
  status-only to a three-verb bulk-metadata bar — set ONE publish date / note / assignee across the selection
  + reversible clears — and introduces a net-new collaboration field (page.assignee, a directed owner). The
  freshest non-redundant multi-page write; additive + fully reversible.

## Features shipped (this loop)
| Cycle | Angle | Feature | Commit | Redundancy check |
|---|---|---|---|---|
| 1 | Content integrity | **Link health** — site-wide link integrity auditor (broken / recoverable / dead-CTA / orphan), redirect-aware #go self-heal + publish-time warning | `af616fb` | NON-REDUNDANT: publish preflight was alt-text only; nothing audited link targets; the redirect table was written by setSlug and read by nothing |
| 2 | Rollback safety | **Version Compare** — semantic diff before restore (per-row vs draft + compare-any-two), reorder-aware (keys on props.id), change-count folded into the restore confirm | `35d42e4` | NON-REDUNDANT: VersionHistory restored blind (generic confirm); no diff/compare utility existed anywhere |
| 3 | Editor findability | **Content Search** — read-only full-text search across all page prose + titles, grouped by page with highlighted snippets + Open deep-link; ⌘K command | `a738d2f` | NON-REDUNDANT: the ⌘K palette only matches page/command labels, never block prop text; nothing searched content |
| 4 | Ops governance | **Redirects Manager** — view/add/repoint/remove the slug-rename forwarding table, cycle-safe validation, Active/Dead-end/Shadowed status; ⌘K command | `dd50000` | NON-REDUNDANT: state.redirects was written by setSlug + read by the #go self-heal, but no surface let an editor see or manage it |
| 5 | Editor velocity | **Saved Sections** — save a configured block as a named preset, insert a fresh-id copy into any page (panel-driven block browser + pure store append); ⌘K command | `97ba202` | NON-REDUNDANT: duplicatePage is whole-page; "Add block" inserts a config default; nothing saved/reused a single configured block |
| 6 | Content quality | **Copy Coach** — read-only house-voice checker over all page prose (banned filler, em-dashes [hard], not-just tic, metaphor clichés, whilst), grouped by page with snippet + suggestion + Open deep-link; rail badge (hard only) + ⌘K command | `46b0fa3` | NON-REDUNDANT: SeoPanel meters meta length only; nothing checked copy quality/voice. Reuses content-search's walker (exported walkText/isSearchableText/buildSnippet) so no drift |
| 7 | Accessibility quality | **A11y pre-flight** — read-only content-a11y checker (vague link text 2.4.4 on standalone CTAs; missing/duplicate/empty H1 via grounded Hero+TimeCounter detection), grouped by page with WCAG ref + suggestion + Open deep-link; rail badge (errors only) + ⌘K. Section id `access` (route #admin/access — the admin regex is [a-z]+, rejects digits) | `56acaae` | NON-REDUNDANT: findMissingAlt is image-alt-at-publish only; Copy Coach is voice; Link health is targets — nothing checked link-text quality or heading structure |
| 8 | SEO / discoverability | **SEO Health scorecard** — read-only site-wide meta audit: presence + length (SeoPanel's own 40–60/110–158 thresholds, cited so audit & editor never contradict) + the standout cross-page DUPLICATE title/description check, grouped worst-first with a Fix deep-link that opens the SEO editor on that page; rail badge (errors only) + ⌘K. Section id `seohealth` | `62d0e4c` | NON-REDUNDANT: SeoPanel is the per-page meta EDITOR + length meter; a11y owns H1; nothing audited meta site-wide or detected duplicates. Reuses SeoPanel's exact thresholds; no schema bump, no new CSS |
| 9 | Navigation integrity | **Navigation health** — read-only audit of the header MENU's completeness: navToDraft (error — visible menu item → unpublished page the public header drops), deadCustomLink (error — type:'link' href empty/# or #go to a missing page), emptyGroup (warn — dead dropdown), missingFromNav (warn — published page in no menu). Grouped by page/menu, Error/Warning pill, Fix deep-link into the Navigation editor; rail badge errors-only + ⌘K. Section id `navcheck` | `1c9b637` | NON-REDUNDANT: link-audit's "orphan" is already an orphan PAGE (reachability) + it walks link targets; classifyPageSlug is publish-status-BLIND (any existing page = ok) and never inspects custom-link hrefs — so nav→draft + dead custom hrefs + empty groups are all uncaught. navToMissing dropped (link-audit owns broken/recoverable nav targets). Reuses resolveRedirect/linkPageSlug/hasLink |
| 10 | Asset governance | **Media usage** — read-only library audit: UNTRACKED page images (used but not in the library), MISSING ALT (known image field, blank alt — standing version of findMissingAlt), UNUSED library images (nothing references them, with reclaimable data-URI bytes). Key-gated image walker + per-page seo.ogImage + non-draft products; thumbnails, Open deep-links, three sorted sections; badge = untracked+missingAlt (errors:0, OUT of total) + ⌘K. Section id `mediausage`. Delete-unused action PARKED (read-only this cycle) | `71770a1` | NON-REDUNDANT: content-search's walkText explicitly SKIPS image keys; a11y-check excludes alt; findMissingAlt is publish-only + Storefront-gated + page-scoped; link-audit walks link targets never image URLs. First asset lens — unused/untracked/where-used has no prior home |
| 11 | Holistic synthesis | **Site health** — ONE quality score (100 − 3·errors − 1·warnings, clamped; grade A-F) rolling up all six audits (links, copy, a11y, SEO, nav, media), with a worst-first per-dimension breakdown + Open deep-link into each. Pure `computeHealth(reports)` consuming the already-memoised reports (no re-walk/re-audit/writes); transparent scoring (no per-dimension weights, no magic thresholds, hand-reconstructable). Score block + dimension list + Error/Warning/OK pills; badge = roll-up error count, OUT of total (would double-count). Section id `sitehealth`, first under Overview | `cb11c4e` | NON-REDUNDANT: OverviewPanel imports ZERO audits (page-status/catalogue/team/activity only); the rail badges are siloed per-dimension counts with no score + no cross-dimension ranking. Adds a synthesised score + worst-first list nothing else provides. orphans EXCLUDED from links→warnings (owned by navcheck — avoids double-count) |
| 12 | Publishing / scheduling | **Publish schedule** — set an optional, additive, REVERSIBLE page.publishAt date on any page; a read-only Scheduled/Overdue surface (overdue = embargo passed AND not already live & current, reusing the drift idea so a spent embargo on a live page reads 'none'). Pure schedule-model.mjs (12 tests; `now` always a param, never Date.now): classifySchedule/listSchedules/describeDue/setSchedule/clearSchedule. Per-page datetime-local set-control + Clear, text+colour pills; badge = overdue count, OUT of total. NOTHING auto-publishes — go-live stays the manual gated publish(). +1 line: duplicatePage strips publishAt. Section id `schedule` | `010f6a8` | NON-REDUNDANT: first NON-AUDIT family. ReleaseBoard's axis is status/drift; this is time/intent (no scheduling existed anywhere — grep clean). Version history is post-hoc; publishAt is forward-looking. Additive field, no SCHEMA bump, no migrate change, publish()/setStatus untouched (write-safe) |
| 13 | Collaboration | **Editorial notes** — pin an additive, reversible page.note ({text,by,ts}) to any page for the team; a panel listing every page with an inline note textarea + Save/Clear + Note/None pill + author & relative age. Pure notes-model.mjs (10 tests; `now`/`by`/`ts` injected, never Date.now): pageNote/setNote/clearNote/listNotes/describeNoteAge (blank text routes to clear; absent/blank → null, never throws). +1 line: duplicatePage strips note. Badge = annotated-page count, OUT of total. A reminder, NEVER a publish gate; publish() untouched. Section id `notes` | `526e4fb` | NON-REDUNDANT: first COLLABORATION feature. statusHistory records machine transitions (with a transition `note`), activity log is system events — neither lets a human author STANDING intent on a page. No top-level page.note existed (grep clean). Additive, no SCHEMA bump, fully reversible (write-safe) |
| 14 | Safe-actions | **Bulk-safe status** — the studio's FIRST multi-select, folded into the Pages list: per-row checkbox + tri-state select-all (respects the active filter) + an action-bar that offers the ONE applicable Send-to-review / Send-back-to-draft button (or none on a mixed selection). Pure bulk-status.mjs (10 tests, store-free): SAFE_STATUSES/SAFE_EDGES allowlist, canBulk/bulkSetStatus/bulkActions; mirrors setStatus's {from,to,by,ts} entry, touches ONLY status+statusHistory. canEdit-gated; flash count computed off the state snapshot (not inside the updater). New CSS gs-page-select/selectall/bulkbar | `99c4279` | NON-REDUNDANT: first MULTI-SELECT in the studio. setStatus is single-page + full graph + notes; this is list-level, two reversible edges only. Structurally CANNOT bulk-publish/approve/delete (allowlist narrower than canTransition — verified vs the live TRANSITIONS graph). No store change, no new admin section (folds in), reversible (write-safe) |
| 15 | Content-analytics | **Content inventory** — a read-only, SORTABLE table: per page word count / est. read time / block count / words-per-block / status + advisory THIN (words<120) / SKELETON (4+ blocks, <25 words/block) / BULK (one of ≥2 blocks >70% of a ≥120-word page) chips + a site summary. Pure content-stats.mjs (12 tests, STORE-FREE, reuses content-search's walkText/stripMarks so counts == search's index): analyzeContent → {rows, summary}; floor-only flags + exported thresholds. WCAG-AA sortable native <table> (aria-sort, <th scope=col>, focusable sort buttons, sr-only caption); reuses is-changed/is-orphan pills (no new pill). Badge = thin count, OUT of total. Section id `inventory` | `a4a0f25` | NON-REDUNDANT: first content-VOLUME measure. PagesPanel shows block COUNT not words; ReleaseBoard is status; Copy Coach is voice; SEO is meta-length not body; Site health rolls up DEFECTS. The only `readTime` in the tree is an editor-TYPED card string, not a metric. Always-populated dashboard framing (not an empty defect audit). Read-only |
| 16 | Enablement | **Getting started** — a read-only first-run setup guide (first in the Content rail): a % meter + a checklist deriving each task's done-ness from real state, with a "Set up" deep-link per unfinished task + a studio map. Pure onboarding-model.mjs (8 tests, STORE-FREE): deriveChecklist(state, opts) → {items, doneCount, total, pct, allDone}; `done` for branded fields = CHANGED FROM the injected Greatstone default (DEFAULT_SETTINGS ships them pre-filled, so non-empty would falsely read 100%). Clones SiteHealthPanel; manager-gated (most tasks are Site settings = need:'manage'); badgeless, OUT of total. Section id `gettingstarted` | `3c02e4d` | NON-REDUNDANT: first ENABLEMENT/orientation surface. OverviewPanel shows live-work counts (published/drift/invites/activity) — no notion of "unconfigured"; Site health (c11) scores content DEFECTS, never reads settings/nav/published-count. Disjoint quadrant. Read-only, no schema bump |
| 17 | Authoring | **Page templates / starters** — a Templates gallery (cards: label/blurb/block-type chips) that seeds a brand-NEW draft from a curated recipe (Blank/Landing/Article/Service/Proof) + opens it in the editor. Pure templates-model.mjs (5 tests, STORE-FREE, imports only sections-model): a frozen STARTERS array of REAL puck.config block types + buildStarterContent(starter, mintId) (remapIds per block; the test pins types vs a 37-entry MODULES copy so a typo can't ship a dead block). ONE store fn addPageFromStarter (near-clone of addPageTo; draft, published=null, deletable); addPageTo/blk/seedPage unchanged. Section id `templates` | `a0a5155` | NON-REDUNDANT: first AUTHORING/create-a-page feature. Saved sections inserts ONE block; duplicatePage clones a LIVE page (needs an exemplar + carries its copy/SEO); a starter is a page recipe with ZERO exemplar. Static-in-code (no schema bump, no user-saved templates), creates a reversible draft (write-safe) |
| 18 | Composition analytics | **Block usage** — a read-only, SORTABLE table of every registered block TYPE: instances, page count, the pages that use it (deep-links), category, + an Unused chip & "Never placed" callout. Pure block-usage-model.mjs (10 tests, STORE-FREE): analyzeBlocks(state, knownTypes, categories) → {rows, extras, summary}; seeds every known type at 0 so unused surface; knownTypes = Object.keys(config.components) injected by App. Walks the UNION of order + Object.keys(pages) so the off-order `products`/Storefront isn't a false "unused". WCAG-AA sortable table (clone of ContentInventoryPanel). Badge = unused count, OUT of total. Section id `blocks` | `8f0dfa4` | NON-REDUNDANT: first block-type→pages map. Content inventory (c15) counts WORDS not types (its only type touch is maxBlockType for the BULK flag); PagesPanel shows a block COUNT; link-audit orphans are PAGES not component types. Read-only |
| 19 | Safe-actions + collaboration | **Bulk page metadata** — the c14 multi-select bar (PagesPanel) extended from status-only to a three-verb metadata bar: Set date (datetime-local → bulkSetSchedule), Add note…, Assign… (both via the focus-trapping ask() modal → bulkSetNote / bulkSetAssignee), + reversible Clear dates / Clear notes / Unassign. Two pure STORE-FREE models: bulk-meta.mjs (10 tests) folds the c12/c13/c19 per-slug helpers across a selection → {state, count} (same-ref on 0, ghost-skip, NaN-ts no-op), + assignee-model.mjs (8 tests) — page.assignee={who,by,ts}, a clone of notes-model. Reuses the c14 selection state + ghost-drop useEffect AS-IS; 6 App *Mut handlers mirror bulkStatusMut. No new route/panel | `2008559` | NON-REDUNDANT: c14 mutates ONLY status+statusHistory (status-only by construction); c12 schedule / c13 note are SINGLE-page; bulk metadata-SET is net-new. assignee is a brand-new field (grep: zero prior hits) + a new persona (the editorial manager). Additive + REVERSIBLE (every set has a clear; publishAt never triggers go-live) |

## Parked shortlist (next cycles — refreshed each run)
Ranked by the cycle-1 discovery workflow (8 agents, 6 personas). Pick a fresh angle each cycle;
re-validate redundancy against the current code before building.

1. **Redirects Manager** *(S, admin/ops)* — surface + edit the now-consumed `state.redirects` table
   (view, add, remove, repoint). The #go self-heal already reads it; this gives it a UI. NON-REDUNDANT.
2. **Scheduled Publish** *(M, publishing)* — a `publishAt` embargo time + a client timer that flips the
   page live; reuses publish() + version snapshot. NON-REDUNDANT (status machine is instantaneous only).
   Caveat: a client timer only fires while a studio tab is open — note that honestly.
3. **Saved Sections** *(M, content editor)* — a saved-block presets library: save a configured block,
   insert a copy elsewhere. Reuses duplicatePage's rid remap + MediaLibraryPanel layout. NON-REDUNDANT
   (duplicatePage is whole-page; no single-block reuse exists). Needs a `state.sections` key + Puck insert.
4. ~~**Version Compare**~~ — ✅ SHIPPED cycle 2 (`35d42e4`). **In-studio Content Search** — ✅ SHIPPED
   cycle 3 (`a738d2f`).
   - **Redirects Manager** — ✅ SHIPPED cycle 4 (`dd50000`).
   - **Saved Sections** — ✅ cycle 5 (`97ba202`). **Copy Coach** — ✅ cycle 6 (`46b0fa3`). **A11y
     pre-flight** — ✅ cycle 7 (`56acaae`). **SEO Health scorecard** — ✅ cycle 8 (`62d0e4c`).
     **Navigation health** — ✅ cycle 9 (`1c9b637`). **Media usage** — ✅ cycle 10 (`71770a1`).
     **Site health** — ✅ cycle 11 (`cb11c4e`). **Publish schedule** — ✅ cycle 12 (`010f6a8`).
     **Editorial notes** — ✅ cycle 13 (`526e4fb`). **Bulk-safe status** — ✅ cycle 14 (`99c4279`).
     **Content inventory** — ✅ cycle 15 (`a4a0f25`). **Getting started** — ✅ cycle 16 (`3c02e4d`).
     **Page templates** — ✅ cycle 17 (`a0a5155`). **Block usage** — ✅ cycle 18 (`8f0dfa4`).
     **Bulk page metadata (schedule + note + assignee)** — ✅ cycle 19 (`2008559`).
   - _Lead remaining fresh-angle candidates (all distinct from cycles 1-19): **Assignee / "my work" collaboration
     panel** — a read-only surface over the NEW page.assignee field (c19): listAssignees() already exists; an
     "Assigned to <me>" / "Review requested" filter on PagesPanel + an admin panel + optional rail badge. (It's
     a VIEW so empty-on-seed until pages are assigned — best paired with seeding a couple of demo assignments,
     or shipped as a PagesPanel filter rather than a standalone panel.) A **review-requested boolean** extending
     the same assignee model (a lighter "needs a look" flag, distinct from a named owner). A **keyboard-shortcuts /
     power-user reference** (enablement; thin but valid as a small add). DEAD/PARKED (verified): backlinks report
     (REJECTED cycle 19 — redundant with nav-coverage's missingFromNav + OUT_OF_NAV=['contact','products'], and
     degenerate on the seed: 8/9 pages flat at inbound=1, the only flag is the already-excluded contact; revisit
     only if the seed gains real page-to-page body links). ~~**Page templates**~~ (✅ c17), ~~**Content depth**~~
     (✅ c15), ~~**Block usage**~~ (✅ c18), ~~**Bulk schedule/note**~~ (✅ c19, folded assignee in), or a
     **One-click "add untracked image to library"** on c10's untracked list via addAsset (additive+reversible
     safe action). DEAD/PARKED (verified): orphan finder (link-audit owns it); freshness/staleness (no
     per-page edit timestamp); "what's unpublished" (ReleaseBoard does it); DELETE-unused-media (removeAsset
     loses the sole copy of an uploaded data-URI + NO store-level undo — irreversible hard-delete, AND already
     half-built in MediaLibraryPanel; PARK FOR JOHN); bulk DELETE / removePage (irreversible, PARK); auto-
     publish timer (autonomous+tab-bound — Laravel job, OUT). Avoid Page Health (overlaps the whole audit
     suite). Process notes: (1) SCOUT→spec→adversarial-review is the strongest shape — used every cycle 9-13
     to settle redundancy + safety BEFORE coding (c13: scouts proved no page.note exists + the seed ships
     clean; review caught a stale test-count + a false "mirrors SchedulePanel" claim); keep it over
     strict-JSON; (2) NEW admin section ids LETTERS-ONLY (regex [a-z]+); (3) WRITE features: additive (no
     SCHEMA bump — absent reads as a safe default), reversible (clear fully removes), NEVER autonomous-
     irreversible (no go-live, no hard-delete that loses the only copy of data) — c12/c13 set/clear via a
     tested model + duplicatePage strips the new field; for BULK/ACTION features use a hard ALLOWLIST
     narrower than what the model technically permits, so the dangerous ops are STRUCTURALLY impossible
     (c14 SAFE_STATUSES, not a runtime check, vs the wider TRANSITIONS); (4) reminder/advisory/aggregate
     badges stay OUT of the Studio `total`; (5) WRITE features CAN be exercised live (set→observe→clear) —
     do it; read-only audits over the seed often show only the empty state (lean on unit tests); (6) a new
     pure .mjs must be STORE-FREE (store.js imports puck.config.jsx → bare node --test can't load it; inline
     the constant + a drift-guard comment instead of importing). **SEVEN families now open (audit c1-11, publishing
     c12, collaboration c13, safe-actions c14, content-analytics c15, enablement c16, authoring c17) — keep
     deepening these / safe actions, NOT more read-only DEFECT audits. The single-page surfaces are getting
     well-covered; favour features that span MULTIPLE pages or the create/compose moment. (7) WEIGH "empty on seed" HARD before picking: a feature
     that renders only its empty state on the seed is low-value (c16's timeline candidate died on this — the
     seed ships versions:[] so it had no publish history to plot); features that derive from populated
     state.data/settings/nav always have something to show. (8) For a deep-link checklist, gate the panel on
     the role that can actually REACH the linked tools (c16 → canManageUsers, since most setup is Site
     settings/need:'manage') so no task dead-ends on a lock screen. Gotchas: no backtick in commit -m (zsh
     substitutes it — use git commit -F a file); esbuild-ing/bundling store.js or content-search in a scout
     drops stray build artifacts in the repo root (an `undefined/` outdir, `_p3.css`/`_probe_tmp.css` chunks)
     — ALWAYS check git status for untracked junk before + after the scoped commit and rm it.**_
   - _Note: the strict-JSON-schema workflows hit the StructuredOutput retry cap twice (cycles 2–3); cycle
     3 switched to a text-output spec+review workflow which worked cleanly — prefer that shape going forward._
5. **Reusable Content Snippets** *(M, dev)* — synced saved blocks (a Snippet block + context). v2 of
   Saved Sections; the synced-render path is fiddly — ship Saved Sections first.
6. **Page Health Panel** *(M, quality)* — only its genuinely-new rules (single-h1, heading-order); the
   alt/meta/dead-link rules overlap findMissingAlt, SeoPanel + this cycle's audit. Fold in, don't dup.
7. **Named CTA tracking / per-page CTA inventory** *(S, growth)* — value deferred until GTM goes live.
8. **Global Find & Replace** *(M, content/ops)* — real gap, but bulk-mutating block props is the riskiest
   candidate; defer until safer wins land.
9. **On-Brand Copy Coach** *(S, quality)* — banned-phrase/readability hints (operationalises
   greatstone-voice); advisory-only, needs a host surface. Nice-to-have later.
