-- GRE-2653 (GRE-2639: interviews are personal data). Retention per round, the three-way quote choice, a consent log
-- that outlives the people it records, a deletion record and the anonymised themes copy a client keeps.
-- Spec: the `retention-rights-regions` document on GRE-2639.
--
--   * engagement.retention_days (default 90) and closed_at. Deletion date = coalesce(readout_at, closed_at) +
--     retention_days; the older retention_delete_after date, when set, still counts (whichever comes first).
--   * employee.quote_choice: 'none' | 'anonymous' | 'named'. NULL = not chosen, which is read as 'none'.
--   * consent_event keeps engagement_id of its own (customer_id and user_id come from 054), and employee_id is
--     SET NULL when the invite is deleted, so the consent log (kept 6 years, no content) survives the retention delete.
--   * deletion_record and anonymised_themes: system only, customer_id from the round, no names, no quotes, no user ids.
--   * The retention delete may clear employee.user_id on an invite it keeps (seat requests point at it).
--
-- Rollback: rollback.sql in this folder.

SET LOCAL search_path TO interview, public;

-- ── Retention per round ───────────────────────────────────────────────────────────────────────────
ALTER TABLE engagement ADD COLUMN retention_days int NOT NULL DEFAULT 90 CHECK (retention_days >= 0);
ALTER TABLE engagement ADD COLUMN closed_at timestamptz;
-- Marks the synthesis out of date after a participant deletes their data; a synthesis generated before it is
-- not released again.
ALTER TABLE engagement ADD COLUMN synthesis_stale_at timestamptz;

-- The date the round's interview data is deleted. NULL while there is no readout, close or legacy date yet.
CREATE FUNCTION deletion_due_at(p_readout timestamptz, p_closed timestamptz, p_days int, p_legacy date)
  RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = interview, public, pg_temp AS $$
  SELECT CASE
    WHEN coalesce(p_readout, p_closed) IS NULL THEN p_legacy::timestamptz
    WHEN p_legacy IS NULL THEN coalesce(p_readout, p_closed) + make_interval(days => p_days)
    ELSE least(coalesce(p_readout, p_closed) + make_interval(days => p_days), p_legacy::timestamptz)
  END $$;

-- ── Quote choice ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE employee ADD COLUMN quote_choice text CHECK (quote_choice IN ('none', 'anonymous', 'named'));

-- 'quotes' carries the three-way choice in consent_event.choice. Not used in this file (a new enum value cannot
-- be used in the transaction that adds it).
ALTER TYPE consent_kind ADD VALUE IF NOT EXISTS 'quotes';

-- employee.user_id is set once (054). The one change back: system claims clear it on an invite the retention delete
-- keeps for a seat request, together with the name and email.
CREATE OR REPLACE FUNCTION employee_scope() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_customer uuid;
  v_user     text;
BEGIN
  IF tg_op = 'UPDATE' THEN
    PERFORM scope_immutable('employee', 'customer_id', old.customer_id::text, new.customer_id::text);
    IF old.user_id IS NOT NULL AND NOT (new.user_id IS NULL AND new.person_id IS NULL AND is_system()) THEN
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

-- ── consent_event outlives the invite ─────────────────────────────────────────────────────────────
ALTER TABLE consent_event ADD COLUMN choice text CHECK (choice IS NULL OR choice IN ('none', 'anonymous', 'named'));
ALTER TABLE consent_event ADD COLUMN engagement_id uuid REFERENCES engagement(id) ON DELETE CASCADE;
UPDATE consent_event c SET engagement_id = e.engagement_id FROM employee e WHERE e.id = c.employee_id;
ALTER TABLE consent_event ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE consent_event DROP CONSTRAINT consent_event_employee_id_fkey;
ALTER TABLE consent_event ADD CONSTRAINT consent_event_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
CREATE INDEX idx_consent_event_engagement_id ON consent_event (engagement_id);

