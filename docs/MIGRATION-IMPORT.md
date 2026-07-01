# Legacy store data migration

How we bring the existing greatstonesoftware.co.uk store's customers, orders and order history into the new
Supabase database, once Ben supplies an export of the old data. The tooling is built and tested; it just
needs the export file and the production database credentials to run.

## What it does

Reads a single JSON export of the old store and writes it into our schema:

- each **company** becomes a `customers` row, and each person on it a `customer_users` row;
- each **order** becomes an `orders` row plus `order_items`, marked as migrated (its reference is
  `legacy:<id>`, so it carries no Stripe session, and its provenance is stamped in metadata);
- any **historical licence keys** attached to an order become `licence_keys` rows the customer can see.

It is **idempotent**: companies upsert on their slug and orders on their reference, both derived from the
legacy id, so re-running the same export updates in place rather than creating duplicates. Order line items
are fully derived from the export, so they are replaced on each run.

## How a migrated customer reclaims their account

The import brings across each customer's **email**, not a password (the old site's passwords don't transfer).
So a migrated customer has an order history but **no login yet**. The reclaim path is built in and needs no
extra step at import time:

- The customer **creates an account** on the new site with the **same email** they used before. On sign-up (and
  every sign-in) the app calls `ensure_customer_account`, which re-links an existing `customer_users` row by
  email and stamps it with the new auth user. They immediately see their migrated orders.
- "Sign in" and "Forgot password" both dead-end for them (there's no auth user to match yet), so the customer
  sign-in screen carries a hint telling returning buyers to **create an account with the same email**.

**Launch comms must say "create your account with the same email you used before", not "we've made you an
account" or "reset your password".** Getting this wrong (e.g. importing auth users, or telling people to sign
up with a different address) is what orphans a customer from their own history. The go-live smoke test verifies
it: create an account for a known migrated email and confirm the historical orders appear.

## The export format

One JSON file. Amounts are in **minor units** (pence) via the `*_minor` fields; if that is inconvenient, the
importer also accepts major amounts (`unit_price`, `line_total`, `subtotal`, `total`) and multiplies by 100.
A working sample is in `scripts/legacy-export.sample.json`.

```jsonc
{
  "org_id": "11111111-1111-4111-8111-111111111111",   // optional; defaults to the Greatstone org

  "customers": [
    {
      "legacy_id": "1042",                 // the old system's stable id (used for idempotency)
      "company": "Northwind Trading Ltd",  // required: the account/company name
      "domain": "northwind.co.uk",         // optional
      "currency": "GBP",                   // optional
      "notes": "…",                        // optional
      "users": [                           // the people on this account (first is primary unless flagged)
        { "email": "jane@northwind.co.uk", "full_name": "Jane Fowler", "phone": "…", "is_primary": true }
      ]
    }
  ],

  "orders": [
    {
      "legacy_id": "50231",                // required: the old order id (becomes reference "legacy:50231")
      "customer_legacy_id": "1042",        // links to a customer above; if unknown, the order imports unlinked
      "buyer_email": "jane@northwind.co.uk",
      "reference": "GS-2023-0042",         // optional human reference from the old system (kept for display)
      "status": "completed",               // mapped to our statuses (paid→confirmed, completed→fulfilled, …)
      "currency": "GBP",
      "placed_at": "2023-05-01T10:15:00Z",
      "items": [
        { "offering_name": "Aspose.Total for .NET", "variant_name": "Developer", "qty": 1, "unit_price_minor": 239900 },
        { "offering_name": "IronPDF", "qty": 2, "unit_price": 499.00 }   // major amount, converted
      ],
      "licence_keys": [                     // optional; only imported onto orders that are linked to a customer
        { "offering_name": "Aspose.Total for .NET", "licence_key": "…", "download_url": "https://…" }
      ]
    }
  ]
}
```

Notes:
- `subtotal`/`total` are optional; if omitted they are summed from the line items.
- An unknown or blank order `status` defaults to `confirmed` (a migrated historical order was paid, so never
  `pending`).
- A licence key requires a linked customer (the schema enforces it), so historical keys on unlinked orders
  are skipped with a warning.

## How to run

Always dry-run first — it validates every record and reports the plan without writing anything:

```bash
node scripts/migrate-legacy-store.mjs ./ben-export.json --dry-run
```

The dry-run also flags **duplicate idempotency keys** — two customers that derive the same slug, or two orders
that derive the same reference. Because the import upserts on those keys, duplicates would silently merge into
one row (data loss). If any are reported, de-duplicate the source export before applying; the importer will
**refuse to apply** while duplicates remain.

Then apply, with the target project's credentials in the environment (server-side only, never the client
bundle):

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
node scripts/migrate-legacy-store.mjs ./ben-export.json
```

or, keeping them in a local env file:

```bash
node --env-file=.env scripts/migrate-legacy-store.mjs ./ben-export.json
```

The service-role key bypasses row-level security for the import; treat it as a secret and do not commit it.
Re-running the same export is safe (it upserts on slug/reference).

## After importing

- Migrated orders appear in the catalogue admin (Orders) and in each customer's account, marked as migrated
  (no Stripe session).
- Customers do NOT get a login automatically. On the new site they sign up with the same email; because the
  buyer email is stored, their historical orders and keys link to their account once auth is wired to match
  on email (a small follow-up when the production auth + email domain are live).

## Status

- [x] Transform + validation + idempotency logic (`src/lib/legacy-migrate.mjs`) with unit tests.
- [x] Importer CLI with `--dry-run` (`scripts/migrate-legacy-store.mjs`), verified against the sample.
- [ ] Run against Ben's real export into the production database (waiting on the export + prod credentials).
- [ ] Post-import: link migrated orders to accounts by email once production auth/email are live.
