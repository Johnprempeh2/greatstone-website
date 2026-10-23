# Website collection field schemas

GSAM can consume this directory at a pinned website commit. `manifest.v1.json` maps the
GSAM editor's singular collection names to the release file's keys. `collections.v1.schema.json`
is JSON Schema 2020-12. Resolve each `ref` against its `$id`, then validate the complete
`website_entry` document body as `fields`. Do this on save and again before release. The
release envelope is still validated against `../website-release.v1.schema.json`, and the
engine's `validateRelease` applies cross-entry rules. A change to a collection's fields
requires a new `fieldsVersion` and a new schema file; keep version 1 available for old
releases. Release file `schema` remains 1 until its envelope changes.

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
