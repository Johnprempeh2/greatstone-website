# Greatstone International — Unified Offerings Platform · API Contract (v1)

**Status:** implementation-ready · **Audience:** the frontend (catalogue + Puck studio), the agency's **Laravel 12 + Inertia** backend, and an **interim Postgres/Supabase** implementation. This document is the *seam* between the frontend and **any** backend, and the rubric against which the agency's Sprint-1 code is reviewed.

This contract is the API projection of the canonical Postgres schema (the source-of-truth DDL: `organisations`, `users`, `vendors`, `categories`, `offerings`, `offering_variants`, `offering_specs`, `pricing_rules`, `pricing_rule_targets`, `customers`, `customer_tiers`, `quotes`, `quote_items`, `orders`, `import_jobs`, `import_job_rows`, `ai_actions`, `content_pages`, `page_versions`, `media_assets`, `audit_log`). **Tables are cited, never redefined here** — when a field maps to a column, the column is named.

It is grounded in the real catalogue: `assets/products.json` — **10 vendors** (slug ids like `aspose`), **32 categories** (`cat-annotation`, all `parentId: null`), **159 offerings**, **819 variants** with real GBP prices (min **£63** `readiris-pdf-23-for-mac`/`iris`; max **£12,534,195** `aspose-html-for-java`/`aspose` → the bigint-minor-unit outlier), **12 featured**, **13 null-price** (POA / "Contact for licence"), specs `[{label,value}]`, seo `{metaTitle,metaDescription,socialImage}`. It supersedes the legacy Laravel/"Syrup" reseller endpoints (`/{vendor}/{slug}`, `/basket/add/{id}`, `/checkout/order`, `/login`, `/search`, `/password/reset`, `/callback`) and matches their capabilities while correcting the prototype's defects (localStorage store, price-as-string, vendor==category, faked cart/checkout).

---

## 0. Conventions (apply to every endpoint)

### 0.1 Base, versioning, content type
- **Base URL:** `/api/v1`. The version is in the **path** (`/api/v1`), never a header. Breaking changes ship as `/api/v2`; additive fields are non-breaking and may land in `v1`.
- **Content type:** `application/json; charset=utf-8` on request and response. `Accept: application/json` is required for the JSON contract; without it Laravel/Inertia may negotiate an HTML/Inertia response (see §0.12).
- **Naming:** JSON properties are `camelCase`. Database columns are `snake_case`; the API layer maps between them (e.g. `from_price_minor` → `fromPriceMinor`). Enum **values** are the database enum strings verbatim (`draft`, `published`, `percentage`, `product`, …).
- **IDs:** every resource carries a UUID `id` (the PK) **and** its stable business key (`slug` for offerings/vendors/categories/pages, `sku`+composite for variants, `reference` for quotes/orders). Public catalogue routes key on **slug**; write/upsert operations key on **slug/sku** (see §0.9). `fileKey` from the static export is a filesystem artefact only and is **never** a routing or DB key.

### 0.2 Money
Money is always a **pair**: an integer in **minor units** (pence) plus an ISO-4217 currency code. Never a float, never a formatted string.

```json
{ "amountMinor": 87000, "currency": "GBP" }   // £870.00
```

