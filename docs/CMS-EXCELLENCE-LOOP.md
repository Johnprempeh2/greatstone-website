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
     **Editorial notes** — ✅ cycle 13 (`526e4fb`).
   - _Lead remaining fresh-angle candidates (all distinct from cycles 1-13, favouring NEW families): **Content
     depth** (content-analytics — thin/skeleton-page detection over content-search's walkText; READ-ONLY +
     safe, BUT scout A proved the real seed has ZERO thin pages at any defensible threshold, so it ships
     showing only its empty state + the ServiceCatalog block inflates `services` to ~13k words [floor-only
     flags + a "bulk" note mitigate] — lower live value, build only if a content-analytics angle is wanted),
     **Bulk-safe status** (safe-actions — multi-select draft↔review on the Pages list; the studio's FIRST
     multi-select; provably reversible bidirectional metadata flips, explicitly NOT publish/approved/delete;
     scout C grounded it — strong if cycle 14 wants an action), **per-page collaboration extras** (assignee
     / review-requested flag — extends c13's collaboration family with another additive field), or a
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
     tested model + duplicatePage strips the new field; (4) reminder/advisory/aggregate badges stay OUT of
     the Studio `total` (only public-facing breakage counts); (5) WRITE features CAN be exercised live
     (set→observe→clear) — do it; read-only audits over the seed often show only the empty state (lean on
     unit tests). **Two families now open (publishing c12, collaboration c13) on top of the saturated audit
     suite — keep pivoting to NEW families / safe actions, not more read-only audits. Gotchas: avoid the
     backtick char in commit -m (zsh command-substitutes it — use git commit -F a file); and esbuild-ing
     store.js in a scout can drop an `undefined/` outdir into the repo — check git status for stray dirs.**_
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
