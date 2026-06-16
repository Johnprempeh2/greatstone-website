# Greatstone Studio: data model

The reference for the dev team. The studio keeps all authored content in one JSON document in
localStorage (key `gs-studio`), versioned by `schema`. The shape below is the contract: it maps onto
Laravel tables one slice at a time, so the swap to a real backend is a data-source change, not a
rewrite. Export the live authored content with **⌘K → "Export site JSON"** (admin only) and seed from it.

The store also holds an ephemeral licence basket under a separate key (`gs-cart`, `{ productId: qty }`).
That is per-session UI state, not content, and is not part of this model.

## Envelope

```jsonc
{
  "schema": 17,                 // integer; bump + migrate forward, never re-key (drafts/history are in here)
  "settings": { "background": "stone-summit", "siteName": "Greatstone International" },
  "org": { "id": "org-greatstone", "name": "Greatstone International", "slug": "greatstone" },  // the tenant
  "order": ["home", "method", "services", "industries", "products", "proof", "about", "insights", "climb", "contact"],
  "pages": { "<slug>": Page },  // keyed by slug; `order` is the nav/sort order
  "categories": [Category],
  "products": [Product],
  "team": [TeamMember],
  "activity": [ActivityEntry],  // append-only, capped at 200
  "assets": { "<id>": Asset }
}
```

## Organisation  → `organisations` (tenant)

```jsonc
{ "id": "org-greatstone", "name": "Greatstone International", "slug": "greatstone" }
```
The prototype runs one org, but **every Product, Category and TeamMember carries `orgId`** (FK →
Organisation.id), so the shape is already multi-tenant: the Laravel build adds the `org_id` column +
scopes every query to the current org. Pages are the public marketing site (one per deployment) and
stay un-scoped for now.

## Page  → `pages` (+ `page_versions`)

```jsonc
{
  "title": "Home",
  "background": "stone-summit" | SceneTrack,   // preset id, or { v, scenes:[{id,kind}], transitions:[{id,at,fade,anchor}] }
  "status": "draft" | "review" | "approved" | "published",
  "seo": { "title": "", "description": "", "ogImage": "" },
  "data":      { "root": { "props": { "title": "" } }, "content": [Block] },  // the working draft (Puck data)
  "published": { ...same shape... },            // the live version; the public site renders this
  "versions": [{ "id", "ts", "label", "data", "by", "status" }],   // snapshots → page_versions
  "statusHistory": [{ "from", "to", "by", "ts", "note?" }],        // governance audit → page_status_log
  "approvedBy": "email | null"
}
```
A `Block` is `{ "type": "Hero" | "Storefront" | ... , "props": { "id", ...fieldValues } }`. The block
library + each block's fields live in `src/puck.config.jsx` / `src/blocks/*`. Status machine:
`draft → review → approved → published` (admins can publish from any status; editors propose only).

## Product  → `products`

```jsonc
{
  "id": "prod-bedrock",
  "slug": "bedrock-platform",        // unique, url-safe; the #product/<slug> route + shareable identity (stable on rename)
  "sku": "GS-BDRK",                  // stock-keeping unit (display/ops; "" until set)
  "name": "Bedrock Platform",
  "category": "cat-platform",        // FK → Category.id ("" = uncategorised)
  "price": "From £12,000",           // display string (sales-led); parse the floor for an Offer.price
  "period": "/year",
  "licence": "Site licence",
  "badge": "Core",                   // optional ribbon label
  "status": "active" | "legacy" | "draft",  // draft = hidden from the public storefront; legacy = older, still sold
  "summary": "…",
  "features": ["…"],                 // string[]
  "image": "", "imageAlt": ""        // via the media library
}
```

## Category  → `product_categories`

```jsonc
{ "id": "cat-platform", "name": "Platforms", "slug": "platforms", "blurb": "…" }
```

## TeamMember  → `org_user` (+ `invitations`)

```jsonc
{
  "id": "tm-admin",
  "name": "Studio Admin",
  "email": "admin@greatstone",       // unique per org (enforce server-side)
  "role": "admin" | "editor" | "viewer",   // capabilities below
  "title": "Studio administrator",   // responsibilities
  "status": "active" | "invited"     // invited = pending invitation (no real account yet)
}
```
Roles → capabilities (`src/cms/auth.js`, mirror with Spatie):
`admin` = edit + publish + manageUsers · `editor` = edit (proposes; can't self-publish) · `viewer` = read-only.
Rules the prototype already enforces in the UI and the real backend must enforce server-side: at least
one active admin, no self-removal, unique invite email.

## ActivityEntry  → `activity_log`

```jsonc
{ "id": "act-…", "ts": 1718500000000, "by": "admin@greatstone", "label": "Removed product “Mortar Connect”" }
```
Append-only audit of catalogue + team changes (page status changes live in `Page.statusHistory`).

## Asset  → `media`

```jsonc
{ "id": "asset-…", "url": "https://…", "alt": "", "ts": 1718500000000 }
```
A registry of image URLs the team has reused. Blocks/products store the URL itself (decoupled), not an id.

## Notes for migration

- `ts` fields are JS epoch millis. `id`s are app-generated (`<type>-<base36>`); the DB can keep them or remap.
- Timestamps, real auth/RBAC (org scoping), invitation delivery, and licence purchase + payment are
  backend responsibilities. See HANDOVER.md for those handoff specs. Nothing here ships fake auth or payment.
