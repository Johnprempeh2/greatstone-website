# Deep Dive Portal (`#deepdive`)

Where a Greatstone Deep Dive runs. Operating Standard v2.3, section 4.10.

## Two surfaces, one record

**Greatstone staff** get the workspace: the whole investigation, plus the two controls that move it.
Per item, a **status** (Not started / Under way / Examined / Blocked) and a **visibility**
(Internal / Shared). Greatstone works the Deep Dive here.

**The client** sees only what has been marked Shared, in client language ("Complete", not "Examined"),
with a progress bar over those items. **Internal is the default**, so nothing reaches them by omission.
The client surface is a different component, not the workspace with pieces hidden, so there is no
CSS or prop that can accidentally reveal an internal item.

Staff can tick **Preview as the client sees it** to look at exactly what the client gets.

Asking the client for information *through* the Portal is a later capability. Today the
"What we need" tab is Greatstone's own working list.

## Where the content comes from

The Deep Dive Investigation Plan is canonical. The Portal renders it; it never restates it.

```bash
python3 greatstone-indago-gita/tools/export-portal.py
```

That reads `docs/build-ddip.py` with `ast` (no import, no side effects) and writes
`greatstone-puck-proof/.deepdive/<slug>.json` plus `index.json`. Re-run it after any change to the
Plan. Item ids are content hashes, so status survives a reordering of the Plan and detaches from an
item whose wording actually changed.

## Confidentiality: where the records live, and why

**`~/Desktop/Code/.greatstone-records/`, OUTSIDE the site repo.** Not in `public/`, and not in the
project root either. Two attempts got this wrong and both were caught by attacking the running
server, not by reasoning about it:

1. `public/` does not work: Vite copies it wholesale into `dist/`, so the plan ships with the site.
   A `.gitignore` does nothing to stop that.
2. `<root>/.deepdive/` did not work either, and this one is the instructive failure. The plugin's own
   routes were gated (loopback + Host allowlist), and that gate was airtight. But **Vite serves the
   project root as static files**, so `GET /.deepdive/indago.json` and
   `GET /@fs/<abs>/.deepdive/indago.json` handed the entire Confidential plan to any LAN peer, on the
   same socket where `/deepdive/summary` was correctly returning 403. A deny-list is a list of doors
   you thought of.

Moving the directory out of the root removes the capability rather than forbidding it: the files are
outside `server.fs.allow`, so `/@fs/` refuses them and the static middleware cannot see them.
`server.fs.deny` is set as well, for the case where someone puts a copy back.

The standing checks, both of which must stay clean:

```bash
npx vite build && grep -rli "indago\|spss\|gordon" dist/
curl -s "http://$(ipconfig getifaddr en0):5186/.greatstone-records/indago.json" | grep -i sponsor
```

Note the second one matters as much as the first. Placeholder text, comments and aria-labels all
compile into the bundle; a real client's tool names leaked that way once already.

## Why the data is not in `public/`

An Investigation Plan is Confidential. `.deepdive/` is gitignored **and outside every build input**.
It is served only by the `deepDiveDevData` middleware in `vite.config.js`, which is `apply: 'serve'`
and therefore exists only on the dev server.

This is deliberate and worth not undoing:

- `public/` does **not** work. Vite copies it wholesale into `dist/`, and `.gitignore` does nothing
  to stop that, so the Plan would ship with the site. This was caught by grepping `dist/` and is the
  reason for the current arrangement.
- **Importing** the data does not work either, for the same reason: anything imported is compiled
  into a bundle any visitor can download, signed in or not. A sign-in gate over content already in
  the browser is not access control. The engagement descriptor (client, sponsor) is fetched for the
  same reason: *which* clients Greatstone is running a Deep Dive for is itself confidential.

`grep -rli "indago\|spss\|gordon" dist/` should return nothing. Keep it that way.

## Getting there

`#admin` → the rail's **Commerce** group → **Clients & DX** → **Manage** → **Open record**.

Clients & DX and Vendor activation were both missing from the rail entirely: the catalogue admin has
nine tabs and the rail listed seven, so the only way in was to open `#catalogue` and spot the tab.
Added in `src/cms/AdminConsole.jsx`.

A record exists for **every** customer, so `#deepdive/<customers.slug>` always resolves. One that has
never been filled shows a named empty state, not an error.

## Putting information in

`src/store/RecordDrawer.jsx` is the one input surface. Reached from "+ Add to the record" in the
record header, a "+ Add" on each list, or **Edit** on any row. It covers the four item kinds and the
record's own details and outcomes.

Two rules the drawer enforces because they are the Standard, not preferences:

- **A question marked Known or Indicated must say what is already established.** The claim is what
  licenses us not to ask the client again (4.2), so a claim with nothing behind it is refused.
