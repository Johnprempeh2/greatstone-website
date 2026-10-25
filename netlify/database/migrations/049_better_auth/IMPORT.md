# GRE-1991 staging identity import

This is a one-time, reviewed data migration for `gre1795-website-db-staging`.
It is separate from the site's request handlers. The eight source records arrive
through the approved `GS_STAFF_EXPORT` secret after John approves access. Never
put the export or the owner connection in a deploy, issue, log or repository file.

## Run order

1. Confirm migration 048 (`gsam_bridge`) is applied, then apply schema
   migrations 049 (`better_auth`) and 050 (`staff_user_writes`) to staging through
   the reviewed migration process. Confirm all three appear in the
   `netlify.migrations` log before importing. The last applied staging migration
   was 047 on 24 October, before Ridge's 048 owner run.
2. Use a trusted, one-time migration environment with the staging site's owner
   `NETLIFY_DB_URL`. Outside a deploy, the available connection is read-only and
   cannot perform this import. The runner must set `NETLIFY_SITE_NAME` to
   `gre1795-website-db-staging` and `SITE_ID` to the staging site ID. The script
   also checks that PostgreSQL reports `netlifydb_owner` before any write. Do
   not make an HTTP endpoint or add this step to a site build command.
3. Read `access.GS_STAFF_EXPORT` into run scratch with restrictive permissions.
   Pipe it to `node netlify/database/migrations/049_better_auth/import-users.mjs`
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
`auth.users` rows by hand. Migration 049 has its own schema rollback, which
must not run after anyone has signed in without restoring that snapshot.

For production, obtain a fresh export and change the fixed count only in a
separate reviewed release. The staging export covers eight users; the source
now has ten.