- Storage is `BIGINT` (the live feed's £12,534,195 = `1253419500` minor units overflows int4). Clients must treat amounts as 64-bit integers — in JS read them as `Number` only when known-safe (≤ 2^53) and otherwise as strings; the API serialises them as JSON numbers but documents the bigint contract.
- `amountMinor: null` (with `currency: null`) means **POA / "Contact for licence"** — render "Contact us", never "£0.00", and never discountable. A price and its currency are **both-or-neither** (mirrors the `chk_*_price_pair` CHECKs).
- Formatting (`£870`, `From £870`) is a **client** concern. The API returns numbers; helper field `display` is provided on *computed* prices only (see §3.3) as a convenience, never as the source of truth.

### 0.3 Timestamps
All timestamps are **ISO-8601 UTC with `Z`**: `2026-06-17T09:30:00Z` (TIMESTAMPTZ columns). Date-only inputs (rule schedules) accept full ISO datetimes; a bare date is interpreted as `T00:00:00Z`.

### 0.4 Pagination
Cursor-based by default; offset supported for admin tables.

Request query: `?limit=24&cursor=<opaque>` (cursor) **or** `?limit=24&page=2` (offset). `limit` default **24**, max **100**.

Every list response is enveloped identically:

```json
{
  "data": [ /* resources */ ],
  "meta": {
    "pagination": {
      "limit": 24,
      "count": 24,
      "total": 159,
      "page": 1,
      "totalPages": 7,
      "cursor": { "next": "eyJpZCI6...", "prev": null },
      "hasMore": true
    },
    "appliedFilters": { "vendor": "aspose", "type": "product" },
    "sort": "-featured,name"
  }
}
```

- `total`/`totalPages` are present for offset pagination; for very large cursor scans `total` MAY be `null` (documented per endpoint) to avoid a count scan.
- Cursors are opaque, signed, and encode `(sortKey, id)`; never construct them client-side.

### 0.5 Filtering
Filters are flat query params per the brief: `filter[vendor]`, `filter[category]`, `filter[platform]`, `filter[type]`, `filter[priceMin]`, `filter[priceMax]`, `filter[status]`, `filter[featured]`, `filter[tag]`. Multiple values comma-separated (`filter[platform]=.NET,Java`) = OR within a key, AND across keys. Unknown filter keys → `422` `validation_error` (fail loud, never silently ignore). `filter[price*]` are **minor units**.

### 0.6 Sorting
`?sort=` comma-separated fields, `-` prefix = descending. Whitelisted per endpoint. Offerings list: `name`, `-name`, `fromPrice`, `-fromPrice`, `featured`, `-featured`, `createdAt`, `-createdAt`, `updatedAt`. Default `-featured,name`. **Null prices always sort last** regardless of direction (matches the prototype's `priceless-last` rule).

### 0.7 Sparse fieldsets & expansion
- `?fields=slug,name,fromPrice` restricts returned attributes (listing performance).
- `?expand=vendor,category,variants,specs,media` includes related resources inline (default-expanded set documented per endpoint). `offerings` list never expands `variants`/`specs` by default (heavy); the detail endpoint does.

### 0.8 Error envelope
Every non-2xx returns the **same** shape. No bare strings, no HTML (when `Accept: application/json`).

```json
{
  "error": {
    "type": "validation_error",
    "message": "One or more fields are invalid.",
    "code": "GS-422-VALIDATION",
    "status": 422,
    "requestId": "req_01J8Z9...",
    "fields": {
      "adjustmentValuePct": ["Must be between 0 and 100."],
      "endsAt": ["Must be after startsAt."]
    },
    "meta": {}
  }
}
```

| `type` | HTTP | When |
|---|---|---|
| `unauthenticated` | 401 | No/invalid session or token. |
| `forbidden` | 403 | Authenticated but lacks the required permission (§1.3). |
| `not_found` | 404 | No resource for that id/slug **in the caller's org** (tenant isolation looks like 404, never 403, to avoid existence leaks). |
| `validation_error` | 422 | Field-level validation; `fields` map present. |
| `conflict` | 409 | Optimistic-lock `rowVersion` mismatch, or duplicate slug/sku/reference. |
| `precondition_failed` | 412 | `If-Match` ETag mismatch on a guarded write. |
| `idempotency_conflict` | 409 | Same `Idempotency-Key` reused with a different body. |
| `rate_limited` | 429 | Throttled; `Retry-After` header in seconds. |
| `unprocessable_state` | 409 | Illegal lifecycle transition (e.g. publish an archived rule, commit a rolled-back import). |
| `payload_too_large` | 413 | Import/media upload over the size cap. |
| `server_error` | 500 | Unhandled; `requestId` for support. |

`requestId` is echoed in the `X-Request-Id` response header on **every** response (including 2xx) for tracing/observability.

### 0.9 Idempotency
- **All mutating POSTs** accept an `Idempotency-Key: <uuid>` header. The server stores the first response keyed by `(org, route, key)` for **24h**; a replay with the same key + same body returns the stored response (and `Idempotency-Replayed: true`); same key + different body → `409 idempotency_conflict`. Required for: quote create, import create/upload/commit/rollback, ai_action create/approve, order create.
- **Bulk import upserts** are *intrinsically* idempotent via stable keys: offerings on `(org_id, slug)`, variants on `(offering_id, sku, license_type, billing_period)` (the `uq_variant_edition` constraint — SKUs repeat across editions in the feed, so SKU alone is insufficient), vendors/categories on `(org_id, slug)`. Re-applying the same file is a no-op (`source_checksum` guard).

### 0.10 Optimistic concurrency
Editable catalogue/content rows carry `rowVersion` (the `row_version` column). Writes send it back two equivalent ways:
- **Header (preferred):** `If-Match: "<rowVersion>"` (weak ETag = current `rowVersion`). Mismatch → `412 precondition_failed`.
- **Body:** `"rowVersion": 4` in the PATCH payload. Mismatch → `409 conflict`.
The server bumps `rowVersion` on every successful update (the `touch_row()` trigger). Clients must read the new value from the response and never reuse a stale one.

### 0.11 Auth, tenancy & roles on the wire
- **Session/JWT:** the frontend uses a first-party **session cookie** (Inertia/Laravel Sanctum SPA mode) for browser calls; service/automation clients use a **Bearer token** (`Authorization: Bearer <jwt>`). Either resolves to a `user` + `org_id`. **Authentication is delegated to the IdP** (Sanctum/Supabase Auth); this API never accepts or returns passwords — login/reset are handled by the auth provider routes (§1.1) which create the session, after which this API trusts it.
- **Tenancy:** `org_id` is derived from the session/JWT, **never** from a request parameter. Every query is org-scoped (RLS backstop via `current_setting('app.current_org')`). Cross-org access returns `404` (§0.8). A `customer` tier context for price computation is supplied explicitly as a query/body param (`tier`/`tierId`) and validated against the caller's permission to quote as that tier.
- **CSRF:** cookie-auth mutations require the `X-XSRF-TOKEN` header (Sanctum). Bearer-token mutations are CSRF-exempt.

### 0.12 Inertia equivalence (the Laravel reality)
Every **read** endpoint here has an **Inertia page** twin that returns the **same resource objects as props** instead of a JSON body. The mapping is mechanical:

| REST (JSON) | Inertia page (props) |
|---|---|
| `GET /api/v1/offerings` | `Catalogue/Index` → props `{ offerings: {data, meta}, vendors, categories, filters }` |
| `GET /api/v1/offerings/{slug}` | `Catalogue/Show` → props `{ offering, related, siblings }` |
| `GET /api/v1/admin/pricing-rules` | `Admin/Pricing/Index` → props `{ rules, vendors, categories, tiers }` |
| `GET /api/v1/content/pages/{slug}` | `Pages/Show` → props `{ page }` (public reads `publishedData`) |

The **resource shape is identical** in both transports — an Inertia prop `offering` is byte-for-byte the JSON `data` object below. Frontend components consume one shape regardless of transport (the static build's `fetch('assets/products-index.json')` → `fetch('/api/v1/offerings')` is a one-line swap; the Inertia path passes the same object as a prop). Mutations in Inertia mode are `POST`/`PATCH`/`DELETE` form requests to the **same paths**, returning a redirect + flash (`303` + `X-Inertia` semantics) or, with `Accept: application/json`, the JSON envelope above. **Where this contract and Inertia conventions differ, this contract wins for the JSON surface; Inertia wins for its own redirect/flash/validation-bag mechanics.**

### 0.13 Rate limiting & observability
- Public catalogue reads: 120 req/min/IP. Authenticated reads: 600/min/user. Mutations: 120/min/user. AI/import apply: 20/min/org. `429` carries `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Every response carries `X-Request-Id`. Every state-changing call writes one `audit_log` row (§9). `ETag`/`Last-Modified` on cacheable reads.

---

## 1. Auth, session, users & roles

The Puck studio is **admin-entry only** (a `#admin`-style gated route, not surfaced on the public site). Login lands an edit-capable user on the **Studio home** launcher; a read-only viewer stays on the public site. Authentication itself is the IdP's; this section covers session introspection and the org's user/role administration.

### 1.1 Auth provider routes (delegated — documented, not owned by this API)
These are **Sanctum/Supabase** routes the frontend calls directly; this API consumes the resulting session.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/login` | IdP credential exchange → sets session cookie. Replaces legacy `/login`. Never proxied through `/api/v1`. |
| `POST` | `/logout` | Clears session. |
| `POST` | `/forgot-password`, `/reset-password` | Replaces legacy `/password/reset`. |
| `GET`  | `/sanctum/csrf-cookie` | SPA CSRF bootstrap. |

**Hard rule:** no endpoint in this contract accepts a plaintext password or returns a password hash. If a reviewer finds one in the agency's code, it fails the rubric.

### 1.2 `GET /api/v1/me` — current session
**Auth:** any authenticated user. **Returns** the session principal + capabilities so the SPA can gate UI without guessing.

```json
{
  "data": {
    "id": "9b1c…", "email": "admin@greatstone", "fullName": "Site Admin",
    "role": "owner",
    "org": { "id": "…", "slug": "greatstone", "name": "Greatstone International", "baseCurrency": "GBP" },
    "permissions": ["offering.read","offering.write","offering.publish","pricing.write","pricing.publish","import.apply","ai.approve","user.manage","content.publish"],
    "lastLoginAt": "2026-06-17T08:55:00Z"
  }
}
```
`role` maps to the `org_role` enum (`owner|admin|editor|sales|viewer`). `permissions` is the **resolved** set (role defaults from `role_permissions`, overlaid with `user_permissions` grants/denies — deny wins). The frontend treats `permissions` as authoritative for showing/hiding actions; the server re-checks on every mutation regardless.

### 1.3 Permission keys (the authorization vocabulary)
Sensitive ops are admin/owner-only by seeded default. Endpoints below cite the required key.

| Key | Guards |
|---|---|
| `offering.read` | catalogue admin reads (public reads need none) |
| `offering.write` | create/update offerings, variants, specs, media |
| `offering.publish` | draft → published / archive of catalogue entities |
| `pricing.write` | create/update pricing rules |
| `pricing.publish` | activate/publish a pricing rule (goes live) |
| `import.create` | create/upload/dry-run an import |
| `import.apply` | commit / rollback an import (mutates catalogue) |
| `ai.propose` | create an AI proposal |
| `ai.approve` | approve/apply an AI proposal (**destructive ⇒ admin/owner**) |
| `content.write` / `content.publish` | edit / publish Puck pages |
| `quote.read` / `quote.write` | view / manage quotes |
| `user.manage` | invite users, change roles, edit permission matrix |

### 1.4 Users & roles (admin)
All require `user.manage` (owner/admin). Standard list/CRUD on `users`, `role_permissions`, `user_permissions`.

| Method | Path | Body / Notes |
|---|---|---|
| `GET` | `/api/v1/admin/users` | list `users` (org-scoped, `deleted_at IS NULL`). Filters `filter[role]`, `filter[active]`. |
| `POST` | `/api/v1/admin/users/invite` | `{ email, fullName?, role }` → creates a pending `users` row + IdP invite (no password set here). Idempotent on email. |
| `PATCH` | `/api/v1/admin/users/{id}` | `{ fullName?, role?, isActive?, rowVersion }` — role change writes `audit_log.action='role_change'`. |
| `DELETE` | `/api/v1/admin/users/{id}` | soft-delete (`deleted_at`). Cannot delete the last `owner` → `409 unprocessable_state`. |
| `GET` | `/api/v1/admin/roles/permissions` | the `role_permissions` matrix for the org. |
| `PATCH` | `/api/v1/admin/roles/{role}/permissions` | `{ permission, allowed }[]` — bulk grant/deny per role. |
| `PATCH` | `/api/v1/admin/users/{id}/permissions` | per-user override (`user_permissions`); `{ permission, allowed }`. |

**Error model:** `403 forbidden` if caller lacks `user.manage`; `422` on unknown `role`/`permission`; `409` on the last-owner guard.

---

## 2. Catalogue — public reads

Public, cacheable, **no auth required**, scoped to `status='published'` and `deleted_at IS NULL`. These power the listing (`products.html`/`catalog.js`) and detail (`product.html`/`product.js`) pages and their Inertia twins. Prices are computed for the **public** audience unless a `tier` is supplied and the caller is entitled to it (§3).

### 2.1 `GET /api/v1/offerings` — list / search / facet
**The listing index.** Replaces `fetch('assets/products-index.json')` with `fetch('/api/v1/offerings')` returning the same slim records. Unified: returns both `product` and `service` offerings; filter by `type` to split.

**Query params:** pagination (§0.4); `filter[vendor]`, `filter[category]`, `filter[platform]`, `filter[type]` (`product|service`), `filter[priceMin]`, `filter[priceMax]` (minor units), `filter[featured]`, `filter[tag]`, `filter[status]` (admin only; public forced to `published`); `sort` (§0.6); `q=` full-text (over `offerings.search_tsv` — name^A, shortDescription^B, tags^C, with trigram fallback on `name`); `tier=<slug>` (compute prices for a tier, entitlement-checked); `fields`, `expand` (default expand: `vendor,category`; `variants`/`specs` excluded by default).

**Response** (slim record — one light row per offering, matching the index shape: `id, slug, fileKey, name, vendorId, categoryId, categoryName, platforms, fromPrice, currency, icon, shortDescription, featured, variantCount`, plus computed `price`):

```json
{
  "data": [
    {
      "id": "aspose-aspose-pdf-for-.net",
      "slug": "aspose-pdf-for--net",
      "type": "product",
      "name": "Aspose.PDF for .NET",
      "vendor": { "id": "…", "slug": "aspose", "name": "Aspose", "logoUrl": "/media/logos/aspose.png" },
      "category": { "id": "…", "slug": "pdf", "name": "PDF" },
      "platforms": [".NET"],
      "tags": ["Aspose","PDF",".NET"],
      "icon": "/media/icons/aspose_pdf-for-net.png",
      "shortDescription": "Create, edit and convert PDF in .NET.",
      "featured": true,
      "fulfilment": "license",
      "variantCount": 6,
      "fromPrice": { "amountMinor": 87000, "currency": "GBP" },
      "price": {
        "base": { "amountMinor": 87000, "currency": "GBP" },
        "final": { "amountMinor": 69600, "currency": "GBP" },
        "appliedRule": { "id": "…", "name": "Aspose Summer Sale", "label": "Summer offer", "endsAt": "2026-09-01T00:00:00Z" },
        "display": "From £696"
      }
    }
  ],
  "meta": {
    "pagination": { "limit": 24, "count": 24, "total": 159, "page": 1, "totalPages": 7, "hasMore": true },
    "facets": {
      "vendor": [ { "value": "aspose", "label": "Aspose", "count": 86 }, { "value": "iris", "label": "IRIS", "count": 7 } ],
      "category": [ { "value": "pdf", "label": "PDF", "count": 21 }, { "value": "annotation", "label": "Annotation", "count": 3 } ],
      "platform": [ { "value": ".NET", "count": 70 }, { "value": "Java", "count": 41 } ],
      "type": [ { "value": "product", "count": 159 }, { "value": "service", "count": 0 } ],
      "priceRange": { "minMinor": 6300, "maxMinor": 1253419500, "currency": "GBP" }
    },
    "appliedFilters": { "vendor": "aspose" },
    "sort": "-featured,name"
  }
}
```

- `price` is the **computed** quote price (§3). When no rule wins, `final == base` and `appliedRule` is `null`. When `fromPrice` is null (POA), `price.base`/`final` are `{amountMinor:null,currency:null}` and `display` is `"Contact us"`.
- `facets` let the client render the facet sidebar without a second call (the static page does facets client-side; the API offers them so large catalogues don't ship all rows).
- `fileKey` is **not** returned by the API (it was a static-export artdefact); the client derives any filesystem-safe key it still needs from `slug`.

**Errors:** `422` unknown filter/sort; `403` if a tier is requested the caller can't quote.

### 2.2 `GET /api/v1/offerings/{slug}` — full detail
**The product resource.** Replaces `fetch('assets/catalog/products/{fileKey}.json')` with `GET /api/v1/offerings/{slug}`. Default-expands everything a product page needs.

`?tier=<slug>` for tier pricing. `?expand=related,siblings` to fold in the sibling/related lists server-side (drops the second index fetch the static page makes).

```json
{
  "data": {
    "id": "aspose-aspose-pdf-for-.net",
    "slug": "aspose-pdf-for--net",
    "type": "product",
    "name": "Aspose.PDF for .NET",
    "shortDescription": "Create, edit and convert PDF in .NET.",
    "description": "Aspose.PDF for .NET is a PDF document creation and manipulation API…",
    "platforms": [".NET"],
    "tags": ["Aspose","PDF",".NET"],
    "featured": true,
    "status": "published",
    "fulfilment": "license",
    "vendor": { "id":"…","slug":"aspose","name":"Aspose","domain":"aspose.com","logoUrl":"/media/logos/aspose.png" },
    "category": { "id":"…","slug":"pdf","name":"PDF","parentId": null },
    "media": {
      "primary": { "id":"…","url":"/media/icons/aspose_pdf-for-net.png","altText":"Aspose.PDF for .NET" },
      "gallery": [ { "id":"…","url":"/media/gallery/…","altText":"…","sortOrder":0 } ]
    },
    "specs": [
      { "label": "Create PDF from scratch", "value": "✓", "sortOrder": 0 },
      { "label": "Convert PDF to Word/Excel/HTML", "value": "✓", "sortOrder": 1 }
    ],
    "variants": [
      {
        "id":"…","sku":"ASPOSE-230","name":"Developer Small Business",
        "licenseType":"Developer Small Business - Single Developer, Single Location",
        "platform": null, "billingPeriod":"perpetual",
        "minOrderQty":1, "listDiscountPct":0,
        "price": {
          "base": { "amountMinor": 87000, "currency":"GBP" },
          "final": { "amountMinor": 69600, "currency":"GBP" },
          "appliedRule": { "id":"…","name":"Aspose Summer Sale","label":"Summer offer","endsAt":"2026-09-01T00:00:00Z" },
          "display":"£696"
        }
      }
    ],
    "fromPrice": { "amountMinor": 87000, "currency":"GBP" },
    "price": { "base":{"amountMinor":87000,"currency":"GBP"}, "final":{"amountMinor":69600,"currency":"GBP"}, "appliedRule":{ "id":"…","label":"Summer offer" }, "display":"From £696" },
    "seo": { "metaTitle":"Aspose.PDF for .NET | Greatstone", "metaDescription":"…", "socialImage": null },
    "ctas": {
      "quote":  "/contact?offering=aspose-pdf-for--net&vendor=aspose&type=quote",
      "trial":  "/contact?offering=aspose-pdf-for--net&vendor=aspose&type=trial"
    },
    "createdAt":"2026-06-01T00:00:00Z","updatedAt":"2026-06-15T10:00:00Z","rowVersion": 3
  },
  "meta": {
    "related": [ { "slug":"aspose-pdf-for-java","name":"Aspose.PDF for Java" } ],
    "siblings": [ { "slug":"aspose-words-for--net","name":"Aspose.Words for .NET" } ]
  }
}
```

- **Variant pricing example with the bigint outlier:** for `aspose-html-for-java` a variant returns `"base": {"amountMinor": 1253419500, "currency":"GBP"}` (£12,534,195) — a 64-bit integer, confirming the bigint contract.
- **Null-price example:** `apryse/apryse-server-sdk` (featured, no variants) returns `fromPrice: {amountMinor:null,currency:null}`, `price.display:"Contact us"`, empty `variants`, and only the `quote` CTA (no firm number to show).
- `ctas` are **quote/trial deep-links, never a checkout** — this is a browse-and-enquire business. There is no "add to basket" affordance in the contract; the enquiry basket (§6) is an explicit multi-item quote request, not a cart.

**Errors:** `404 not_found` for unknown/unpublished/cross-org slug.

### 2.3 `GET /api/v1/vendors` · `GET /api/v1/vendors/{slug}`
Public list/detail of `vendors` (the 10 brands). `?expand=offerings` (paginated slice). Each vendor: `{ id, slug, name, domain, logoUrl, description, offeringCount, sortOrder }`. `offeringCount` is the published, non-deleted count (Aspose = 86).

### 2.4 `GET /api/v1/categories` · `GET /api/v1/categories/{slug}`
Public list/detail of `categories` (the 32 product types). Hierarchy-aware: `?tree=true` returns nested children via `parentId` (all `null` today, but the tree shape is honoured). Each: `{ id, slug, name, parentId, description, iconUrl, offeringCount, sortOrder, children? }`.

### 2.5 `GET /api/v1/catalogue/index` — combined bootstrap (convenience)
One call returning `{ vendors, categories, offerings: {data, meta} }` for first paint — the exact shape `catalog.js` expects (`{ vendors, categories, products[] }`, with `products` renamed `offerings` and slim fields). Equivalent to three calls; offered to keep the listing page's single-fetch boot. Heavily cached (`ETag`, 60s `s-maxage`).

---

## 3. Pricing computation & rules

The discount engine. **Single-winner, no stacking, floor-clamped, never negative, never on POA.** Rules scope to `all | vendor | category | offering | tier`, percentage or fixed, scheduled. Maps to `pricing_rules` + `pricing_rule_targets`. Prices shown are **quote/indicative** — there is no checkout charge.

### 3.1 Computation semantics (the contract the backend must honour)
For an offering/variant with numeric base `B` (minor units) and audience (public or a tier), at instant `now`:
1. Collect candidate rules where `active = true` AND `status='published'` AND `now ∈ [startsAt, endsAt]` (open-ended if null) AND the rule's target matches (scope_type `all`, or a `pricing_rule_targets` row for this offering's vendor/category/offering/tier) AND audience applies (`public`, or `tier` matching the requested entitled tier) AND `appliesToOfferingType` is null or equals the offering's `type`.
2. **Pick at most one winner:** lowest `priority` (lower wins); tie-break largest absolute reduction; final tie-break newest `id`. **No compounding.**
3. Apply: percentage → `cut = round(B × pct/100)`; fixed → `cut = adjustmentValueMinor` (rule's own currency; mismatched currency ⇒ rule skipped). `final = B − cut`.
4. **Clamp:** `final = max(final, round(B × floorFraction), 0)`. Never negative, never below the configured floor.
5. **POA guard:** if `B` is null, **no rule applies** — `final = base = null`, `display = "Contact us"`.

The response `price` block is the *only* place this result surfaces; the engine must produce identical results on listing, detail, variant, quote snapshot, and preview.

### 3.2 `GET /api/v1/admin/pricing-rules` · CRUD
**Auth:** `pricing.write` (read/create/update), `pricing.publish` (activate). Standard list/detail/create/update/soft-delete on `pricing_rules`, with targets managed inline.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/admin/pricing-rules` | list; `filter[active]`, `filter[scopeType]`, `filter[audience]`. Each rule includes resolved `affectedCount` + sample before/after. |
| `POST` | `/api/v1/admin/pricing-rules` | create. **Seeds `active:false`** server-side regardless of input — a new rule never goes live on insert. |
| `GET` | `/api/v1/admin/pricing-rules/{id}` | detail + targets + `affectedCount`. |
| `PATCH` | `/api/v1/admin/pricing-rules/{id}` | update (`If-Match`/`rowVersion`). |
| `POST` | `/api/v1/admin/pricing-rules/{id}/activate` | `pricing.publish`; sets `active:true`, `status:'published'`, `published_at`. Audited. |
| `POST` | `/api/v1/admin/pricing-rules/{id}/deactivate` | `pricing.publish`; `active:false`. |
| `DELETE` | `/api/v1/admin/pricing-rules/{id}` | soft-delete. |

**Create/update body:**
```json
{
  "name": "Aspose Summer Sale",
  "scopeType": "vendor",
  "appliesToOfferingType": "product",
  "adjustmentType": "percentage",
  "adjustmentValuePct": 20,
  "currency": null,
  "audience": "public",
  "audienceTierId": null,
  "startsAt": null,
  "endsAt": "2026-09-01T00:00:00Z",
  "priority": 10,
  "floorFraction": 0.5,
  "label": "Summer offer",
  "targets": { "vendorSlugs": ["aspose"] },
  "rowVersion": 1
}
```
- `targets` accepts `vendorSlugs`/`categorySlugs`/`offeringSlugs`/`tierSlugs` and is materialised into `pricing_rule_targets` (exactly-one-target-per-row, matching `scopeType`). `scopeType:"all"` requires no targets.
- **Fixed** adjustment uses `adjustmentValueMinor` + required `currency` instead of `adjustmentValuePct`.
- **Validation (`422`):** percentage rule without `adjustmentValuePct ∈ [0,100]`; fixed rule without `currency`; `endsAt ≤ startsAt`; `audience:"tier"` without `audienceTierId` (and vice-versa); `floorFraction ∉ [0,1]`. These mirror the schema CHECKs — the API rejects what the DB would reject, earlier and with field messages.

### 3.3 `POST /api/v1/admin/pricing-rules/preview` — dry price preview
**Auth:** `pricing.write`. Computes the effect of a rule (saved or unsaved) **without persisting** — powers the studio's live before/after strip. The single source of price truth (same engine as §3.1), so the preview never disagrees with what publishes.

**Request:**
```json
{
  "rule": { "scopeType":"vendor","adjustmentType":"percentage","adjustmentValuePct":20,"floorFraction":0.5,"targets":{"vendorSlugs":["aspose"]},"audience":"public" },
  "sampleSlugs": ["aspose-pdf-for--net","aspose-total-for--net"],
  "at": "2026-07-01T00:00:00Z"
}
```
**Response:**
```json
{
  "data": {
    "affectedCount": 86,
    "samples": [
      { "slug":"aspose-pdf-for--net","name":"Aspose.PDF for .NET",
        "base":{"amountMinor":87000,"currency":"GBP"},
        "final":{"amountMinor":69600,"currency":"GBP"},
        "display":"~~£870~~ £696","clampedToFloor":false },
      { "slug":"docconverter","name":"DocConverter",
        "base":{"amountMinor":null,"currency":null},"final":{"amountMinor":null,"currency":null},
        "display":"Contact us","skipped":"poa" }
    ],
    "warnings": [ { "code":"FLOOR_CLAMPED","count":0 }, { "code":"POA_SKIPPED","count":1 } ]
  }
}
```

### 3.4 `GET /api/v1/offerings/{slug}/price?tier=<slug>&qty=<n>` — computed price for a tier
**Public** (tier requires entitlement). Returns the `price` block for the offering (and per-variant) for the given audience/quantity, so a logged-in buyer or the studio's "preview as tier" sees the resolved quote price. `qty` informs `minOrderQty` validation only (no checkout). Identical engine to §3.1.

---

## 4. Catalogue — admin CRUD (offerings, variants, vendors, categories, media)

**Auth:** `offering.write` for create/update, `offering.publish` for status changes. All writes carry `If-Match`/`rowVersion` (§0.10), write `audit_log`, soft-delete (never hard-delete). Draft→publish: catalogue entities use `status` + `published_at`; public reads see only `published`.

### 4.1 Offerings
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `GET` | `/api/v1/admin/offerings` | `offering.read` | as §2.1 but unfiltered by status; `filter[status]=draft\|published\|archived`, `filter[type]`, `filter[vendor]`, includes `draft` + `deleted_at IS NULL`. |
| `GET` | `/api/v1/admin/offerings/{idOrSlug}` | `offering.read` | full editable record incl. `rowVersion`, draft fields. |
| `POST` | `/api/v1/admin/offerings` | `offering.write` | create. Body below. `type:"product"` requires `vendorId`; `type:"service"` forbids it (mirrors `chk_product_has_vendor`/`chk_service_no_vendor`). |
| `PATCH` | `/api/v1/admin/offerings/{id}` | `offering.write` | partial update; `If-Match`. |
| `POST` | `/api/v1/admin/offerings/{id}/publish` | `offering.publish` | `status→published`, sets `published_at`. |
| `POST` | `/api/v1/admin/offerings/{id}/unpublish` | `offering.publish` | `status→draft`. |
| `POST` | `/api/v1/admin/offerings/{id}/archive` | `offering.publish` | `status→archived`. |
| `DELETE` | `/api/v1/admin/offerings/{id}` | `offering.write` | soft-delete. |

**Create/update body:**
```json
{
  "type": "product",
  "vendorId": "…",
  "categoryId": "…",
  "slug": "aspose-pdf-for--net",
  "name": "Aspose.PDF for .NET",
  "shortDescription": "Create, edit and convert PDF in .NET.",
  "description": "…overview…",
  "platforms": [".NET"],
  "tags": ["Aspose","PDF",".NET"],
  "featured": true,
  "fulfilment": "license",
  "status": "draft",
  "attributes": {},
  "seo": { "metaTitle":"Aspose.PDF for .NET | Greatstone", "metaDescription":"…", "socialImage": null },
  "primaryImageId": "…",
  "rowVersion": 3
}
```
`slug` is the upsert/business key (unique per org). `fromPrice*` is **derived** (cheapest active variant) and read-only via the API — recomputed on variant change, never set directly. Specs and gallery are managed via their own endpoints (4.2/4.4) or the bulk importer (§5).

**Errors:** `409 conflict` duplicate slug or stale `rowVersion`; `422` type/vendor invariant violation, unknown vendor/category, bad enum.

### 4.2 Variants (editions) — `offering_variants`
| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/admin/offerings/{id}/variants` | list editions in `sortOrder`. |
| `POST` | `/api/v1/admin/offerings/{id}/variants` | create. Unique on `(offering_id, sku, license_type, billing_period)` (`uq_variant_edition`). |
| `PATCH` | `/api/v1/admin/variants/{id}` | update (price, name, licenseType, billingPeriod, minOrderQty, listDiscountPct). |
| `DELETE` | `/api/v1/admin/variants/{id}` | soft-delete. |
| `PUT` | `/api/v1/admin/offerings/{id}/variants:reorder` | `{ orderedIds: [...] }` set `sortOrder`. |

**Variant body** (money as pair; `basePriceMinor:null` ⇒ POA):
```json
{ "sku":"ASPOSE-230", "name":"Developer Small Business",
  "licenseType":"Developer Small Business - Single Developer, Single Location",
  "platform": null, "billingPeriod":"perpetual",
  "basePriceMinor": 87000, "currency":"GBP", "minOrderQty":1, "listDiscountPct":0, "rowVersion":1 }
```
**Validation:** `(basePriceMinor IS NULL) == (currency IS NULL)`; `minOrderQty ≥ 1`; `listDiscountPct ∈ [0,100]`; `billingPeriod` ∈ the enum. Editing any variant price triggers recompute of the parent's `fromPrice` cache.

### 4.3 Vendors & categories
Standard CRUD on `vendors` and `categories` under `/api/v1/admin/vendors` and `/api/v1/admin/categories` (`offering.write`/`offering.publish`). Category create/update accepts `parentId` (cycle-guarded — self-parent or cycle → `422`). Both keyed on `(org, slug)` for upsert.

### 4.4 Media — `media_assets`, `offering_media`
| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/admin/media:upload-url` | `{ filename, mimeType, bytes, checksum }` → returns a **pre-signed PUT URL** + `assetId` (direct-to-object-store; the API never proxies binaries). Idempotent on `checksum` (dedupe). |
| `POST` | `/api/v1/admin/media` | finalise: `{ assetId, altText?, widthPx?, heightPx? }` → row in `media_assets`. |
| `GET` | `/api/v1/admin/media` | library list; `filter[mimeType]`, `q` on `altText`. |
| `DELETE` | `/api/v1/admin/media/{id}` | soft-delete (only if unreferenced, else `409`). |
| `PUT` | `/api/v1/admin/offerings/{id}/gallery` | `{ orderedAssetIds: [...] }` → replaces `offering_media` set + order. |

Uploads over the cap → `413 payload_too_large`. `bytes` and `checksum` are validated against the eventual object (the finalise step rejects a mismatch).

---

## 5. Bulk import / export (Excel·CSV round-trip)

The mass-edit spine: **export → bulk-edit in Excel → re-import as updates**, with **dry-run + diff + validation + rollback + audit + idempotent upsert**. Maps to `import_jobs` + `import_job_rows`. This is how "20% off all Aspose" or repricing 819 variants is done at scale.

### 5.1 Lifecycle
`uploaded → validating → validated → applying → applied` (or `failed`, or `rolled_back`). Each transition is a distinct, audited call. **Dry-run is the default**; nothing mutates until `commit`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/admin/imports` | `import.create` | create job `{ type, filename, dryRun:true }` → `import_jobs` row, returns `uploadUrl` (pre-signed) + `jobId`. `type ∈ offerings\|variants\|pricing\|vendors\|categories\|mixed`. |
| `POST` | `/api/v1/admin/imports/{id}/upload` | `import.create` | signals the file is uploaded; `{ sourceChecksum }`. Triggers async parse+validate. Idempotent on `sourceChecksum` (identical file → reuse job, refuse silent re-apply). |
| `GET` | `/api/v1/admin/imports/{id}` | `import.create` | job status + `diffSummary` + `errorSummary` (§5.2). Poll until `validated`/`failed`. |
| `GET` | `/api/v1/admin/imports/{id}/rows` | `import.create` | paginated `import_job_rows` with `raw`, `mapped`, `action`, `errors`, `before`, `after`. `filter[action]=insert\|update\|noop\|skip\|error`. |
| `PATCH` | `/api/v1/admin/imports/{id}/mapping` | `import.create` | set/adjust `columnMapping` (messy-header → schema field; often AI-proposed, §7). Re-validates. |
| `POST` | `/api/v1/admin/imports/{id}/commit` | `import.apply` | applies; `{ dryRun:false }`. Idempotent (`Idempotency-Key`). Wraps all writes under one `rollbackToken`. Returns the applied diff. |
| `POST` | `/api/v1/admin/imports/{id}/rollback` | `import.apply` | reverts every change tagged with the job's `rollbackToken` using row `before` snapshots. One click. |
| `DELETE` | `/api/v1/admin/imports/{id}` | `import.create` | discard a non-applied job. |

### 5.2 Diff / validation payload (`GET …/imports/{id}`)
```json
{
  "data": {
    "id":"…","type":"variants","status":"validated","dryRun":true,
    "filename":"aspose-reprice-2026Q3.xlsx","sourceChecksum":"sha256:…","totalRows":819,
    "columnMapping": { "SKU":"sku", "Edition":"name", "Price (GBP)":"basePriceMinor", "Term":"billingPeriod" },
    "diffSummary": {
      "inserts": 0, "updates": 812, "noops": 5, "skips": 0, "errors": 2,
      "byEntity": { "variant": { "updates":812, "noops":5, "errors":2 } }
    },
    "errorSummary": {
      "errors": [
        { "rowNumber": 41, "matchKey":"ASPOSE-230|Developer…|perpetual", "field":"basePriceMinor", "message":"Not an integer (got '£8,70.00')." },
        { "rowNumber": 118, "matchKey":"IRIS-12|…", "field":"currency", "message":"Unknown currency 'GPB'." }
      ]
    }
  }
}
```
- `basePriceMinor` from a spreadsheet may arrive as `£870.00` or `870` — the importer normalises to **minor units** and rejects un-coercible values per row (the row is `error`, the job still validates the rest). Money columns must resolve to an integer-minor + currency pair.
- A commit with outstanding `errors` requires explicit `{ "allowPartial": true }` (applies the valid rows, skips errored) else `422`.

### 5.3 Export
| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/admin/exports/offerings.csv?filter[vendor]=aspose` | streamed CSV/XLSX export of the current catalogue (round-trips back through import). Columns are the import schema (so export→edit→import is lossless). `?format=xlsx\|csv`. Money exported as minor units **and** a human `£` column (read-only) for editor convenience; the minor-unit column is authoritative on re-import. |
| `GET` | `/api/v1/admin/exports/variants.csv` | all editions with stable `sku|licenseType|billingPeriod` match key columns. |
| `GET` | `/api/v1/admin/exports/pricing.csv` | rules export. |

**Errors:** `413` oversize upload; `422` bad `type`/mapping/partial-without-flag; `409 unprocessable_state` commit on a non-`validated` or already-`applied`/`rolled_back` job; `409 idempotency_conflict` on key reuse.

---

## 6. Quotes / inquiries (the browse-and-enquire core)

No checkout. CTAs deep-link to a quote/trial enquiry; the **enquiry basket** is an explicit multi-item quote request, not a cart. Maps to `quotes` + `quote_items`. Line items snapshot name + computed price so the quote is immutable even if the catalogue later changes.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/quotes` | **public** (rate-limited, captcha-gated) | create a quote from a product page or the enquiry basket. Body below. Idempotent on `Idempotency-Key`. Emits `quote.created` webhook (§8). |
| `GET` | `/api/v1/admin/quotes` | `quote.read` | sales inbox; `filter[status]`, `filter[assignedTo]`, `filter[source]`, `q` on contact. |
| `GET` | `/api/v1/admin/quotes/{id}` | `quote.read` | full quote + items + applied rules. |
| `PATCH` | `/api/v1/admin/quotes/{id}` | `quote.write` | update `status` (`new→contacted→quoted→won\|lost\|cancelled`), `assignedTo`, notes; `If-Match`. Illegal transition → `409 unprocessable_state`. |

**Create body** (mirrors the legacy `inquiries` shape `{type, product_slug, variant_sku?, vendor, name, email, company, message}`, extended for multi-item + applied-rule capture):
```json
{
  "source": "enquiry_basket",
  "type": "quote",
  "contact": { "name":"Jane Buyer", "email":"jane@acme.com", "company":"Acme Ltd", "phone":"+44…" },
  "message": "Need 5 developer seats, perpetual.",
  "tier": null,
  "items": [
    { "offeringSlug":"aspose-pdf-for--net", "variantSku":"ASPOSE-230", "qty":5 },
    { "offeringSlug":"docconverter", "qty":1 }
  ],
  "utm": { "source":"product_page" }
}
```
**Server behaviour:** resolves each item's offering/variant, recomputes the **winning rule** at capture time, and **snapshots** `offeringName`, `variantName`, `listPriceMinor`, `capturedPriceMinor`, `appliedRuleId`, `currency` into `quote_items` (so the advertised offer is honoured even after it ends). `indicativeTotalMinor` is the sum of captured prices (POA items contribute nothing and are flagged). Generates `reference` (`Q-2026-000123`). **No payment, no licence issuance** — those are an explicit, separate, future order flow (§ below), never faked here.

**Response:** the created `quote` with `reference`, items (with snapshots), and `indicativeTotalMinor` clearly labelled indicative/quote-only.

> **Orders** (`orders`/`order_items`) exist in the schema for completeness and a future quote→order conversion, but **checkout is out of scope**. There is **no** `POST /orders` that moves money or issues a licence in v1. Any order endpoint, if exposed, is admin-only quote conversion with **no payment fields** — the contract refuses to fake payment.

---

## 7. AI-assisted operations (Claude)

Propose → human preview → admin approve → apply. **Never auto-applies destructive changes.** Maps to `ai_actions`; destructive AI ops that mutate the catalogue materialise as an `import_job` (so they inherit dry-run/diff/rollback/audit).

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/admin/ai-actions` | `ai.propose` | create a proposal. Body below. Runs the model, returns `status:"proposed"` + `proposedChanges` diff. **Never mutates.** |
| `GET` | `/api/v1/admin/ai-actions/{id}` | `ai.propose` | proposal + full before/after diff for preview. |
| `GET` | `/api/v1/admin/ai-actions/{id}/diff` | `ai.propose` | paginated `proposedChanges` (`[{entity,id,before,after}]`). |
| `POST` | `/api/v1/admin/ai-actions/{id}/approve` | `ai.approve` (**admin/owner if `isDestructive`**) | sets `approvedBy`/`approvedAt`, then applies (idempotent). For destructive kinds, applies **via** a generated `import_job` (full rollback). `chk_ai_approved`: cannot reach `applied` without `approvedBy`. |
| `POST` | `/api/v1/admin/ai-actions/{id}/reject` | `ai.propose` | `{ reason }` → `status:"rejected"`. |

**Create body:**
```json
{
  "kind": "bulk_edit",
  "prompt": "Apply 20% off all Aspose products and tidy their short descriptions to two sentences.",
  "targetEntity": "offering",
  "targetFilter": { "vendor": "aspose" }
}
```
`kind ∈ bulk_edit | mapping | description_gen | seo_gen | dedupe | cleanup | other`. The `mapping` kind powers the importer's messy-header → schema mapping (returns a `columnMapping` proposal for §5.1). `description_gen`/`seo_gen` propose copy for human edit. `dedupe`/`cleanup` are flagged `isDestructive:true` and require admin approval. The response always includes `isDestructive` and a reversible plan; **the human is always the gate**.

**Errors:** `403` if non-admin approves a destructive action; `409 unprocessable_state` approving an already-applied/rejected action; `422` unknown `kind`/`targetEntity`.

---

## 8. Content pages (Puck) + publish

The studio pages. Maps to `content_pages` + `page_versions` + `page_status_history`. Draft (`draftData`) and live (`publishedData`) side by side; **public reads `publishedData`**; editor reads `draftData`. Versioned for point-in-time restore.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/content/pages/{slug}` | **public** | returns `publishedData` (the live Puck tree) + `seo`. `''` slug = home. |
| `GET` | `/api/v1/admin/pages` | `content.write` | list pages + status/drift. |
| `GET` | `/api/v1/admin/pages/{id}` | `content.write` | full record incl. `draftData`, `publishedData`, `rowVersion`. |
| `POST` | `/api/v1/admin/pages` | `content.write` | create `{ slug, title, draftData, seo }`. |
| `PATCH` | `/api/v1/admin/pages/{id}` | `content.write` | save draft (`draftData`, `seo`, `background`); `If-Match`. Each save MAY snapshot a `page_versions` row. |
| `POST` | `/api/v1/admin/pages/{id}/publish` | `content.publish` | copy `draftData → publishedData`, set `published_at`, write `page_status_history`. |
| `POST` | `/api/v1/admin/pages/{id}/unpublish` | `content.publish` | `status→draft`. |
| `GET` | `/api/v1/admin/pages/{id}/versions` | `content.write` | `page_versions` list (newest first). |
| `POST` | `/api/v1/admin/pages/{id}/versions/{versionNo}/restore` | `content.write` | restore a snapshot into `draftData` (publish separately). |
| `DELETE` | `/api/v1/admin/pages/{id}` | `content.publish` | soft-delete. |

**`draftData`/`publishedData`** are the Puck `{ root, content }` JSON trees, passed through verbatim. SEO is `{ metaTitle, metaDescription, socialImage }`. Publishing is admin-gated and audited.

---

## 9. Audit log

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/admin/audit` | `user.manage` (or `*.read` per entity) | the universal before/after trail (`audit_log`). `filter[entity]`, `filter[entityId]`, `filter[actorId]`, `filter[action]`, `filter[rollbackToken]`, date range. Read-only, append-only, never editable. |

Each entry: `{ id, actor:{id,label}, entity, entityId, action, before, after, context:{importJobId?,aiActionId?,rollbackToken?,ip}, at }`. Every mutation in §1–§8 writes one. The `rollbackToken` filter groups an import/AI batch for one-click revert lineage.

---

## 10. Webhooks

Outbound events for sales/ops integrations (CRM, Slack, email). Subscriptions are admin-managed; deliveries are signed and retried.

### 10.1 Delivery contract
- `POST` to the subscriber URL with JSON body below. Header `X-GS-Signature: sha256=<hmac>` (HMAC-SHA256 of the raw body with the subscription secret) — verify before trusting. `X-GS-Event`, `X-GS-Delivery` (uuid), `X-GS-Request-Id`.
- **At-least-once** delivery; consumers must dedupe on `id`. Retries with exponential backoff (1m, 5m, 30m, 2h, 6h) on non-2xx, up to 24h. A `deliveries` log is queryable by admins.

### 10.2 Events
| Event | Fires when | Payload `data` |
|---|---|---|
| `quote.created` | a quote is submitted (§6) | the full `quote` resource (reference, contact, items with snapshots, indicativeTotalMinor, source). |
| `quote.status_changed` | sales updates a quote status | `{ quoteId, reference, from, to, actor }`. |
| `import.completed` | an import `commit` finishes (or fails) | `{ jobId, type, status, diffSummary, rollbackToken, by }`. |
| `import.rolled_back` | a job is rolled back | `{ jobId, rollbackToken, by }`. |
| `pricing_rule.activated` / `.deactivated` | a rule goes live / is pulled | `{ ruleId, name, scopeType, affectedCount, by }`. |
| `ai_action.applied` | an approved AI op applies | `{ aiActionId, kind, importJobId?, by }`. |
| `page.published` | a content page publishes | `{ pageId, slug, by }`. |

**Envelope:**
```json
{
  "id": "evt_01J8Z…",
  "type": "quote.created",
  "createdAt": "2026-06-17T09:31:00Z",
  "org": { "id":"…", "slug":"greatstone" },
  "data": { "reference":"Q-2026-000123", "...": "..." }
}
```

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET/POST/DELETE` | `/api/v1/admin/webhooks` | `user.manage` | manage subscriptions `{ url, events[], secret, active }`. |
| `GET` | `/api/v1/admin/webhooks/{id}/deliveries` | `user.manage` | delivery log + replay. |

---

## 11. Endpoint index (quick reference)

| Domain | Method · Path | Auth |
|---|---|---|
| Session | `GET /api/v1/me` | authed |
| Users | `GET/POST/PATCH/DELETE /api/v1/admin/users…`, `…/invite`, `…/roles/permissions` | `user.manage` |
| Catalogue (public) | `GET /api/v1/offerings`, `…/offerings/{slug}`, `…/offerings/{slug}/price`, `…/vendors`, `…/categories`, `…/catalogue/index` | none |
| Pricing | `GET/POST/PATCH/DELETE /api/v1/admin/pricing-rules…`, `…/activate`, `…/preview` | `pricing.write` / `pricing.publish` |
| Catalogue (admin) | `…/admin/offerings…`, `…/variants…`, `…/vendors…`, `…/categories…`, `…/media…`, publish/archive | `offering.write` / `offering.publish` |
| Import/Export | `…/admin/imports…` (create/upload/rows/mapping/commit/rollback), `…/admin/exports/*.csv` | `import.create` / `import.apply` |
| Quotes | `POST /api/v1/quotes`, `…/admin/quotes…` | public / `quote.read` `quote.write` |
| AI | `…/admin/ai-actions…` (create/diff/approve/reject) | `ai.propose` / `ai.approve` |
| Content | `GET /api/v1/content/pages/{slug}`, `…/admin/pages…`, versions, publish | public / `content.write` `content.publish` |
| Audit | `GET /api/v1/admin/audit` | `user.manage` |
| Webhooks | `…/admin/webhooks…`, deliveries | `user.manage` |

---

## 12. Reviewer's rubric (how to grade the agency's Sprint-1 against this)

A conformant backend MUST:
1. Return the **error envelope** (§0.8) with `type`/`requestId`/`fields` — not Laravel's default `{message, errors}` bag — on the JSON surface. `X-Request-Id` on every response.
2. Represent **all money** as integer minor units + currency, `BIGINT`-safe (the £12,534,195 outlier round-trips losslessly), with `null` = POA and the both-or-neither rule enforced.
3. Enforce **org scoping** from the session/JWT (never a param), with cross-org reads returning `404`.
4. Enforce **optimistic concurrency** (`rowVersion`/`If-Match` → `409`/`412`) and **idempotency keys** on mutations.
5. Implement the **single-winner, floor-clamped, never-negative, never-POA** pricing engine identically across list/detail/variant/preview/quote-snapshot (§3.1).
6. Provide the import **dry-run → diff → commit → rollback** lifecycle with idempotent upsert on the stable keys (§0.9), and round-trippable export.
7. Gate **AI apply** behind human approval (`chk_ai_approved`), with destructive ops admin-only and materialised as reversible import jobs.
8. **Never** expose a checkout/payment endpoint or a password field; quotes are enquiries, orders are future quote-conversions with no faked payment.
9. Write an **audit_log** row for every mutation and emit the **webhooks** in §10.
10. Honour **draft→publish** with public reads scoped to `published`/`publishedData`.

Anything that fakes auth, fakes payment, stores price as a string, lets a rule produce a negative or sub-floor price, applies an AI change without approval, or commits an import without a rollback path is a **contract violation**.
