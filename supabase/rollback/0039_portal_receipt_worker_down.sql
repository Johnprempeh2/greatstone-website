-- Rollback of 0039_portal_receipt_worker.sql (GRE-1256). Removes only the three functions 0039 adds; no data.
-- Run it before 0038's and 0037's rollbacks. Unschedule the worker first if John scheduled it (0037's rollback also does).
--
-- Run in one transaction:  psql "$DB_URL" -1 -f supabase/rollback/0039_portal_receipt_worker_down.sql

DROP FUNCTION IF EXISTS portal_receipt_document(uuid);
DROP FUNCTION IF EXISTS portal_claim_receipt_jobs(integer);
DROP FUNCTION IF EXISTS portal_is_approver();
