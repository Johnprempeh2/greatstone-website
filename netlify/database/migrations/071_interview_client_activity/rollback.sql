-- Interview events already in the outbox stay (it is append-only). Close-out stops writing end_reason only once
-- lifecycle.mjs is rolled back too, so roll back the code first.
DROP TRIGGER IF EXISTS trg_session_client_activity ON interview.session;
DROP TRIGGER IF EXISTS trg_employee_client_activity ON interview.employee;
DROP TRIGGER IF EXISTS trg_session_end_reason_guard ON interview.session;
DROP FUNCTION IF EXISTS interview.client_activity_from_session();
DROP FUNCTION IF EXISTS interview.client_activity_from_employee();
DROP FUNCTION IF EXISTS interview.session_end_reason_guard();
ALTER TABLE interview.session DROP COLUMN IF EXISTS end_reason;
