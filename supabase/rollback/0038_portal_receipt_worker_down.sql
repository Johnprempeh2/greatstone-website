-- Rollback of 0038_portal_receipt_worker.sql (GRE-1256). Removes only the two functions 0038 adds; no data.
-- Run it before 0037's rollback. Unschedule the worker first if John scheduled it (0037's rollback also does).
--
-- Run in one transaction:  psql "$DB_URL" -1 -f supabase/rollback/0038_portal_receipt_worker_down.sql

DROP FUNCTION IF EXISTS portal_claim_receipt_jobs(integer);
DROP FUNCTION IF EXISTS portal_is_approver();
