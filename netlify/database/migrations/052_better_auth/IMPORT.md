# GRE-1991 staging identity import

This is a one-time, reviewed data migration for `gre1795-website-db-staging`.
It is separate from the site's request handlers. The eight source records arrive
through the approved `GS_STAFF_EXPORT` secret after John approves access. Never
put the export or the owner connection in a deploy, issue, log or repository file.

## Run order

1. Confirm migrations 048 (`gsam_bridge`), 049 (`gsam_bridge_commerce`),
   050 (`deep_dive_client`) and 051 (`deep_dive_answer_status`) are applied.
   Then apply 052 (`better_auth`) and 053 (`staff_user_writes`) to staging through
   the reviewed migration process. Confirm all six appear in the
   `netlify.migrations` log before importing.
2. Use a trusted, one-time migration environment with the staging site's owner
   `NETLIFY_DB_URL`. Outside a deploy, the available connection is read-only and
   cannot perform this import. The runner must set `NETLIFY_SITE_NAME` to
   `gre1795-website-db-staging` and `SITE_ID` to the staging site ID. The script
   also checks that PostgreSQL reports `netlifydb_owner` before any write. Do
   not make an HTTP endpoint or add this step to a site build command.
3. Read `access.GS_STAFF_EXPORT` into run scratch with restrictive permissions.
   Pipe it to `node netlify/database/migrations/052_better_auth/import-users.mjs`
   for the rollback-only dry run. If that succeeds, repeat with `--apply`. Do
   not echo the input or enable shell tracing. Remove the scratch file in the
   same run, including on error. The script prints only a count.
4. Query the eight imported IDs and credential-account count through the
   reviewed migration connection, then test sign-in, email verification, reset
   and RLS on staging. Confirm the runtime connection role can run
   `BEGIN; SET LOCAL ROLE auth_server; SELECT current_user; ROLLBACK;` and that
   `current_user` is `auth_server` before calling `/api/auth/*`. Record counts
   and outcomes only, not emails or hashes.

The script rejects a different site, a missing owner connection, a non-owner
database role, a count other than eight, duplicate identities, malformed
bcrypt hashes, or a mismatch with a previous import. Dry run rolls back. Apply
commits one transaction. A failed apply rolls back. To undo an applied import,
restore the staging snapshot taken before the import; do not delete shared
`auth.users` rows by hand. Migration 052 has its own schema rollback, which
must not run after anyone has signed in without restoring that snapshot.

Each site in `SITES` (`netlify/functions/lib/owner-import.mjs`) carries its
reviewed `identityCount`; an export of any other size is refused before any
write. Staging takes eight (the GRE-1991 export). The rehearsal site and
`greatstone-home` take ten: Supabase `auth.users` held ten rows, all with a
password, on 3 Nov 2026 (GRE-2567). If the source count changes before the
cut-over, change that number in its own reviewed release.

For the rehearsal and the cut-over, `scripts/supabase-export.mjs export --out
<run scratch>` writes both importer inputs (`identities.json`, `tables.json`)
and `counts.json` from one read-only Supabase snapshot, mode 0600. It needs
`SUPABASE_DB_URL` and prints counts only. `counts` prints the same counts and
writes nothing, for the before, after and catch-up checks.

The catch-up (cut-over step 7) is `export --since <step 4 export dir> --out
<new run scratch dir>`. The importer refuses rows that already exist, so it
writes only the rows whose primary key is not in the step 4 export.
`identities.json` is written only when new users appeared. It then holds every
user, because the importer checks an exact count, so the site's
`identityCount` must change to that number in a reviewed release first. A row
changed or removed since step 4 (same key, different values, or gone) stops it
for a person: it prints the table names and counts and writes nothing.
`--since` must name the full step 4 export, not an earlier catch-up.

The Supabase pooler's certificate chains to Supabase's own root, so a plain
`sslmode=require` URL fails with `SELF_SIGNED_CERT_IN_CHAIN`. Keep the check on:
add `sslmode=verify-full&sslrootcert=<run scratch>/prod-ca-2021.crt` (Supabase
Root 2021 CA, SHA-256 `80:70:25:AD:…:CA:FA`). Never use `no-verify`.

Two Netlify-only migrations added columns to `service_inquiries` (042
`size_band`, 057 `customer_id`). Supabase rows do not have them, so the runner
writes NULL there (`NEW_ON_TARGET` in `lib/owner-import.mjs`). Any other
missing column still refuses. After a table apply, the runner recounts through
the read-only role. That role is under RLS and sees no rows on client tables,
so where `count(*)` differs it checks Postgres's live-row statistics instead.
