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
