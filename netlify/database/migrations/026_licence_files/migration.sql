-- Port of supabase/migrations/0024_licence_files.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0024_licence_files.sql — deliver a licence as a FILE (.lic), not only a key string.
--
-- Some products (Aspose, GroupDocs, et al.) activate with a `.lic` licence FILE that the staff issuer
-- uploads on the order, alongside or instead of a key string (Ben, 1 Jul technical review). This adds a
-- PRIVATE Storage bucket for those files, the columns linking a licence_keys row to its stored file, and
-- RLS so a buyer downloads ONLY their own file (via a short-lived signed URL) while staff of the org
-- upload, replace, or remove. Mirrors the licence_keys model from 0017: staff manage, the buyer reads.
--
-- Apply with the rest of the migrations (supabase db push / migrate up). The bucket and its policies are
-- created here, so there is no dashboard step. No secrets. Safe to re-run (idempotent).

-- 1) columns: where the file lives + its original name (used as the download filename)
ALTER TABLE licence_keys ADD COLUMN IF NOT EXISTS file_path TEXT;   -- object path within the 'licence-files' bucket
ALTER TABLE licence_keys ADD COLUMN IF NOT EXISTS file_name TEXT;   -- original filename shown to the buyer

-- 2) a licence may now be delivered by FILE alone, so relax the NOT NULL on the key string. Keep the row
--    honest: require at least one real delivery mechanism (a key, a file, or a download link).
ALTER TABLE licence_keys ALTER COLUMN licence_key DROP NOT NULL;
ALTER TABLE licence_keys DROP CONSTRAINT IF EXISTS chk_licence_has_delivery;
ALTER TABLE licence_keys ADD CONSTRAINT chk_licence_has_delivery
  CHECK (licence_key IS NOT NULL OR file_path IS NOT NULL OR download_url IS NOT NULL);

-- Defense in depth: pin the stored path to the row's OWN customer folder, so the customer-scoping
-- invariant does not live only in the Storage policy. A file_path must be NULL or begin with
-- '<customer_id>/'. (UUID text has no LIKE wildcards, so this is an exact prefix match.)
ALTER TABLE licence_keys DROP CONSTRAINT IF EXISTS chk_licence_file_path_scope;
ALTER TABLE licence_keys ADD CONSTRAINT chk_licence_file_path_scope
  CHECK (file_path IS NULL OR file_path LIKE customer_id::text || '/%');

-- 3) the private bucket. No public read; access is only via signed URLs gated by the policies below.
--    5 MB ceiling — a .lic file is a few KB, so this is generous headroom, not a real limit.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('licence-files', 'licence-files', false, 5242880)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880;

-- 4) Storage RLS on the objects in this bucket. Path convention (set by the client): the FIRST path
--    segment is the owning customer's id, e.g. '<customer_id>/<uuid>-<filename>.lic'. That segment is
--    what scopes a buyer's reads. storage.objects already has RLS enabled by Supabase; we add
--    bucket-scoped policies. Reference the public helper functions used by the licence_keys policies.
--
--    Staff of the org manage the bucket (they issue every licence). NOTE: this grants any active staff
--    user access to the whole bucket. Today there is a single live org, so that equals "their org's
--    files". If Greatstone goes multi-org, tighten the folder check to the staff member's own org.
DROP POLICY IF EXISTS licence_files_staff_all ON storage.objects;
CREATE POLICY licence_files_staff_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'licence-files' AND public.app_staff_org() IS NOT NULL)
  WITH CHECK (bucket_id = 'licence-files' AND public.app_staff_org() IS NOT NULL);

--    A buyer may READ only objects under their own customer-id folder (SELECT only, no buyer write).
--    createSignedUrl from the browser checks this SELECT policy, so a buyer can mint a link only for
--    their own file; another company's path fails the folder match even if its path were known.
DROP POLICY IF EXISTS licence_files_customer_read ON storage.objects;
CREATE POLICY licence_files_customer_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'licence-files'
    AND public.app_customer_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.app_customer_id()::text
  );
