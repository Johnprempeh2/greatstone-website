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

## Features shipped (this loop)
| Cycle | Angle | Feature | Commit | Redundancy check |
|---|---|---|---|---|
| 1 | Content integrity | **Link health** — site-wide link integrity auditor (broken / recoverable / dead-CTA / orphan), redirect-aware #go self-heal + publish-time warning | `af616fb` | NON-REDUNDANT: publish preflight was alt-text only; nothing audited link targets; the redirect table was written by setSlug and read by nothing |

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
4. **Version Compare** *(S, publishing)* — a `diffContent(a,b)` helper + a diff view in VersionHistory so
   restore isn't blind. NON-REDUNDANT. Cheap, no store change.
5. **Reusable Content Snippets** *(M, dev)* — synced saved blocks (a Snippet block + context). v2 of
   Saved Sections; the synced-render path is fiddly — ship Saved Sections first.
6. **Page Health Panel** *(M, quality)* — only its genuinely-new rules (single-h1, heading-order); the
   alt/meta/dead-link rules overlap findMissingAlt, SeoPanel + this cycle's audit. Fold in, don't dup.
7. **Named CTA tracking / per-page CTA inventory** *(S, growth)* — value deferred until GTM goes live.
8. **Global Find & Replace** *(M, content/ops)* — real gap, but bulk-mutating block props is the riskiest
   candidate; defer until safer wins land.
9. **On-Brand Copy Coach** *(S, quality)* — banned-phrase/readability hints (operationalises
   greatstone-voice); advisory-only, needs a host surface. Nice-to-have later.
