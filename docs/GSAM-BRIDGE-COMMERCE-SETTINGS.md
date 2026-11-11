# Bridge contract: commerce settings (GRE-4782)

GRE-4079 step 5a. The website half of "every website admin setting in GSAM" for the commerce settings the bridge
could not write yet. GSAM's half is step 5b (Mason, GRE-4783).

`contracts/` is vendored from `gs-agentic-manager` and hash-checked, so this section is not edited there by hand.
Step 5b copies the section below into GSAM's `contracts/gs-bridge-v1/README.md`, then vendors the folder back with
`node contracts/check.mjs --vendor`. Until then this file is the contract both sides build to.

Code: `netlify/functions/lib/admin-bridge-write.mjs` (`settingsRoute`), `netlify/functions/admin-bridge.mjs`,
`netlify/database/migrations/072_bridge_commerce_settings`. Tests: `netlify/tests/admin-bridge-settings.test.mjs`.

---

## Commerce settings (GRE-4782)

Signed as above. Every route here is a change and uses a `write` key with the `gs-bridge-v2` idempotency key. A
retry with the same key and body gets the same answer and changes nothing. A `read` key gets
`403 capability_denied`; an unknown kid gets `401 bad_key`.

The acting GSAM actor (`X-GS-Bridge-Actor`, and `X-GS-Bridge-Run` when given) is stored on the audit row of every
call, with the outcome. Each change also stores the row before and after it, linked to that audit row, except:
a licence key is never stored in the log, and enquiries and front door leads log only their status and row version
(they hold personal data; a deleted lead leaves no copy).

### Who may do what

**People only** (John, 5 Nov: anything that emails a client, changes money, or issues or revokes a licence key goes
through a person's approval card in GSAM, like refunds). The actor must be `user:<id>`. An `agent:` or `system:`
actor gets `403 { "error": { "code": "denied" } }`; the refusal is audited and nothing changes. The site refuses
first and the database refuses again, reading the actor from the audit row. GSAM shows the agent's request as an
approval card and calls the route as the person who approves it.

- the licence-issued email; a portal receipt "send again"
- issuing a licence; changing its `licenceKey` or `downloadUrl`; revoking or re-issuing it
- setting a client's `tierId` (it sets the client's prices), on create or edit
- sharing or unsharing a timeline item; editing or deleting an item that is shared (the client sees it)
- deleting a front door lead (personal data)

Everything else is a plain status or record edit that any actor may make.

### Routes

`(P)` = people only. `v` = optional `expectedRowVersion`: when given and stale, `409 conflict`.

| # | Setting | Route | Body | Answer |
|---|---|---|---|---|
| 1 | Order status | `PATCH /api/admin/v1/orders/:id` | `{ "status", v }`, status `pending`, `confirmed`, `fulfilled` or `cancelled` | `200 { item: Order }` (as `GET /orders/:id`) |
| 1 | Licence-issued email (P) | `POST /api/admin/v1/orders/:id/notify-licence` | none | `200 { item: Order, email }` |
| 2 | Enquiry or lead status | `PATCH /api/admin/v1/enquiries/:id` | `{ "status", v }`, status `new`, `contacted` or `closed` | `200 { item: { id, status, rowVersion, updatedAt } }` |
| 2 | Lead delete (P) | `DELETE /api/admin/v1/enquiries/fd-:uuid` | none | `200 { "id", "deleted": true }` |
| 3 | Client company, create | `POST /api/admin/v1/customers` | `{ "name", slug?, domain?, billingCurrency?, notes?, tierId? (P) }` | `201 { item: Customer }` |
| 3 | Client company, edit | `PATCH /api/admin/v1/customers/:id` | any of the same, `v` | `200 { item: Customer }` |
| 4 | Timeline item, add | `POST /api/admin/v1/customers/:id/engagements` | `{ "title", kind?, summary?, bodyHtml?, externalUrl?, occurredOn?, phase?, ownerName?, attendees?, tags?, pinned? }` | `201 { item: Engagement }`, always a draft |
| 4 | Timeline item, edit | `PATCH /api/admin/v1/engagements/:id` | any of the same, `v` (P when shared) | `200 { item: Engagement }` |
| 4 | Timeline item, delete | `DELETE /api/admin/v1/engagements/:id` | `v` only (P when shared) | `200 { item: Engagement }` (soft delete) |
| 4 | Share, unshare (P) | `POST /api/admin/v1/engagements/:id/share` and `/unshare` | `v` only | `200 { item: Engagement }`, status `shared` or `draft` |
| 5 | Licence, issue (P) | `POST /api/admin/v1/customers/:id/licences` | `{ "offeringName", licenceKey? \| downloadUrl?, orderId?, variantName?, seats?, expiresAt?, notes? }` | `201 { item: Licence }` |
| 5 | Licence, edit | `PATCH /api/admin/v1/licences/:id` | any of the same but `orderId`, `v` (P for `licenceKey`, `downloadUrl`) | `200 { item: Licence }` |
| 5 | Licence, revoke, re-issue (P) | `POST /api/admin/v1/licences/:id/revoke` and `/reissue` | `v` only | `200 { item: Licence }` |
| 6 | Customer tier, create | `POST /api/admin/v1/customer-tiers` | `{ "slug", "name", rank?, description? }` | `201 { item: Tier }` |
| 6 | Customer tier, edit | `PATCH /api/admin/v1/customer-tiers/:id` | any of the same (no row version on tiers: last write wins) | `200 { item: Tier }` |
| 7 | Receipt "send again" (P) | `POST /api/admin/v1/portal-acceptances/:id/resend` | none | `200 { item: { acceptanceId, status: "queued", attempts: 0, nextAttemptAt } }` |
| 8 | Activation steps | `PUT /api/admin/v1/vendors/:id/activation-steps` | `{ "activationSteps", "expectedRowVersion" }` | unchanged from GRE-3981; an agent changes only a draft vendor |
| 9 | Seat request, decide (P) | `POST /api/admin/v1/invite-requests/:id/decision` | `{ "decision" }`, `approve` or `decline` (073) | `200 { item: InviteRequest, member }`; approve adds the member as `POST /access/clients/:id/members` does and marks the request `provisioned`; a decided request is `409 conflict` |

