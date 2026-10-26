-- Rollback for 055_interview_data_rights. Drops the deletion records and the anonymised themes copies, and the
-- quote choices. The 'quotes' consent_kind value stays (Postgres cannot drop an enum value); rows that use it are
-- kept. Export deletion_record first if the proof of past deletions must be kept.
SET LOCAL search_path TO interview, public;
DROP TABLE IF EXISTS anonymised_themes;
DROP TABLE IF EXISTS deletion_record;
DROP TRIGGER IF EXISTS trg_consent_event_append_only ON consent_event;
DROP FUNCTION IF EXISTS consent_event_append_only();
DROP TRIGGER IF EXISTS trg_consent_event_fill ON consent_event;
DROP FUNCTION IF EXISTS consent_event_fill();
-- Consent rows whose invite was deleted cannot point at an employee again; they go with the rollback.
DELETE FROM consent_event WHERE employee_id IS NULL;
DROP TRIGGER IF EXISTS trg_consent_event_scope ON consent_event;
CREATE TRIGGER trg_consent_event_scope BEFORE INSERT OR UPDATE ON consent_event
  FOR EACH ROW EXECUTE FUNCTION scope_from_employee();
ALTER TABLE consent_event DROP CONSTRAINT consent_event_employee_id_fkey;
ALTER TABLE consent_event ADD CONSTRAINT consent_event_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE CASCADE;
ALTER TABLE consent_event ALTER COLUMN employee_id SET NOT NULL;
DROP INDEX IF EXISTS idx_consent_event_engagement_id;
ALTER TABLE consent_event DROP COLUMN IF EXISTS engagement_id, DROP COLUMN IF EXISTS choice;
-- employee_scope: back to 054 (user_id set once, never cleared)
CREATE OR REPLACE FUNCTION employee_scope() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_customer uuid;
  v_user     text;
BEGIN
  IF tg_op = 'UPDATE' THEN
    PERFORM scope_immutable('employee', 'customer_id', old.customer_id::text, new.customer_id::text);
    IF old.user_id IS NOT NULL THEN
      PERFORM scope_immutable('employee', 'user_id', old.user_id, new.user_id);
    END IF;
  END IF;
  SELECT customer_id INTO v_customer FROM engagement WHERE id = new.engagement_id;
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'employee: engagement % does not exist', new.engagement_id USING ERRCODE = '23503';
  END IF;
  PERFORM scope_match('employee', 'customer_id', new.customer_id::text, v_customer::text);
  new.customer_id := v_customer;
  IF new.person_id IS NOT NULL THEN
    SELECT auth_user_id INTO v_user FROM person WHERE person_id = new.person_id;
    IF v_user IS NOT NULL THEN
      PERFORM scope_match('employee', 'user_id', new.user_id, v_user);
      new.user_id := v_user;
    END IF;
  END IF;
  RETURN new;
END;
$$;
ALTER TABLE employee DROP COLUMN IF EXISTS quote_choice;
DROP FUNCTION IF EXISTS deletion_due_at(timestamptz, timestamptz, int, date);
ALTER TABLE engagement DROP COLUMN IF EXISTS synthesis_stale_at, DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS retention_days;
