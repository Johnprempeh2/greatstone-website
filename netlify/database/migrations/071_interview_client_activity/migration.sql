-- GRE-2673. Interview activity enters the client stream from row triggers, so each event commits or rolls back with
-- the one statement that changes the interview's state (interviewDb runs every statement in its own transaction).
-- The organisation id is the engagement's customer_id (public.customers.id). Subjects are opaque row ids; labels are
-- fixed. Greatstone's own gs_admin row and test sessions are not client activity.
--
--   interview.invited    employee inserted as 'invited'                    subject interview_employee:<id>
--   interview.started    employee status becomes 'started' (claim_seat)    subject interview_employee:<id>
--   interview.completed  employee status becomes 'completed' (sign-off)    subject interview_employee:<id>
--   interview.abandoned  session ended with end_reason 'closed_out'        subject interview_session:<id>
--
-- Sign-off and close-out both set session.ended_at, so close-out now says so: end_reason. Only a system caller (the
-- bridge or the scheduled close-out) may set it, and once set it does not change.
ALTER TABLE interview.session ADD COLUMN end_reason text CHECK (end_reason IN ('closed_out'));

CREATE FUNCTION interview.session_end_reason_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND old.end_reason IS NOT NULL AND new.end_reason IS DISTINCT FROM old.end_reason THEN
    RAISE EXCEPTION 'session %: end_reason cannot be changed', old.id USING ERRCODE = '42501';
  END IF;
  IF new.end_reason IS NOT NULL AND (TG_OP = 'INSERT' OR old.end_reason IS NULL) THEN
    IF current_user = 'interview_worker' AND NOT is_system() THEN
      RAISE EXCEPTION 'session %: only a system caller may close out a session', new.id USING ERRCODE = '42501';
    END IF;
    IF new.ended_at IS NULL THEN
      RAISE EXCEPTION 'session %: a closed-out session must have ended', new.id;
    END IF;
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER trg_session_end_reason_guard BEFORE INSERT OR UPDATE OF end_reason, ended_at ON interview.session
  FOR EACH ROW EXECUTE FUNCTION interview.session_end_reason_guard();

CREATE FUNCTION interview.client_activity_from_employee() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE v_org uuid; v_kind text; v_label text;
BEGIN
  IF new.portal_role = 'gs_admin' THEN RETURN new; END IF;
  IF TG_OP = 'INSERT' AND new.status = 'invited' THEN
    v_kind := 'interview.invited'; v_label := 'Interview invited';
  ELSIF TG_OP = 'UPDATE' AND new.status IS DISTINCT FROM old.status AND new.status = 'started' THEN
    v_kind := 'interview.started'; v_label := 'Interview started';
  ELSIF TG_OP = 'UPDATE' AND new.status IS DISTINCT FROM old.status AND new.status = 'completed' THEN
    v_kind := 'interview.completed'; v_label := 'Interview completed';
  ELSE
    RETURN new;
  END IF;
  SELECT org_id INTO STRICT v_org FROM interview.engagement WHERE id = new.engagement_id;
  PERFORM public.client_activity_emit(v_org, new.customer_id, v_kind, 'interview_employee:' || new.id::text, v_label);
  RETURN new;
END $$;
CREATE TRIGGER trg_employee_client_activity AFTER INSERT OR UPDATE OF status ON interview.employee
  FOR EACH ROW EXECUTE FUNCTION interview.client_activity_from_employee();

CREATE FUNCTION interview.client_activity_from_session() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  IF new.end_reason = 'closed_out' AND old.end_reason IS NULL AND NOT new.is_test
      AND NOT EXISTS (SELECT 1 FROM interview.employee e WHERE e.id = new.employee_id AND e.portal_role = 'gs_admin') THEN
    SELECT g.org_id INTO STRICT v_org FROM interview.employee e JOIN interview.engagement g ON g.id = e.engagement_id
      WHERE e.id = new.employee_id;
    PERFORM public.client_activity_emit(v_org, new.customer_id, 'interview.abandoned',
      'interview_session:' || new.id::text, 'Interview abandoned');
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER trg_session_client_activity AFTER UPDATE OF end_reason ON interview.session
  FOR EACH ROW EXECUTE FUNCTION interview.client_activity_from_session();

REVOKE ALL ON FUNCTION interview.session_end_reason_guard(), interview.client_activity_from_employee(),
  interview.client_activity_from_session() FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read,
  gsam_bridge_write, gsam_bridge_refund, interview_worker;
