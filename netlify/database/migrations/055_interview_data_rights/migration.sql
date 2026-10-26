-- GRE-2653 (GRE-2639: interviews are personal data). Retention per round, the three-way quote choice, a consent log
-- that outlives the people it records, a deletion record and the anonymised themes copy a client keeps.
-- Spec: the `retention-rights-regions` document on GRE-2639.
--
--   * engagement.retention_days (default 90) and closed_at. Deletion date = coalesce(readout_at, closed_at) +
--     retention_days; the older retention_delete_after date, when set, still counts (whichever comes first).
--   * employee.quote_choice: 'none' | 'anonymous' | 'named'. NULL = not chosen, which is read as 'none'.
--   * consent_event keeps engagement_id and subject_email of its own, and employee_id is SET NULL when the
--     invite is deleted, so the consent log (kept 6 years, no content) survives the retention delete.
--   * deletion_record and anonymised_themes: system only, no names, no quotes, no user ids.
--   * Participant rows are also matched on the website user id where one is linked (restrictive policies).
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

-- ── Quote choice and the website user on the invite ───────────────────────────────────────────────
ALTER TABLE employee ADD COLUMN quote_choice text CHECK (quote_choice IN ('none', 'anonymous', 'named'));
ALTER TABLE employee ADD COLUMN auth_user_id uuid;
CREATE INDEX idx_employee_auth_user_id ON employee (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 'quotes' carries the three-way choice in consent_event.choice. Not used in this file (a new enum value cannot
-- be used in the transaction that adds it).
ALTER TYPE consent_kind ADD VALUE IF NOT EXISTS 'quotes';

-- ── consent_event outlives the invite ─────────────────────────────────────────────────────────────
ALTER TABLE consent_event ADD COLUMN choice text CHECK (choice IS NULL OR choice IN ('none', 'anonymous', 'named'));
ALTER TABLE consent_event ADD COLUMN engagement_id uuid REFERENCES engagement(id) ON DELETE CASCADE;
ALTER TABLE consent_event ADD COLUMN subject_email text;
UPDATE consent_event c SET engagement_id = e.engagement_id, subject_email = lower(e.email)
  FROM employee e WHERE e.id = c.employee_id;
ALTER TABLE consent_event ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE consent_event DROP CONSTRAINT consent_event_employee_id_fkey;
ALTER TABLE consent_event ADD CONSTRAINT consent_event_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
CREATE INDEX idx_consent_event_engagement_id ON consent_event (engagement_id);

-- Filled from the employee row on insert, so a caller cannot write another round or another person.
CREATE FUNCTION consent_event_fill() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
BEGIN
  SELECT e.engagement_id, lower(e.email) INTO new.engagement_id, new.subject_email FROM employee e WHERE e.id = new.employee_id;
  IF new.engagement_id IS NULL THEN
    RAISE EXCEPTION 'consent_event: employee % not found', new.employee_id;
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER trg_consent_event_fill BEFORE INSERT ON consent_event
  FOR EACH ROW EXECUTE FUNCTION consent_event_fill();
-- Append-only for everyone but the owner: the log is the proof.
CREATE FUNCTION consent_event_append_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
BEGIN
  -- the FK's SET NULL runs as the owner; nothing else may change a row
  IF current_user = 'interview_worker' THEN
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
  org_id        uuid,
  kind          text NOT NULL CHECK (kind IN ('retention', 'self_service')),
  counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- the engagement owner confirms the deletion to the client in writing (DPA 7.5)
  notified_at   timestamptz
);
CREATE INDEX idx_deletion_record_engagement_id ON deletion_record (engagement_id, created_at DESC);

-- ── Anonymised themes: what the client keeps after the deletion date ──────────────────────────────
-- Theme labels, counts, time estimates, team roll-ups. No names, no quotes, no user or insight ids.
CREATE TABLE anonymised_themes (
  engagement_id   uuid PRIMARY KEY REFERENCES engagement(id) ON DELETE CASCADE,
  org_id          uuid,
  source_version  int,
  themes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  teams           jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Grants and row level security ─────────────────────────────────────────────────────────────────
REVOKE ALL ON deletion_record, anonymised_themes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON deletion_record, anonymised_themes TO interview_worker;
REVOKE ALL ON FUNCTION deletion_due_at(timestamptz, timestamptz, int, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletion_due_at(timestamptz, timestamptz, int, date) TO interview_worker;

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['deletion_record', 'anonymised_themes'] LOOP
    EXECUTE format('ALTER TABLE interview.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE interview.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('CREATE POLICY owner_all ON interview.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', tab);
    EXECUTE format('CREATE POLICY system_all ON interview.%I FOR ALL TO interview_worker
      USING (interview.is_system()) WITH CHECK (interview.is_system())', tab);
  END LOOP;
END $$;

-- The website user id from the claims (Better Auth `sub`).
CREATE FUNCTION claim_user_id() RETURNS uuid LANGUAGE sql STABLE SET search_path = interview, public, pg_temp AS $$
  SELECT CASE WHEN (auth.jwt() ->> 'sub') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (auth.jwt() ->> 'sub')::uuid END $$;
GRANT EXECUTE ON FUNCTION claim_user_id() TO interview_worker;

-- By user id as well as by email: a person or invite linked to a website account is reached only by that account.
-- Restrictive, so it narrows the email policies and never widens them; system claims pass.
CREATE POLICY participant_user_match ON person AS RESTRICTIVE FOR ALL TO interview_worker
  USING (is_system() OR auth_user_id IS NULL OR auth_user_id = claim_user_id())
  WITH CHECK (is_system() OR auth_user_id IS NULL OR auth_user_id = claim_user_id());
CREATE POLICY participant_user_match ON employee AS RESTRICTIVE FOR ALL TO interview_worker
  USING (is_system() OR auth_user_id IS NULL OR auth_user_id = claim_user_id())
  WITH CHECK (is_system() OR auth_user_id IS NULL OR auth_user_id = claim_user_id());
