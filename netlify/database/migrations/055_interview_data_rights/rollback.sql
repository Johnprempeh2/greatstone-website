-- Rollback for 055_interview_data_rights. Drops the deletion records and the anonymised themes copies, and the
-- quote choices. The 'quotes' consent_kind value stays (Postgres cannot drop an enum value); rows that use it are
-- kept. Export deletion_record first if the proof of past deletions must be kept.
SET LOCAL search_path TO interview, public;
DROP POLICY IF EXISTS participant_user_match ON employee;
DROP POLICY IF EXISTS participant_user_match ON person;
DROP FUNCTION IF EXISTS claim_user_id();
DROP TABLE IF EXISTS anonymised_themes;
DROP TABLE IF EXISTS deletion_record;
DROP TRIGGER IF EXISTS trg_consent_event_append_only ON consent_event;
DROP FUNCTION IF EXISTS consent_event_append_only();
DROP TRIGGER IF EXISTS trg_consent_event_fill ON consent_event;
DROP FUNCTION IF EXISTS consent_event_fill();
-- Consent rows whose invite was deleted cannot point at an employee again; they go with the rollback.
DELETE FROM consent_event WHERE employee_id IS NULL;
ALTER TABLE consent_event DROP CONSTRAINT consent_event_employee_id_fkey;
ALTER TABLE consent_event ADD CONSTRAINT consent_event_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE CASCADE;
ALTER TABLE consent_event ALTER COLUMN employee_id SET NOT NULL;
DROP INDEX IF EXISTS idx_consent_event_engagement_id;
ALTER TABLE consent_event DROP COLUMN IF EXISTS subject_email, DROP COLUMN IF EXISTS engagement_id, DROP COLUMN IF EXISTS choice;
DROP INDEX IF EXISTS idx_employee_auth_user_id;
ALTER TABLE employee DROP COLUMN IF EXISTS auth_user_id, DROP COLUMN IF EXISTS quote_choice;
DROP FUNCTION IF EXISTS deletion_due_at(timestamptz, timestamptz, int, date);
ALTER TABLE engagement DROP COLUMN IF EXISTS synthesis_stale_at, DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS retention_days;
