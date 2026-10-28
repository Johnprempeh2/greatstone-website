# GRE-3024 catalogue import package

This package prepares a fresh PR #140 staging database. It has not been run against a hosted database. The private source bundle remains at `/Users/johnprempeh/GSAM/catalogue-rebuild-20261028-codex/`; the GRE-3019 identity-map attachment supplies the service IDs and cross-checks product IDs. Neither file is committed here. The script pins SHA-256 digests for both the manifest and identity map, then checks every source file against the manifest. The complete GRE-3019 preflight records provenance, the corrected commercial canon (GRE-1358 v4 and GRE-1086 v10), and the protected-preview dependency.

## Planned rows

| Table | Source rows | Destination rows |
| --- | ---: | ---: |
| `vendors` | 10 | 10 |
| `categories` | 32 product + 9 service | 41 |
| `offerings` | 159 product + 78 service | 237 |
| `offering_variants` | 819 | 819 |
| `offering_specs` | 2,831 | 2,831 |

The importer reads product prices from the private snapshot at execution time. It copies the stored USD minor units, currency, null POA values, and one USD to GBP display rate without conversion. These are historical source values. Service records use deterministic IDs from the GRE-3019 identity map, with draft status, enquiry fulfilment, null numeric price, and no published source descriptions or claims. Existing public collection export and count/identity comparison remain in `next-proof/scripts/export-catalogue.mjs`; this package adds the missing database seed path.

## Run on the new protected staging branch only

1. Confirm GRE-3020's Git-connected preview route and release drainage. Record the new deploy ID, site ID, and actual database branch ID. Do not use the old `pr-140` branch, data, or alias.
2. Apply reviewed schema migrations to the new branch. Set a dedicated environment variable for **that branch's** database URL. Never use `DATABASE_URL` or `NETLIFY_DB_URL` for this script. Download the GRE-3019 identity map to a private local path.
3. Run the dry run with explicit expected host, database name and source organisation ID. Inspect the JSON receipt and verify the counts and conflict list. The dry run opens a transaction, checks the target and source, then rolls it back.
4. Run with `--apply --dry-run-receipt <dry-run.json>` and a new receipt path. Apply refuses a changed source, destination count, FX action or target. All rows, FX setting and provenance job commit in one transaction. Any error rolls the transaction back.
5. Re-run the dry run. All five tables and FX should report `noop`. Compare the published catalogue with `next-proof/scripts/export-catalogue.mjs` and its editor-import identity check before cutover.

Example argument shape, with placeholders instead of connection details:

```sh
node scripts/catalogue-rebuild.mjs \
  --bundle /private/catalogue-rebuild/ \
  --identity-map /private/catalogue-identity-map.json \
  --db-url-env GRE3024_STAGING_DB_URL \
  --expect-host <new-branch-host> --expect-db <new-branch-database> \
  --expect-org 11111111-1111-4111-8111-111111111111 \
  --receipt /private/catalogue-dry-run.json
```

The apply command uses the same arguments, a different `--receipt`, plus `--apply --dry-run-receipt /private/catalogue-dry-run.json`. Receipts contain counts and digests, not price rows or credentials. Keep them off the repository and attach a redacted receipt to the task after the staging run.

The script locks the affected tables and checks source digests, source relationships, destination IDs, slugs and non-null SKUs before upserting by source ID. The `import_jobs` row stores the combined package digest and provenance. Repeating a successful import does not create another job. If a previously applied source has drifted, apply aborts instead of overwriting it.

## Recovery and limits

Before commit, the rollback is automatic. After commit, use a new reviewed forward correction or discard the new isolated staging branch under GRE-3019's preview procedure. Do not run a compensating delete against a shared database. This package does not publish the services, certify historical product prices, create a preview, sign in as a user, or test hosted paths. Those remain on GRE-3019 after GRE-3020 supplies the protected route.
