-- Rollback for 075_service_inquiry_contact_role. Roll the enquiry function back to a version without contact_role
-- first: an insert that names a missing column fails, and the owner alert is then the only record of the lead.
-- Dropping the column drops anon's INSERT grant on it and the check with it; the other columns and the rows stay.
ALTER TABLE service_inquiries DROP COLUMN IF EXISTS contact_role;
