# GRE-2805 staging owner proof

This one-time check is limited to `gre1795-website-db-staging`. The existing
`owner-import` scheduled function supplies the owner-only connection. It compares
SHA-256 digests of each approved lowercase UUID, trimmed lowercase email and
unchanged bcrypt string against the committed Better Auth user and credential
account. It then creates one separate cost-10 bcrypt fixture for a staging sign-in.

Flint and Keystone must review the owner-run code and the exact staging deploy
before it is used. Do not repeat the eight-user identity import. Do not use the
production site or reset a staff password.

1. Read `access.GS_STAFF_EXPORT` directly into a mode-0600 file under
   `GSAM_RUN_SCRATCH_DIR`. Do not print it. Use
   `scripts/owner-proof-payload.mjs --source <export> --payload <payload> --credentials <credentials>`
   with all three paths under the same run scratch. The payload has digests and
   one fixture hash. The credentials file has the fixture email and generated
   password. Neither file belongs in the repository, an issue comment or a log.
2. After review and staging deploy approval, run
   `scripts/owner-import-run.mjs prepare --site gre1795-website-db-staging`.
   It confirms a staging snapshot and opens a bounded window. Deploy the reviewed
   code to that site through the guarded staging deploy path.
3. Submit the same payload twice with `--mode proof`, first
   `--action dry-run`, then `--action apply`. Proceed to apply only if all
   eight rows show `uuid`, `email` and `bcrypt` true. The dry run rolls back.
   The apply refuses a mismatch and commits only the isolated fixture. Repeating
   the same apply is a no-op.
4. Run `clear --site gre1795-website-db-staging` in the same run, including
   after an error. It removes the temporary window, payload, proof ledger and
   proof result. Remove the scratch files before the run ends. Record only the
   eight prefixes with pass/fail, the counts and the method on the issue.
   Put the fixture password into the approved secret route for Lintel; send
   Lintel the fixture identifier and secret reference on GRE-1991. Never put
   the password in a comment.

The proof reports no raw email, bcrypt string or password. A failed owner role
check or digest match leaves the fixture absent. The staging snapshot is the
rollback path if a committed fixture must be removed.
