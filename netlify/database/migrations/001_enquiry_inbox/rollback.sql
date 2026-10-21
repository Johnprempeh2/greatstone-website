-- Rollback for 001_enquiry_inbox. Drops the enquiry table and its rows: export them first. The `anon` role
-- stays (roles are cluster-wide and later migrations use it).
DROP TRIGGER IF EXISTS trg_inquiry_ip_purge ON service_inquiries;
DROP FUNCTION IF EXISTS trg_purge_inquiry_ips();
DROP FUNCTION IF EXISTS purge_inquiry_ips();
DROP FUNCTION IF EXISTS enquiry_mark_alerted(uuid);
DROP FUNCTION IF EXISTS enquiry_recent_count(text);
DROP TABLE IF EXISTS service_inquiries;
DROP FUNCTION IF EXISTS touch_row();
