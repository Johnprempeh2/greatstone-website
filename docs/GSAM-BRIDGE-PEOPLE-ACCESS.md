# Bridge contract: people and access (GRE-4082)

GRE-4079 step 3a. The website half of "people and access in GSAM": staff roles, portal approvers and client company
members. GSAM's half is step 3b (Mason, GRE-4085).

`contracts/` is vendored from `gs-agentic-manager` and hash-checked, so this section is not edited there by hand.
Step 3b copies the section below into GSAM's `contracts/gs-bridge-v1/README.md`, then vendors the folder back with
`node contracts/check.mjs --vendor`. Until then this file is the contract both sides build to.

Code: `netlify/functions/admin-bridge.mjs` (reads), `netlify/functions/lib/admin-bridge-write.mjs` (`accessRoute`),
`netlify/database/migrations/066_bridge_people_access`. Tests: `netlify/tests/admin-bridge-access.test.mjs`.

---

## People and access (GRE-4082)

Signed as above. Reads use a `read` key. Changes use a `write` key with the `gs-bridge-v2` idempotency key, as every
write route does. A retry with the same key and body gets the same answer and changes nothing.

### Who may change access

Every change below is **people only**. The actor must be `user:<id>`. An `agent:` or `system:` actor gets
`403 { "error": { "code": "denied" } }`. The refusal is audited and nothing changes. The site function refuses
first, and the database refuses again, reading the actor from the audit row and not from the request. This holds
until John answers on GRE-4079 which access changes an agent may make. Reads are open to any actor.

The acting GSAM actor (`X-GS-Bridge-Actor`, and `X-GS-Bridge-Run` when given) is stored on the audit row of every
call. Each change also stores the row before and after it, linked to that audit row.

### Reads

| Route | Answer |
|---|---|
| `GET /api/admin/v1/access/staff` | `{ items: [Staff], nextCursor: null }`, by email |
| `GET /api/admin/v1/access/portal-approvers` | `{ items: [Approver], nextCursor: null }`, oldest first |
| `GET /api/admin/v1/access/clients/:customerId/members` | `{ items: [Member], nextCursor: null }`, oldest first. `404 not_found` when the client organisation is not this site's, or is deleted |

They take no query parameters (`400 bad_request`). Each list is one page; `nextCursor` is always `null`.

```
Staff    { "id", "email", "name", "role": "owner" | "admin" | "editor" | "sales" | "viewer", "isActive",
           "canSignIn", "portalApprover", "lastLoginAt", "updatedAt" }
Approver { "staffId", "email", "name", "label", "staffActive", "addedAt" }
Member   { "membershipId", "organisationId", "userId" | null, "email", "name", "role": "admin" | "member",
           "isPrimary", "createdAt", "updatedAt" }
```

`id` and `staffId` are the website's staff id. `organisationId` is the website's client organisation (a `customers`
row), the same id `POST /customers/:id/users` uses. `userId` is the client's sign-in id, or `null` for a contact
with no sign-in.

### Changes (write key, people only)

| Route | Body | Answer |
|---|---|---|
| `PATCH /api/admin/v1/access/staff/:staffId` | `{ "role" }` | `200 { item: Staff }` |
| `PUT /api/admin/v1/access/portal-approvers/:staffId` | `{ "label" }`, 1 to 100 characters | `201 { item: Approver }` when added, `200` when it was there (the label is updated) |
| `DELETE /api/admin/v1/access/portal-approvers/:staffId` | none | `200 { "staffId", "removed": true }` |
| `POST /api/admin/v1/access/clients/:customerId/members` | `{ "email", "name", "role" }` | `201 { item: Member }` when added, `200` when already a member with that role |
| `PATCH /api/admin/v1/access/clients/:customerId/members/:membershipId` | `{ "role" }` | `200 { item: Member }` |
| `DELETE /api/admin/v1/access/clients/:customerId/members/:membershipId` | none | `200 { "membershipId", "organisationId", "removed": true }` |

Rules the site holds:

- **Staff role.** The organisation always keeps one active owner. Moving the last active owner to another role is
  `409 conflict`. The same role again is `200` and changes nothing. Staff are not added or removed here.
- **Portal approver.** Only live, active staff of this organisation who have a sign-in can be an approver. Otherwise
  the answer is `409 conflict`, or `404 not_found` for an unknown staff id or one in another organisation. Removing
  someone who is not an approver is `404`. Approving and publishing a document still needs the approver's own
  website sign-in (039); being listed here does not let GSAM publish.
- **Client member, add.** This makes the sign-in (no password; the person signs in from the reset or verification
  email) and the membership, as `POST /customers/:id/users` does. A staff email is `409`. A person who already
  belongs to another client organisation is `409`. Someone who is already a member with another role is `409`
  (change the role with `PATCH`).
- **Client member, change role or remove.** The membership must belong to the client organisation in the path.
  If not, the answer is `404`. Remove ends the membership: the person keeps their sign-in but no longer sees the
  company. Adding them again later links the same membership.

Errors are `{ "error": { "code" } }` only: `bad_request` (400), `denied` (403: an agent or system actor),
`capability_denied` (403: not a write key), `not_found` (404), `conflict` (409), `idempotency_mismatch` (409), and
the signing errors above.

### Not covered here

- `POST /api/admin/v1/customers/:id/users` (GRE-2631) still lets an agent create a client sign-in and membership. This
  route is older than this change and is not changed by it. Whether an agent keeps that right depends on John's
  answer on GRE-4079.
