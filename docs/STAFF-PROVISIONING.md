# Staff provisioning

How a Greatstone team member gets an account that can sign in and run the site (the CMS editor, the
Catalogue, orders, licence keys). One account already exists; this documents the repeatable process so
production staff are set up the same way every time, and gives you a check that catches the usual mistakes
before launch rather than after.

## How staff sign-in works

A staff member authenticates as a **Supabase Auth user** (email + password). The app then maps that session
to a **`public.users` profile row** by matching `auth_subject` to the Auth user's id (`auth.uid()`), and reads
the profile's `org_id` and `role`. The `app_staff_org()` function (migration 0004) only treats a user as staff
when the profile is active, not soft-deleted, and has an editing role. So a working account needs **both** halves,
correctly linked:

1. an Auth user (the credential), and
2. a `public.users` row with `auth_subject` = that Auth user's id, `org_id` = the Greatstone org, a valid `role`,
   `is_active = true`, `deleted_at = NULL`.

Miss the link, the role or the org and the person either can't sign in or signs in with no powers. That failure
is invisible until they try, which is why the verifier below exists.

## Roles

The org roles (`org_role` enum) and what they can do in the CMS (`src/cms/staffRoles.mjs` is the single source
of truth):

| Role   | Edit | Publish | Manage users | Notes                                  |
|--------|------|---------|--------------|----------------------------------------|
| owner  | ✓    | ✓       | ✓            | Full control.                          |
| admin  | ✓    | ✓       | ✓            | Full control.                          |
| editor | ✓    | ✗       | ✗            | Edits + proposes; an admin publishes.  |
| sales  | ✗    | ✗       | ✗            | Read-only; no console surface today.   |
| viewer | ✗    | ✗       | ✗            | Read-only; no console surface today.   |

Keep at least one active **owner or admin** so staff and publishing can always be managed.

Canonical Greatstone org id: `11111111-1111-4111-8111-111111111111`.

## Provision a new staff member

Two steps, because the credential and the profile live in different places.

1. **Create the Auth user.** Supabase dashboard → Authentication → Users → Add user (email + a temporary
   password, or send an invite). Copy the new user's **User UID**. Do this in the dashboard, not in code, so no
   password ever touches the repo.

2. **Create the profile row**, linking it to that UID. Run against the project (SQL editor, or psql with the
   pooled connection):

   ```sql
   insert into public.users (org_id, email, full_name, role, auth_subject, is_active)
   values (
     '11111111-1111-4111-8111-111111111111',   -- Greatstone org
     'person@greatstonesoftware.co.uk',         -- must match the Auth user's email
     'Full Name',
     'admin',                                    -- owner | admin | editor | sales | viewer
     'PASTE-THE-AUTH-USER-UID-HERE',             -- auth_subject = auth.uid()
     true
   )
   on conflict (org_id, email) do update
     set role = excluded.role,
         auth_subject = excluded.auth_subject,
         is_active = true,
         deleted_at = null;
   ```

   The `on conflict` clause makes it re-runnable: fixing a role or a broken link is the same statement.

**Change a role:** `update public.users set role = 'editor' where email = '…' and org_id = '111…';`

**Off-board someone:** `update public.users set is_active = false, deleted_at = now() where email = '…';` then
disable or delete their Auth user in the dashboard so the credential is gone too.

## Verify before launch

`scripts/verify-staff.mjs` reads `public.users` (and the Auth user list when reachable) and checks every account
for the faults above. It writes nothing and exits non-zero on any blocking error, so it can gate a cutover.

```
node --env-file=.env scripts/verify-staff.mjs         # full check (DB + Auth cross-check)
node --env-file=.env scripts/verify-staff.mjs --no-auth # DB only, if the Auth admin API isn't reachable
```

Needs `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in the environment (server-side
only, never the client bundle). npm shortcut: `npm run verify:staff`.

It flags, as **errors** (block launch): a profile with no `auth_subject` (can never sign in), an unrecognised
role, the wrong org, a duplicate `auth_subject` or email, a profile pointing at a missing Auth user, and the
case where no active owner/admin exists. As **warnings**: an inactive account, a soft-deleted row that still
looks live, an Auth user with no profile (would sign in with "no role assigned"), and a profile/Auth email
mismatch. The rules live in `src/lib/staff-provision.mjs` and are unit-tested; run `npm test` to exercise them
without a database.
