-- Port of supabase/migrations/0018_licence_key_download.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0018_licence_key_download.sql — an optional download link per licence key.
-- A software customer needs two things to get going: the activation code AND where to download the
-- installer. Staff can attach a download URL (vendor portal / direct link) to a key; the customer sees a
-- "Download" button next to "Copy" on their account. Additive + RLS-unchanged (customer reads it via the
-- existing customer_self SELECT on licence_keys, 0017).
ALTER TABLE licence_keys ADD COLUMN IF NOT EXISTS download_url TEXT;
ALTER TABLE licence_keys DROP CONSTRAINT IF EXISTS chk_licence_download_url;
ALTER TABLE licence_keys ADD CONSTRAINT chk_licence_download_url
  CHECK (download_url IS NULL OR download_url ~* '^https?://');