```
Customer   { id, slug, name, tier_id, domain, billing_currency, notes, created_at, updated_at, row_version }
Engagement { id, customer_id, kind, status: "draft" | "shared" | "archived", title, summary, body_html, external_url,
             occurred_on, phase, owner_name, attendees, tags, pinned, created_at, updated_at, deleted_at, row_version }
Licence    { id, customer_id, order_id, offering_name, variant_name, licence_key_last4, has_download_url, file_name,
             seats, status: "issued" | "revoked" | "expired", delivered_at, expires_at, notes, created_at, updated_at,
             row_version }
Tier       { id, slug, name, rank, description, created_at, updated_at }
```

An answer never holds a licence key: `licence_key_last4` only.

### Reads added

- `GET /api/admin/v1/engagements[?customer=&updatedSince=&cursor=&limit=]` and `GET /engagements/:id`: the client
  timeline, as `Engagement` (live items only).
- `GET /customers` and `GET /licences` now include `row_version`, for `expectedRowVersion`.

### Rules the site holds

- **Order status.** `refunded` is not accepted (money moves through refund requests and the Stripe webhook). A
  `cancelled` or `refunded` order does not change status: `409`. The same status again is `200` and changes nothing.
- **Licence-issued email.** The order needs a customer email and at least one live, issued licence, else `409`.
  The email is sent after the change commits, never holds the key, and links the client to their account.
  `email` is `sent`, `not_sent` (Resend refused it; send again with a new idempotency key) or `not_configured`.
  A replay of the same call answers `email: "sending"` and sends nothing.
- **Enquiries.** `:id` is the id the enquiry reads use: `si-<uuid>` (service enquiry) or `fd-<uuid>` (front door
  lead). `contacted` also stamps a lead's last-contacted time. Only a front door lead can be deleted, for good; a
  service enquiry delete is `404`.
- **Client company.** With no slug, one is made from the name. A slug in use is `409`. A tier must be a live tier
  of this site, else `400`. Name and slug cannot be blank. Clients are not deleted here.
- **Timeline.** New items are drafts; `status` is not a body field (`400`): use share and unshare. A `deliverable`
  or `recap` needs `bodyHtml` or `externalUrl` (`400`). `externalUrl` is http(s). Duplicate is a create with the
  copied fields. The client sees only shared items.
- **Licences.** Issuing needs a `licenceKey` or a `downloadUrl` (`400`); an `orderId` must be this client's order
  (`400`). Revoking a revoked licence, or re-issuing an issued one, is `409`. A `.lic` file upload stays in the
  studio.
- **Receipt "send again".** Queues the same receipt job again (same Resend idempotency key). A receipt that was
  sent, or is sending, is `409`. The portal audit names the GSAM person.

Errors are `{ "error": { "code" } }` only: `bad_request` (400), `denied` (403: an agent or system actor on a
people-only change), `capability_denied` (403: not a write key), `not_found` (404, also another site's row),
`conflict` (409, with `current` for an order), `idempotency_mismatch` (409), and the signature errors as above.

### Admin parity round 2 (migration 073)

- `GET /api/admin/v1/invite-requests[?customer=&updatedSince=&cursor=&limit=]` and `GET /invite-requests/:id`:
  `{ id, customer_id, full_name, email, role, note, status: "pending" | "provisioned" | "declined", created_at, handled_at }`.
- `GET /api/admin/v1/quotes/:id/po-document` and `GET /orders/:id/po-document` (read key): the buyer's uploaded PO file,
  streamed from the private `po-documents` store as `application/octet-stream` with a `content-disposition` file name.
  `404 not_found` when there is none. Quotes now carry `po_document_name` and `has_po_document`; orders `has_po_document`.
- `GET /api/admin/v1/enquiries/fd-:uuid/agent-package` (read key): the lead's three agents as an Agent Companies
  package, `application/zip`. Front door enquiries carry `agentPackage: true` when there is one to download.
