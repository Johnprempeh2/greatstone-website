# Files and schedules on Netlify (GRE-1992)

Step 7 of the GRE-1703 plan. The site no longer reads Supabase: no browser client, no `VITE_SUPABASE_*`
variable, no Supabase CSP entry or redirect. `supabase/functions/_shared/*` stays as shared code that the
Netlify functions import; the legacy scripts (`seed-demo-*`, `migrate-legacy-store`, `verify-staff`,
`deepdive-import`) still target the old project and retire with it at cut-over.

## File stores

Bytes are in Netlify Blobs, one store per old bucket. The `storage.objects` index from 002 decides access: each
request opens a transaction, runs `SET LOCAL ROLE authenticated` with the person's claims, and reads or writes the
index row before it touches the bytes. No visible row, no bytes.

| Store | Function | Who, by policy |
| --- | --- | --- |
| `deepdive-files` | `/api/deepdive-file` | staff of the plan's org: upload, read, delete (0029) |
| `licence-files` | `/api/store-file?bucket=licence-files` | staff upload and delete; a buyer reads only their own customer folder (0024) |
| `po-documents` | `/api/request-quote` writes, `/api/store-file?bucket=po-documents` reads | the guest has no policy, so the worker role writes the index, as Supabase's service role did; staff read (0026) |
| `portal-files` | `/api/portal-mcp` writes, `/api/portal-file` reads | unchanged: the reader's `portal_documents` row under RLS. 0037 gives clients no policy on the index, so an index check would refuse every client. Open question for Ridge on GRE-1796. |

## Schedules

Netlify scheduled functions, run as the worker role (`service_role`, 002), never as the owner.

- `inquiry-ip-purge`, daily at 03:17 UTC: clears enquiry IPs older than 30 days (0036). Runs the same UPDATE as
  `purge_inquiry_ips()`, because the worker has no EXECUTE on that function (it was made in 001, before 002's grants).
- `portal-receipt-worker`, every minute: claims due receipt jobs and sends them through Resend (0039). Needs
  `RESEND_API_KEY`, `RESEND_FROM` and `PORTAL_RECEIPT_TO` on the site. The page no longer nudges it, so a receipt
  goes within about a minute.

## At cut-over (GRE-1796)

1. Copy each Supabase Storage object into its Blobs store under the same name, and insert its `storage.objects`
   row (bucket, name). Without the row a file stays invisible: that is the access check working.
2. Remove `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the site
   after the new build is live there. On staging they are still set until this branch is uploaded.
3. Turn off the Supabase cron jobs for the receipt worker and IP purge, so the two schedules do not both run.

## Rollback

No migration and no policy change, so the database needs nothing.

1. Revert this pull request and upload the previous build.
2. Put back the four Supabase variables on the site (the old build reads `VITE_SUPABASE_*` at build time).
3. Files written to Blobs after the switch are not in Supabase Storage: copy them back by the index rows
   (`SELECT bucket_id, name FROM storage.objects WHERE created_at > <switch time>`) before the old build serves them.
4. Turn the Supabase cron jobs back on.
