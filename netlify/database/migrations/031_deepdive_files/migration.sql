-- Port of supabase/migrations/0029_deepdive_files.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0029 — documents attached to an item, made durable.
--
-- The manifest used to live inside the state JSON and the bytes in a folder on one laptop, so an
-- attachment made in production was written to a dev endpoint that does not exist there and fell
-- through to this-browser-only storage. The row said Attached and nothing was kept.

CREATE TABLE IF NOT EXISTS public.deepdive_files (
  slug          citext NOT NULL REFERENCES public.deepdive_plans(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  id            text NOT NULL CHECK (id ~ '^a:[0-9a-f]{12}$'),  -- content-addressed: sha256, 12 hex
  org_id        uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- What the PRACTITIONER typed. This is the name a client would ever see.
  label         text NOT NULL CHECK (length(btrim(label)) > 0),
  -- ⚠ THE UPLOADER'S OWN FILENAME. NEVER PUT THIS IN A CLIENT-FACING PAYLOAD.
  -- A name off a practitioner's disk ("GCB_vs_Ecobank_pricing_draft.xlsx") says things the record
  -- deliberately does not. In the old design it lived in a sidecar only the download route read;
  -- here it is a column the client-facing selects must never name, and the app's own reads do not.
  original_name text,
  mime          text,
  ext           text,
  bytes         bigint,
  -- one blob, many ties: the same document attached to two items is not two uploads
  attached_to   text[] NOT NULL DEFAULT '{}',
  visibility    text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','shared')),
  note          text NOT NULL DEFAULT '',
  by            text,
  actor         jsonb,
  at            timestamptz NOT NULL DEFAULT now(),
  storage_path  text NOT NULL,
  PRIMARY KEY (slug, id)
);
CREATE INDEX IF NOT EXISTS deepdive_files_org ON public.deepdive_files (org_id);

ALTER TABLE public.deepdive_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deepdive_files FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.deepdive_files FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deepdive_files TO authenticated;
DROP POLICY IF EXISTS staff_all ON public.deepdive_files;
CREATE POLICY staff_all ON public.deepdive_files FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- ── the bytes ────────────────────────────────────────────────────────────────────────────────
-- PRIVATE, and it can hold exactly ONE content type: application/octet-stream. Everything is
-- uploaded under that type whatever it really is, and what it really is lives in the table, sniffed
-- from its own bytes by the shared sniffer. So there is no path by which this bucket serves
-- something a browser would execute, even if a URL to it ever escaped. The old file endpoint got
-- there by always ANSWERING octet-stream; this gets there at the store instead of at the reader,
-- which is the half that does not depend on remembering to set a header.
-- Verified: text/html and image/svg+xml are both refused with invalid_mime_type on the same path
-- that accepts octet-stream.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('deepdive-files', 'deepdive-files', false, 26214400, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 26214400, allowed_mime_types = ARRAY['application/octet-stream'];

-- Staff of the owning org only, and the first path segment must be a record that org actually has,
-- so a staff member cannot read or write under a slug belonging to somebody else's tenant.
DROP POLICY IF EXISTS deepdive_files_staff ON storage.objects;
CREATE POLICY deepdive_files_staff ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'deepdive-files'
    AND (storage.foldername(name))[1] IN (
      SELECT p.slug::text FROM public.deepdive_plans p WHERE p.org_id = app_staff_org())
  )
  WITH CHECK (
    bucket_id = 'deepdive-files'
    AND (storage.foldername(name))[1] IN (
      SELECT p.slug::text FROM public.deepdive_plans p WHERE p.org_id = app_staff_org())
  );

-- Same default as 0028, for the same reason: the caller never sends it and must not have to.
ALTER TABLE public.deepdive_files ALTER COLUMN org_id SET DEFAULT app_staff_org();