-- The 054 scope trigger (customer_id, user_id from the employee) now runs on insert only: the FK's SET NULL is an
-- update with no employee to read. engagement_id is filled from the employee too, so a caller cannot name another round.
DROP TRIGGER trg_consent_event_scope ON consent_event;
CREATE TRIGGER trg_consent_event_scope BEFORE INSERT ON consent_event
  FOR EACH ROW EXECUTE FUNCTION scope_from_employee();
CREATE FUNCTION consent_event_fill() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
BEGIN
  SELECT e.engagement_id INTO new.engagement_id FROM employee e WHERE e.id = new.employee_id;
  IF new.engagement_id IS NULL THEN
    RAISE EXCEPTION 'consent_event: employee % not found', new.employee_id USING ERRCODE = '23503';
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER trg_consent_event_fill BEFORE INSERT ON consent_event
  FOR EACH ROW EXECUTE FUNCTION consent_event_fill();
-- Append-only: the log is the proof. The one change: the owner's FK action setting employee_id to NULL.
CREATE FUNCTION consent_event_append_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
BEGIN
  IF current_user = 'interview_worker'
     OR new.employee_id IS NOT NULL
     OR (new.id, new.kind, new.value, new.ts, new.customer_id, new.user_id, new.choice, new.engagement_id)
        IS DISTINCT FROM (old.id, old.kind, old.value, old.ts, old.customer_id, old.user_id, old.choice, old.engagement_id) THEN
    RAISE EXCEPTION 'consent_event is append-only' USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER trg_consent_event_append_only BEFORE UPDATE ON consent_event
  FOR EACH ROW EXECUTE FUNCTION consent_event_append_only();

-- ── Deletion record: what was deleted, when. No names, no ids of people ───────────────────────────
CREATE TABLE deletion_record (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('retention', 'self_service')),
  counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- the engagement owner confirms the deletion to the client in writing (DPA 7.5)
  notified_at   timestamptz,
  customer_id   uuid NOT NULL  -- from the engagement (scope trigger)
);
CREATE INDEX idx_deletion_record_engagement_id ON deletion_record (engagement_id, created_at DESC);
CREATE INDEX idx_deletion_record_customer_id ON deletion_record (customer_id);

-- ── Anonymised themes: what the client keeps after the deletion date ──────────────────────────────
-- Theme labels, counts, time estimates, team roll-ups. No names, no quotes, no user or insight ids.
CREATE TABLE anonymised_themes (
  engagement_id   uuid PRIMARY KEY REFERENCES engagement(id) ON DELETE CASCADE,
  source_version  int,
  themes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  teams           jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  customer_id     uuid NOT NULL  -- from the engagement (scope trigger)
);
CREATE INDEX idx_anonymised_themes_customer_id ON anonymised_themes (customer_id);

-- ── Grants and row level security (as 054: system only, held to the call's customer when there is one) ──
REVOKE ALL ON deletion_record, anonymised_themes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON deletion_record, anonymised_themes TO interview_worker;
REVOKE ALL ON FUNCTION deletion_due_at(timestamptz, timestamptz, int, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletion_due_at(timestamptz, timestamptz, int, date) TO interview_worker;
REVOKE ALL ON FUNCTION consent_event_fill(), consent_event_append_only() FROM PUBLIC, anon, authenticated, service_role;

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['deletion_record', 'anonymised_themes'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_scope BEFORE INSERT OR UPDATE ON interview.%I
      FOR EACH ROW EXECUTE FUNCTION interview.scope_from_engagement()', tab, tab);
    EXECUTE format('ALTER TABLE interview.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE interview.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('CREATE POLICY owner_all ON interview.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', tab);
    EXECUTE format('CREATE POLICY system_all ON interview.%I FOR ALL TO interview_worker
      USING (interview.is_system() AND (interview.claim_customer_id() IS NULL OR customer_id = interview.claim_customer_id()))
      WITH CHECK (interview.is_system() AND (interview.claim_customer_id() IS NULL OR customer_id = interview.claim_customer_id()))',
      tab);
  END LOOP;
END $$;