- **Nothing is ever created Shared.** `applyOp` writes plan content only and never touches state, so
  visibility cannot be set at creation. Publishing stays a separate, deliberate act.

**Every placeholder in the drawer is generic.** Placeholder text is compiled into the public bundle.
The first draft used a real client's tool names as examples and they shipped into `dist/`; the build
grep caught it. Keep examples abstract.

## Two kinds of note

They are different things and the UI keeps them apart:

- **The item's note** is part of the plan. On a question it is what is already established, which is
  what licenses us not to ask again; on an evidence item it is what we hold and what is missing.
  Edited in the drawer, and visible to the client when that item is shared.
- **The working note** is Greatstone's own progress on the item. Edited inline from the row, stored
  in the state file beside status and visibility, logged like any other change, and **never rendered
  in the client view** (it is absent from that component, not hidden by CSS).

## Bulk status

A pillar's questions can be moved together from the pillar card. **Visibility is deliberately not
offered in bulk.** Publishing to the client is a per-item decision, and a "share everything" button
is exactly how that stops being one.

## How a change reaches disk

The plan is never written as raw bytes. The browser submits an **operation** (`add` / `edit` /
`remove` / `set_engagement`) and `src/data/deepdive-schema.mjs` decides whether it is legal. That
module is pure, dependency free and shared: the browser runs it to answer the typist in the field
that caused the problem, and the receiver runs it again on arrival, because the browser's copy is a
courtesy and never the guard.

Ids are content hashes minted from the item's identifying text, never accepted from a form. Node
uses `node:crypto`; the browser uses `crypto.subtle`. Both produce the same 8 hex, so an item added
in the workspace and the same item added by the MCP are the same item.

Two transports, in order: **Supabase** (`deepdive_plans`, with a `row_version` check so a concurrent
write is a visible conflict rather than a silent loss), then the **dev-only** `POST /deepdive/op` in
`vite.config.js`. Neither available means authoring is off, and every affordance renders disabled
with the reason on it rather than failing on submit.

## Filling it in over time: the Deep Dive MCP

`~/.claude/mcp-servers/deepdive/` (registered as `deepdive`). Nine tools that read and write the same
`.deepdive/` files the Portal reads: add processes, questions, evidence and sessions, move items
through status, decide what the client sees, and validate the result.

The browser writes there too, over a `PUT` on the dev middleware, so a change made in the workspace
and a change made by a Claude session are the same bytes and appear in the same **History** tab,
attributed to Portal or Claude. Only `<slug>.state.json` is writable over HTTP; the plan is not, so a
browser bug cannot rewrite the artefact that has to stay traceable to its source document.

`deepdive_check` reports both what would stop the Portal rendering and the coverage gaps the Standard
treats as findings: a pillar no session can answer for, a pillar with no questions, a pillar no
process touches, and status records pointing at items that no longer exist.

## The real backend

Both `deepdive-source.mjs` (the Plan) and `deepdive-state.mjs` (status and visibility) prefer
Supabase and fall back to local. Two tables are needed, and until they exist:

- status is written to `.deepdive/<slug>.state.json` and shared with the MCP but not between
  machines, falling back to that browser's localStorage if the dev endpoint is absent (the workspace
  says which, in amber);
- the Plan is read from the local file, so a deployed build shows the empty state.

```sql
-- deepdive_plans:      slug (pk), plan jsonb
-- deepdive_item_state: slug, item_id, status, visibility, note, updated_at  -- pk (slug, item_id)
```

Both need row-level security: staff read and write everything; a customer reads only their own
engagement, and only rows where `visibility = 'shared'`. **The client filter belongs in RLS, not only
in the component** — the component's filter is presentation, the policy is the control.

Note `isAbsentOrForbidden` in `src/lib/pg-absent.mjs`: PostgREST answers an unknown table with
`PGRST205`, not Postgres's `42P01`, so a guard written against `42P01` alone never fires.

## Pillars: a live inconsistency

The Portal uses the eight working pillars ratified in Operating Standard v2.3 Appendix A on
4 September 2026: Data, Technology, People, Communication, Process, Governance, Customer, Competitor,
grouped under Innovation, Culture, Operations, Market.

The **public site still carries Book III's superseded set** (Innovation and Value in place of Process
and Governance) in `blocks/PillarCards.jsx`, `blocks/Pillars.jsx`, `blocks/PillarExplorer.jsx`,
`blocks/MethodTieIn.jsx`, `data/maturity-seed.mjs` and stored CMS content. Reconciling those is a
content-owner decision and has not been made.

## Running it

```bash
npm run dev   # then #deepdive
```

Access is gated on sign-in: staff (`adminAuth`) get the workspace, a customer gets their own
engagement, and a customer with no engagement gets an honest empty state rather than a default.
