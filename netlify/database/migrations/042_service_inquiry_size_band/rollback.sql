-- Rollback for 042_service_inquiry_size_band: nothing to undo. The size band column belongs to 001_enquiry_inbox
-- (its rollback removes the whole table). Dropping the column here would also drop anon's INSERT grant on it,
-- and every contact form save would then fail.
SELECT 1;
