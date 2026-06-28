# CMS flexibility — editable nav + per-block links

Deep dive into making the Greatstone studio editor-flexible: build/edit the nav bar (nestable
dropdowns, add pages and external links), and control the target of any button/CTA inside blocks —
all without code. Produced from a 4-agent investigation of the codebase.

## The good news

Nothing here is a rewrite. The CMS already has every pattern we need:

- **Custom Puck fields work** — `MediaField` is a live custom field (the image picker), proving the
  same mechanism supports a Link field and a Nav builder.
- **State CRUD + migrations** — `store.js` already persists state, has a `migrate()` path, and CRUD
  helpers for pages and products. A `navigation` tree slots straight in.
- **Editor panels** — `PagesPanel` / `SiteSettingsPanel` are the slide-over pattern a Navigation
  panel copies.
- **One nav source** — `publicNavOrder()` already feeds the header, footer and ⌘K so they can't drift.
- **The header is already polymorphic** — `buildNavModel()` emits a generic `link` / `group` model and
  `NavGroup` renders the accessible dropdown. Only the *data source* needs to change from a hardcoded
  array to CMS data; the rendering and a11y stay untouched.
- **Link handling is half-centralised** — `App.jsx` already intercepts `#book` (booking) and
  `#go/<slug>` (page nav); `safeHref`/`safeMailto` sanitise at render. We consolidate, not invent.

## What's hardcoded today (the two gaps)

1. **The nav bar.** `NAV_GROUPS` in `Header.jsx` is a static array (one "Who We Are" group). No editor
   UI to add/remove/reorder/nest items, rename groups, override a page's nav label, add an external
   link, or hide a page from the header. Editing the bar = a code change. It also goes stale: rename or
   delete a page and the hardcoded group silently drifts.
2. **Block link targets.** CTA/button targets (`ctaHref`, `email`, `p.href`, and `#book` hardcoded in
   BookDeepDive) are bare text inputs across 20+ blocks. Editors must type `#go/<slug>`, `#book`,
   `mailto:` or `https://` from memory — no picker, no page autocomplete, no validation, no
   open-in-new-tab, and a typo (`#go/serivces`) fails silently.

## The plan

### Phase 0 — Dropdown hotfix (DONE)
The shipped "Who We Are" dropdown was clipped by `.gs-navwrap{overflow:hidden}` (it only un-clipped when
the bar collapsed) and had an 8px hover gap. Fixed: `overflow:visible` + a transparent hover bridge.
Committed.

### Phase 1 — Editable navigation (recommended first; ships without the publish gate)
- **`state.navigation` tree** — `[{ id, type:'link'|'group', label, pageSlug?, href?, children?, visible }]`,
  seeded from a default that mirrors today's bar exactly, plus CRUD helpers and a defensive migration. *(S)*
- **Header/Footer refactor** — `buildNavModel()` walks the tree instead of the hardcoded const; the
  `NavGroup` dropdown + collapse + keyboard a11y stay exactly as they are. *(M)*
- **NavigationPanel** — a new editor panel: add/remove/reorder, nest pages into dropdown groups, rename
  groups, override a page's nav label (blank = page title), pick a page *or* paste a URL per item, and
  toggle header visibility. *(M)*

This is the "build the nav bar yourself" capability, and it permanently retires the hardcoded array.

### Phase 2 — Central link resolver + a Link picker
- **`resolveLink()`** — one resolver that turns a structured link (`page` / `url` / `email` / `booking`
  / `anchor` + new-tab) *or* a legacy string into `{ href, target, onClick }`, folding in the
  `#book`/`#go` logic + the safe-URL guards. *(M)*
- **`LinkField`** — a reusable custom Puck field (same mechanism as MediaField): a type selector, a page
  dropdown with autocomplete, URL/email/anchor inputs, an "open in new tab" toggle, and a live resolved
  preview with error feedback. *(M)*

### Phase 3 — Roll the picker into blocks + discoverability
- Migrate blocks to `LinkField` + `resolveLink`, **Hero first as the proof**, then Invite / Chapter /
  ContactBand / BookDeepDive (replace the hardcoded `#book` with an "open booking" action), then the
  rest. Backward-compatible (legacy strings still resolve), so each block is independent and reversible. *(M)*
- A link-vocabulary reference card + inline field hints. *(S)*

## Recommendation

1. **Phase 0 is done.** 2. **Build the Nav track (Phase 1) next** — it's the higher-leverage, more
visible capability, structurally lower-risk (global chrome, no publish gate, additive migration, the
renderer/a11y untouched), and it retires the hardcoded array the hotfix is patching around. 3. **Then
the Link track (Phases 2–3)** as a clean chain: `resolveLink()` → `LinkField` → per-block opt-in (Hero
first). The two tracks are independent and could run in parallel; if sequencing one builder,
Nav → Link is the right order. Everything stays S/M by reusing existing patterns.
