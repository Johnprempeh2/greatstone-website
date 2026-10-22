-- Rollback for 025_service_inquiries. Removes only what it adds; 001's table, its grants and its rows stay.
DROP FUNCTION IF EXISTS submit_service_inquiry(jsonb, text, text, text, text);
DROP POLICY IF EXISTS staff_all ON service_inquiries;
REVOKE ALL ON service_inquiries FROM authenticated, service_role;
DROP TRIGGER IF EXISTS trg_fill_orphan_inquiries ON organisations;
DROP FUNCTION IF EXISTS fill_orphan_inquiries();
DROP TRIGGER IF EXISTS trg_fill_inquiry_org ON service_inquiries;
DROP FUNCTION IF EXISTS fill_inquiry_org();
ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_org_id_fkey;
