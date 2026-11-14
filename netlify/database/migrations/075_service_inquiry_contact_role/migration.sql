-- 075_service_inquiry_contact_role: the enquiry form's required "Your role" answer (GRE-5194). Harbor's
-- qualified-enquiry rule (GRE-3579) counts an enquiry only when the person can buy, and the monthly KPI reading
-- (GRE-3580) checks it with `contact_role in ('owner_director', 'manager')`.
--
-- One nullable column with three fixed values. The form always sends one; null is an enquiry from an older page,
-- the calculators' lead tools or the services basket, which do not ask. The values are fixed (not editor text,
-- unlike size_band) because the KPI reads them. `anon` gets INSERT on the column so the contact form can save it;
-- nothing else changes (same RLS, the services-basket rpc is untouched).
-- Re-runnable (IF NOT EXISTS; the check is dropped and added back the same).
-- Rollback: rollback.sql in this folder. Roll the enquiry function back first: until then it names the column.

ALTER TABLE service_inquiries ADD COLUMN IF NOT EXISTS contact_role text;

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS chk_inquiry_contact_role;
ALTER TABLE service_inquiries ADD CONSTRAINT chk_inquiry_contact_role
  CHECK (contact_role IS NULL OR contact_role IN ('owner_director', 'manager', 'other'));

GRANT INSERT (contact_role) ON service_inquiries TO anon;
