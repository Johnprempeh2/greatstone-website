# Website collection field schemas

GSAM can consume this directory at a pinned website commit. `manifest.v1.json` maps the
GSAM editor's singular collection names to the release file's keys. `collections.v1.schema.json`
is JSON Schema 2020-12. Resolve each `ref` against its `$id`, then validate the complete
`website_entry` document body as `fields`. Do this on save and again before release. The
release envelope is still validated against `../website-release.v1.schema.json`, and the
engine's `validateRelease` applies cross-entry rules. A change to a collection's fields
requires a new `fieldsVersion` and a new schema file; keep version 1 available for old
releases. Release file `schema` remains 1 until its envelope changes.

`blocks-motion.v1.schema.json` is the field contract for the Next.js page editor's
Motion group. `manifest.v1.json` maps each capable Puck block to its `$defs` ref.
`motion` is optional in release JSON: older saved blocks keep their previous rendering
and never acquire a new effect merely because the editor gained a default. A newly
inserted block receives its brand-locked Puck default. `quietAnchor` is fixed to `copy`;
editors choose only the allowed effect and Off, Subtle or Full intensity. The release
validator rejects a motion value on a block without a motion field.
Only rendered effects are selectable: Hero stone, Tide band and the six contained
backgrounds. Dev Tools and the survey default to None/Off, so an editor must choose
an effect before it appears. The
editor hides Intensity while None is selected. Hero stone currently uses the same
renderer for Subtle and Full; its intensity setting has no visual effect yet.
The Two Doors home blocks deliberately have no motion field. John removed the home
page from GRE-2213's scope on 24 October 2026; its current Tide and layout stay as
saved. Mica's earlier home mock-up is withdrawn.

Runtime contract: paint a still at the final dimensions before loading code. Register
each motion block with `createMotionCoordinator` from `../motion-runtime.mjs` and render
only when its mode is `animate`. `still` keeps the frame without a loop; `paused`
stops drawing while hidden, off screen or Off. The coordinator gives the viewport's
largest visible effect the one animation slot. It waits for load and an idle slot,
honours reduced motion, Save-Data and constrained devices, and uses stills on phones.
Heavy renderers must use dynamic imports after the coordinator opens the gate and
release their WebGL context on cleanup. `motionBudget` caps Subtle at 30 fps and 70%
study alpha/density, Full at 60 fps. Background renderers must mask the copy box plus
90 by 70 px as the quiet zone, keep lime outside an additional 60 by 50 px margin,
and measure at least 7:1 body-text contrast in both palettes. The Tide band has no
body text. The proof curve remains unavailable until John decides on it.

The catalogue is the Next engine's public projection. GSAM `product` maps to `offerings`,
`category` to `categories`, and `vendor` to `vendors`. For each catalogue entry, write
`fields: {data: row}`, with `entry.id === row.id` and `entry.slug === row.slug` when the
slug satisfies the release envelope's strict path rule. The product detail route reads
`fields.data`; its nested vendor, category, variant, specification, image and SEO fields
are covered by the field schema. The schema states types, required fields and allowed
values. `redirect` maps to the release's top-level `redirects[]`, with no collection
wrapper. Redirect source, target, uniqueness, loops and live-page conflicts still need
the release validator's R9 check.

`import-source.mjs` exports `publicCatalogue`, `publicPeople`, `publicForms` and
`publicFormBlocks`. `publicCatalogue` is a **dated, partial public snapshot**: 10 vendors,
32 categories and the first 24 published offerings, captured 22 October 2026. Its price
fields are null. It is useful for editor seeding and tests, but it is not a full live
catalogue export. A complete import must call `publishedCatalogue()` from
`../catalogue-source.mjs` with a local or test database connection and verify the row
counts before cutover. No production database connection is available in this checkout.

For the complete catalogue, run `node next-proof/scripts/export-catalogue.mjs <output.json>`
with a local or test `DATABASE_URL` (or `NETLIFY_DB_URL`). The script requires the database
and refuses `NEXT_CATALOGUE_FIXTURE`. It reads every published offering page and detail
through `publishedCatalogue()`, writes `vendors`, `categories` and `offerings` as
`fieldsVersion: 1` release collections, validates each entry's fields and prints source
and export-payload row counts. It fails if a row is omitted, duplicated or has an unmapped
field. The output file is created with owner-only permissions and must stay outside the
repository. After the GSAM import, pass its collection JSON as a second argument. The
script then compares source and editor-imported counts and row IDs before cutover. The public
projection contains no Studio `team` roster. Request-time price decorations and database
join IDs are not version 1 collection fields; the persisted public product fields are.

`publicPeople` projects the six displayed About-page cards from the published `Team`
block, with only name, role, kind and optional photo. `team` in the old Studio store is
staff account data. It has no release collection or import path: never export its email,
role permissions, invitation token or invite history. GSAM may assign stable entry IDs
when it imports public people. `publicForms` describes the visible inputs on the three
current form blocks; `publicFormBlocks` preserves their published page props for a full
page import. The Next renderer binds these three blocks to
the matching `forms` collection entry by `<page-slug>-<block-type-lowercase>` (or an
explicit `formKey` block prop). The form entry controls heading, intro, submit label,
field labels, placeholders, required state and select options. Missing entries retain
the page props for older releases. The visitor handlers and consent text stay in the
blocks. Release validation refuses unsupported field keys/types and a missing or
optional name or email on a bound form, so edits cannot silently drop lead data.
