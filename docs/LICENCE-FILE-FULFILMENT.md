# Licence-file fulfilment — deploy handoff

Ben's 1 Jul requirement: some products (Aspose, GroupDocs, et al.) activate with a `.lic` licence **file**,
not a key string. Staff need to upload that file on the order; the buyer downloads it from their account.
This is built **deploy-ready**: the code is committed, but it needs a database migration to go live (it uses
a new Supabase Storage bucket, which the loop can't create or test). Nothing here has been deployed.

## What it does

- **Admin (Catalogue → Orders / Clients):** the "Issue a licence" drawer now takes a licence **key**, a
  licence **file** (`.lic`), a **download link**, or any combination. A licence needs at least one of the
  three. Files upload to a private Storage bucket scoped to the buyer's company.
- **Marking an order fulfilled** now sends the buyer the "your licences are ready" email (best-effort).
- **Customer account (`#account` → Licence keys):** a file-delivered licence shows a **Licence file ↓**
  button that mints a short-lived signed URL and downloads the file. File-only licences no longer render an
  empty key/Copy control.

## To deploy (in order)

1. **Apply the migration** `supabase/migrations/0024_licence_files.sql` (with the rest):
   ```
   supabase db push          # or your normal migrate-up
   ```
   It is idempotent and adds: the `licence_keys.file_path` / `file_name` columns; a relaxed `licence_key`
   (nullable) with a `chk_licence_has_delivery` check (key OR file OR link required); the **private**
   `licence-files` Storage bucket (5 MB ceiling); and the Storage RLS policies. No dashboard step, no secrets.
2. **Deploy the frontend** as usual (the committed `KeyEditor` / `LicenceKeys` / `OrdersManager` changes).
   The client build already passed here (561 tests, clean build).
3. **(Optional) the fulfilment email** — `markFulfilled` and key-issue both call the existing
   `notify-licence-issued` edge function. That only actually sends once the function is deployed with
   `RESEND_API_KEY` + `RESEND_FROM` (already tracked in `docs/AUTH-EMAILS.md`). Until then the status change
   and the file delivery work fine; the email just no-ops.

## Security model (why it is safe)

- The bucket is **private** (`public = false`); there is no public URL. Files are reached only via
  `createSignedUrl` (120s TTL).
- **Path convention:** `‹customer_id›/‹uuid›-‹filename›`. The first segment is the owning company's id.
- **RLS on `storage.objects`:** staff of the org manage the bucket; a buyer may read **only** objects under
  their own `customer_id` folder (`app_customer_id()` from their JWT). A buyer cannot mint a link for another
  company's file even if they knew the path. The email never carries the file or the key.

## Notes / decisions for you

- **Single "licences ready" email:** the buyer is emailed once, when you **mark the order fulfilled**. Issuing
  a key/file no longer emails on its own (it used to, which would have double-sent alongside mark-fulfilled).
  This matches Ben's flow: issue the licences, then mark fulfilled, and that is when the buyer is told. The
  key/file is visible on their account the instant you save it, email or not. If you would rather the email
  fire the moment a key is issued too, say so.
- **Failed saves and replaced files are cleaned up:** if a save fails after the file uploaded, the orphaned
  object is removed; replacing a file deletes the superseded one (both best-effort). No leaked private files.
- **Path is pinned to the customer in two places:** a DB CHECK (`chk_licence_file_path_scope`) requires
  `file_path` to start with the row's own `customer_id/`, and the Storage read policy scopes by the same
  folder. A buyer can only ever mint a link for their own file.
- **Multi-org:** the staff Storage policy grants any active staff user access to the whole bucket. Correct for
  the single live org today. If Greatstone goes multi-org, tighten the staff policy to the folder's own org.
- **File types:** the picker accepts `.lic/.txt/.xml/.dat/.key` and generic binary; the bucket caps size at
  5 MB. `.lic` files are a few KB, so this is headroom, not a real limit.
