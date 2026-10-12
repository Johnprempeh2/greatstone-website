-- 0040_service_inquiry_size_band.sql — the enquiry form's "How many people work there?" answer (GRE-970,
-- copy GRE-652 §4.6). Needs 0023 and 0035.
--
-- One nullable column for the size band the visitor picked (today: Under 10 / 11 to 50 / 51 to 250 / More than
-- 250; editors can reword the options, so the value is text, not an enum). It qualifies the enquiry; it is not
-- a pricing tier (board direction GRE-1354). Nothing else changes: same RLS (staff_all), no new grants, the
-- public rpc is untouched. Before this is applied the edge function saves the enquiry without the band and the
-- owner alert still carries it.
-- Re-runnable (IF NOT EXISTS).
-- Rollback: supabase/rollback/0040_service_inquiry_size_band_down.sql (drops the column and its check; the
-- other columns and the rows stay).

ALTER TABLE service_inquiries ADD COLUMN IF NOT EXISTS size_band text;

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS chk_inquiry_size_band;
ALTER TABLE service_inquiries ADD CONSTRAINT chk_inquiry_size_band CHECK (char_length(coalesce(size_band, '')) <= 40);
