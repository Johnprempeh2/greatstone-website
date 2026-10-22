# GRE-1967 staging check

These screenshots compare the store before this change with the staging deploy after it, at 1440 px and 390 px. Both views stop before the price cards.

- `before-desktop.png`, `before-phone.png`: the GRE-1795 staging deploy, which showed the catalogue as offline without Supabase settings.
- `after-desktop.png`, `after-phone.png`: the GRE-1967 staging deploy with 2 synthetic public offerings in Netlify Database.

The staging fixture was isolated under organisation slug `gre1967-fixture`. It contained no customer or staff records and was deleted after the checks. The temporary seed, migration and cleanup functions were removed from the final staging deploy and are absent from this branch.

Migration 043 removes the redundant `offerings_tenant_isolation` policy. Migration 004's safe `org_isolation` policy and migration 005's `public_read` policy remain. The rollback script restores the old policy name with the safe organisation helper; it does not change data.

The Netlify CLI `--no-build` deploy did not apply migration 043 to the existing staging database. It was applied there separately before the browser checks. The public release process must apply migration 043 before publishing the new function.
