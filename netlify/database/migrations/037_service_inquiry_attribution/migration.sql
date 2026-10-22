-- Port of supabase/migrations/0035_service_inquiry_attribution.sql (GRE-1795). Unchanged.
--
-- Netlify: 001_enquiry_inbox already has what this adds; here it changes nothing (IF NOT EXISTS, CREATE OR REPLACE
-- with the same bodies). Kept so each Supabase migration has its port.

-- 0035_service_inquiry_attribution.sql — the contact form's enquiries in service_inquiries (GRE-654, release
-- plan GRE-638 rev 2 §3.4). Needs 0023.
--
-- The contact form (BookDeepDive) now saves through the `enquiry` edge function with the service role, so
-- a lead is not lost when the visitor's email app does not open. 0023 has no place for the first/last-touch
-- attribution (src/lib/analytics.js), the industry answer, or a record that the owner alert went. These three
-- columns add that. Nothing else changes: same RLS (staff_all), no new grants, the public rpc is untouched.
-- Contact-form rows have source = 'contact' and services = '[]'.
--
-- Before this is applied the edge function still saves the enquiry without these columns (and puts the
-- attribution in the alert email), so applying it is not urgent for a lead to be kept.
-- Re-runnable (IF NOT EXISTS).
-- Rollback (drops only what this adds; rows stay):
--   ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS chk_inquiry_extra;
--   ALTER TABLE service_inquiries DROP COLUMN IF EXISTS alert_sent_at, DROP COLUMN IF EXISTS industry, DROP COLUMN IF EXISTS attribution;

ALTER TABLE service_inquiries
  ADD COLUMN IF NOT EXISTS attribution   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { first, last, page }: utm_*, landing, referrer, at
  ADD COLUMN IF NOT EXISTS industry      text,
  ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz;

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS chk_inquiry_extra;
ALTER TABLE service_inquiries ADD CONSTRAINT chk_inquiry_extra CHECK (
  jsonb_typeof(attribution) = 'object' AND char_length(coalesce(industry, '')) <= 80);
