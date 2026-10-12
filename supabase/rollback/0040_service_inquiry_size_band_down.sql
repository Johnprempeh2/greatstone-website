-- Rollback of 0040_service_inquiry_size_band.sql (GRE-970). Drops only the size band column and its check; every
-- enquiry row stays, without its size band. The edge function keeps working (it saves without the column).
--
-- Run in one transaction:  psql "$DB_URL" -1 -f supabase/rollback/0040_service_inquiry_size_band_down.sql

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS chk_inquiry_size_band;
ALTER TABLE service_inquiries DROP COLUMN IF EXISTS size_band;
