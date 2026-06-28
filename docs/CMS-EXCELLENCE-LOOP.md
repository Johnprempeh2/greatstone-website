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
| 10 | Asset governance | **Media usage** — read-only library audit: UNTRACKED page images (used but not in the library), MISSING ALT (known image field, blank alt — standing version of findMissingAlt), UNUSED library images (nothing references them, with reclaimable data-URI bytes). Key-gated image walker + per-page seo.ogImage + non-draft products; thumbnails, Open deep-links, three sorted sections; badge = untracked+missingAlt (errors:0, OUT of total) + ⌘K. Section id `mediausage`. Delete-unused action PARKED for cycle 11 (read-only this cycle) | `71770a1` | NON-REDUNDANT: content-search's walkText explicitly SKIPS image keys; a11y-check excludes alt; findMissingAlt is publish-only + Storefront-gated + page-scoped; link-audit walks link targets never image URLs. First asset lens — unused/untracked/where-used has no prior home |

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
   - _Lead remaining fresh-angle candidates (all distinct from cycles 1-10): **Delete-unused-media action**
     (cycle-10's natural follow-up — a per-row "Delete" on the Unused list routing through the existing
     reversible-in-effect removeAsset + its confirm at App.jsx:748; the only WRITE candidate that's safe
     because removeAsset just drops a library row, not page content — still, gate it behind a confirm and
     ship as its own small cycle), **Reading-time / content insight** per page (read-only content-analytics
     — words + est. read time + block count + thin-content flag; reuses content-search's walkText/stripMarks;
     the runner-up scout B grounded fully), **Scheduled Publish** in the SAFE "due-to-publish" framing only
     (a publishAt intent field + a read-only "due/overdue" lane in ReleaseBoard; the auto-flip timer is
     half-baked + an autonomous write — keep OUT, hand the cron to Laravel), or an **internal-link graph /
     site-map view** (page→page adjacency + in/out-degree; fresher but a good interactive render is harder
     to land at excellence). DEAD/PARKED (verified): orphan-page finder (link-audit's "orphan" already IS an
     orphan PAGE); content freshness/staleness (NO per-page edit timestamp — savedAt React-only, version ts
     publish-only); "what's unpublished" dashboard (ReleaseBoard already does it); bulk page actions
     (removePage hard-deletes page + its versions[] — irreversible, PARK FOR JOHN). Avoid Page Health
     (overlaps findMissingAlt + link + copy + a11y + SEO + nav + media). Process notes: (1) the
     SCOUT→spec→adversarial-review workflow is the strongest shape — cycles 9-10 used it to settle
     redundancy + kill dead candidates BEFORE coding (cycle 10: media beat reading-time on real-drift; the
     review caught the wrong clone-base); keep it over strict-JSON; (2) NEW admin section ids must be
     LETTERS-ONLY (admin route regex [a-z]+); (3) reuse adjacent primitives + cite them so audits never
     drift/double-report (c10 mirrors findMissingAlt's curated-alt rules + reuses nothing of content-search's
     walker since it SKIPS image keys — wrote a parallel key-gated walker); (4) advisory/error-only badges
     stay OUT of the Studio `total` — only genuine public-facing breakage counts (media errors:0 by design);
     (5) the live seed has an EMPTY media library + no page image URLs, so audits over assets render their
     clean state live — lean on the unit tests + a localStorage-inject probe (note: the app re-seeds on
     reload, so injected probe data won't persist; the unit suite is the proof)._
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
