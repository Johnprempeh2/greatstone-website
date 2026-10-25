-- GRE-2612. The interview engine's database (source app migrations 0001 to 0017 folded into one), in its own schema
-- `interview` so nothing clashes with the site's engagements and customers. Same tables, columns, enums, indexes,
-- triggers and functions as the source; each change is marked `-- Port:`. See docs/INTERVIEW-ENGINE.md, "Data plane".
--
--   * interview_worker: NOLOGIN, NOBYPASSRLS, the only role with any grant in this schema. A request opens a
--     transaction, runs SET LOCAL ROLE interview_worker and sets request.jwt.claims (local), so both end with it.
--   * Claims: participant { scope: 'participant', email: <verified email> } or system { scope: 'system' }.
--   * Every table has RLS enabled and forced. The owner keeps owner_all so SECURITY DEFINER functions work.
--
-- Port: the source's 0002 policies and their helpers (auth_employee_unit_path, employee_in_my_subtree,
-- session_in_my_subtree, unit_in_my_subtree, auth_can_delegate) read Supabase claims (portal_role, engagement_id,
-- employee_id) that no website request carries. They are replaced by the participant and system policies below.
-- Port: grants to anon, authenticated and service_role from 0001 to 0017 are not carried over; they get nothing here.
--
-- Rollback: rollback.sql in this folder.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- ltree backs org_unit.path. Trusted, so the database owner may create it; in public so search_path finds it.
CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA public;

DO $$ BEGIN CREATE ROLE interview_worker NOLOGIN NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF (SELECT rolbypassrls OR rolcanlogin OR rolsuper FROM pg_roles WHERE rolname = 'interview_worker') THEN
    RAISE EXCEPTION 'interview_worker must be NOLOGIN and must not bypass RLS';
  END IF;
END $$;
-- lets the site connection SET LOCAL ROLE interview_worker
GRANT interview_worker TO CURRENT_USER;

CREATE SCHEMA interview;
REVOKE ALL ON SCHEMA interview FROM PUBLIC;
GRANT USAGE ON SCHEMA interview TO interview_worker;
-- the policies read auth.jwt() (002); ltree's operators live in public
GRANT USAGE ON SCHEMA auth TO interview_worker;
GRANT EXECUTE ON FUNCTION auth.jwt() TO interview_worker;
GRANT USAGE ON SCHEMA public TO interview_worker;

-- Everything below is created in interview. The runner wraps the file in one transaction, so this ends with it.
SET LOCAL search_path TO interview, public;

-- ── Enums ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TYPE portal_role AS ENUM ('gs_admin', 'client_admin', 'team_leader', 'employee');
CREATE TYPE employee_status AS ENUM ('invited', 'started', 'completed', 'declined');
CREATE TYPE leader_track AS ENUM ('self', 'on_behalf');
CREATE TYPE session_phase AS ENUM ('warmup', 'day_in_life', 'pain_mapping', 'automation', 'sign_off');
CREATE TYPE turn_role AS ENUM ('agent', 'user');
CREATE TYPE insight_type AS ENUM ('task', 'pain', 'automation_candidate', 'escalation');
CREATE TYPE context_pack_status AS ENUM ('draft', 'approved');
CREATE TYPE outbox_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE consent_kind AS ENUM ('participation', 'attribution', 'memory_opt_in', 'withdrawal');
CREATE TYPE seat_request_status AS ENUM ('pending', 'approved', 'declined', 'escalated');
CREATE TYPE seat_purchase_payment_status AS ENUM ('pending_wiring', 'paid');

-- ── person: identity above the per-engagement employee row, matched on verified email ─────────────
CREATE TABLE person (
  person_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_email text NOT NULL UNIQUE,
  display_name   text,
  merged_into    uuid REFERENCES person(person_id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Port: the Better Auth user id, when the person has a website account.
  auth_user_id   uuid UNIQUE
);
-- Port: the participant policies match on lower(email).
CREATE INDEX idx_person_lower_verified_email ON person (lower(verified_email));

-- ── engagement: one round. FKs to context_pack, org_unit and synthesis are added once those exist ──
CREATE TABLE engagement (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name            text NOT NULL,
  sponsor                text,
  -- Port: 'draft' joins the source's 'active' and 'closed'. Free text as in the source (no CHECK).
  status                 text NOT NULL DEFAULT 'active',
  branding_config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_pack_id        uuid,
  context_pack_version   int,
  seat_total             int NOT NULL DEFAULT 0,
  cost_envelope_pence    bigint NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- 0007: self-serve enrolment (/join/<token>)
  enrol_token            text,
  enrol_enabled          boolean NOT NULL DEFAULT false,
  enrol_expires_at       timestamptz,
  allowed_email_domains  text[] NOT NULL DEFAULT '{}',
  default_unit_id        uuid,
  -- 0007: lifecycle and retention
  end_date               date,
  readout_at             timestamptz,
  retention_delete_after date,
  -- 0007: release to client
  released_synthesis_id  uuid,
  released_at            timestamptz,
  released_by            text,
  -- Port: the website customer (public.customers.id). No FK, so the two schemas stay apart.
  customer_id            uuid,
  -- Port: the website organisation of the GSAM bridge key that created the round. No FK. The GSAM round id is id.
  org_id                 uuid,
  -- Port: team round or one-person interview, and the target length of one interview.
  mode                   text NOT NULL DEFAULT 'person' CHECK (mode IN ('team', 'person')),
  target_minutes         int NOT NULL DEFAULT 20
);
CREATE UNIQUE INDEX uq_engagement_enrol_token ON engagement (enrol_token) WHERE enrol_token IS NOT NULL;

-- ── org_unit: the hierarchy. path is an ltree of underscored ids, kept by the triggers below ───────
CREATE TABLE org_unit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES org_unit(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'department',
  path            ltree NOT NULL,
  seat_allocation int CHECK (seat_allocation IS NULL OR seat_allocation >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_org_unit_sibling_name ON org_unit (engagement_id, parent_id, name);
CREATE UNIQUE INDEX uq_org_unit_root_name ON org_unit (engagement_id, name) WHERE parent_id IS NULL;
CREATE INDEX idx_org_unit_engagement_id ON org_unit (engagement_id);
CREATE INDEX idx_org_unit_parent_id ON org_unit (parent_id);
CREATE INDEX idx_org_unit_path_gist ON org_unit USING gist (path);

ALTER TABLE engagement ADD CONSTRAINT engagement_default_unit_id_fkey
  FOREIGN KEY (default_unit_id) REFERENCES org_unit(id);

-- BEFORE insert/update: path from the parent's current path; same engagement, no cycles, engagement_id immutable.
-- Port: search_path is interview, public (was public) in every function of this file.
CREATE FUNCTION org_unit_set_path() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_label             ltree := text2ltree(replace(new.id::text, '-', '_'));
  v_parent_path       ltree;
  v_parent_engagement uuid;
BEGIN
  IF tg_op = 'UPDATE' AND new.engagement_id <> old.engagement_id THEN
    RAISE EXCEPTION 'org_unit %: engagement_id is immutable', new.id;
  END IF;
  IF new.parent_id IS NULL THEN
    new.path := v_label;
    RETURN new;
  END IF;
  IF new.parent_id = new.id THEN
    RAISE EXCEPTION 'org_unit %: cannot be its own parent', new.id;
  END IF;
  SELECT path, engagement_id INTO v_parent_path, v_parent_engagement FROM org_unit WHERE id = new.parent_id;
  IF v_parent_path IS NULL THEN
    RAISE EXCEPTION 'org_unit %: parent % does not exist', new.id, new.parent_id;
  END IF;
  IF v_parent_engagement <> new.engagement_id THEN
    RAISE EXCEPTION 'org_unit %: parent % belongs to a different engagement', new.id, new.parent_id;
  END IF;
  IF index(v_parent_path, v_label) <> -1 THEN
    RAISE EXCEPTION 'org_unit %: making % its parent would create a cycle', new.id, new.parent_id;
  END IF;
  new.path := v_parent_path || v_label;
  RETURN new;
END;
$$;
CREATE TRIGGER trg_org_unit_set_path
  BEFORE INSERT OR UPDATE OF parent_id, name, engagement_id ON org_unit
  FOR EACH ROW EXECUTE FUNCTION org_unit_set_path();

-- AFTER update: a reparent rewrites the whole former subtree's paths (path is not in the column list: no re-fire).
CREATE FUNCTION org_unit_move_subtree() RETURNS trigger
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
BEGIN
  IF new.path IS DISTINCT FROM old.path THEN
    UPDATE org_unit SET path = new.path || subpath(path, nlevel(old.path))
    WHERE path <@ old.path AND id <> new.id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_org_unit_move_subtree
  AFTER UPDATE OF parent_id, name, engagement_id ON org_unit
  FOR EACH ROW EXECUTE FUNCTION org_unit_move_subtree();

-- Allocation hygiene: a capped node's direct children may not allocate more than it. UX hygiene only; claim_seat()
-- is the hard gate. Deferred, so a rebalance in one transaction is judged on its final state.
CREATE FUNCTION org_unit_check_allocation_hygiene() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_parent_alloc int;
  v_children_sum bigint;
BEGIN
  IF tg_op = 'UPDATE'
     AND new.seat_allocation IS NOT DISTINCT FROM old.seat_allocation
     AND new.parent_id IS NOT DISTINCT FROM old.parent_id THEN
    RETURN NULL;
  END IF;
  IF new.parent_id IS NOT NULL THEN
    SELECT seat_allocation INTO v_parent_alloc FROM org_unit WHERE id = new.parent_id;
    IF v_parent_alloc IS NOT NULL THEN
      SELECT coalesce(sum(seat_allocation), 0) INTO v_children_sum
      FROM org_unit WHERE parent_id = new.parent_id AND seat_allocation IS NOT NULL;
      IF v_children_sum > v_parent_alloc THEN
        RAISE EXCEPTION 'org_unit %: direct children of % allocate % seats, exceeding its allocation of %',
          new.id, new.parent_id, v_children_sum, v_parent_alloc;
      END IF;
    END IF;
  END IF;
  IF new.seat_allocation IS NOT NULL THEN
    SELECT coalesce(sum(seat_allocation), 0) INTO v_children_sum
    FROM org_unit WHERE parent_id = new.id AND seat_allocation IS NOT NULL;
    IF v_children_sum > new.seat_allocation THEN
      RAISE EXCEPTION 'org_unit %: direct children allocate % seats, exceeding its allocation of %',
        new.id, v_children_sum, new.seat_allocation;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER trg_org_unit_allocation_hygiene
  AFTER INSERT OR UPDATE ON org_unit
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION org_unit_check_allocation_hygiene();

-- ── employee: a participant in one engagement ──────────────────────────────────────────────────────
CREATE TABLE employee (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id          uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  person_id              uuid REFERENCES person(person_id),
  unit_id                uuid REFERENCES org_unit(id),
  name                   text NOT NULL,
  email                  text NOT NULL,
  role_title             text,
  portal_role            portal_role NOT NULL DEFAULT 'employee',
  status                 employee_status NOT NULL DEFAULT 'invited',
  login_token_hash       text,
  leader_track           leader_track,
  can_delegate           boolean NOT NULL DEFAULT false,
  invited_by             uuid REFERENCES employee(id),
  login_token_expires_at timestamptz,
  UNIQUE (engagement_id, email)
);
CREATE INDEX idx_employee_engagement_id ON employee (engagement_id);
CREATE INDEX idx_employee_unit_id ON employee (unit_id);
CREATE INDEX idx_employee_person_id ON employee (person_id);
CREATE INDEX idx_employee_login_token_hash ON employee (login_token_hash) WHERE login_token_hash IS NOT NULL;
-- Port: the participant policies match on lower(email).
CREATE INDEX idx_employee_lower_email ON employee (lower(email));

-- claim_seat(): the concurrency-safe seat gate. Flips the employee to 'started' or raises and changes nothing.
-- Idempotent for an employee who already holds a seat. All claims in one engagement serialise on an advisory lock.
CREATE FUNCTION claim_seat(p_employee_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_emp        employee%rowtype;
  v_seat_total int;
  v_consumed   int;
  r            record;
BEGIN
  SELECT * INTO v_emp FROM employee WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_seat: employee % not found', p_employee_id;
  END IF;
  IF v_emp.status IN ('started', 'completed') THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('claim_seat:' || v_emp.engagement_id::text, 0));

  SELECT seat_total INTO v_seat_total FROM engagement WHERE id = v_emp.engagement_id;
  SELECT count(*) INTO v_consumed FROM employee e
  WHERE e.engagement_id = v_emp.engagement_id AND e.status IN ('started', 'completed');
  IF v_consumed + 1 > v_seat_total THEN
    RAISE EXCEPTION 'claim_seat: engagement % seat total exhausted (% of % consumed)',
      v_emp.engagement_id, v_consumed, v_seat_total;
  END IF;

  IF v_emp.unit_id IS NOT NULL THEN
    FOR r IN
      SELECT a.id, a.name, a.seat_allocation, a.path
      FROM org_unit me
      JOIN org_unit a ON a.path @> me.path
      WHERE me.id = v_emp.unit_id AND a.seat_allocation IS NOT NULL
      ORDER BY nlevel(a.path)
    LOOP
      SELECT count(*) INTO v_consumed
      FROM employee e JOIN org_unit u ON u.id = e.unit_id
      WHERE e.engagement_id = v_emp.engagement_id AND u.path <@ r.path AND e.status IN ('started', 'completed');
      IF v_consumed + 1 > r.seat_allocation THEN
        RAISE EXCEPTION 'claim_seat: seat allocation exhausted for org_unit "%" (%): % of % consumed',
          r.name, r.id, v_consumed, r.seat_allocation;
      END IF;
    END LOOP;
  END IF;

  UPDATE employee SET status = 'started' WHERE id = p_employee_id;
END;
$$;

-- ── session, turn, insight ────────────────────────────────────────────────────────────────────────
CREATE TABLE session (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  duration_secs    int,
  completion_score numeric,
  phase            session_phase NOT NULL DEFAULT 'warmup',
  taxonomy_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumable        boolean NOT NULL DEFAULT true,
  is_test          boolean NOT NULL DEFAULT false,  -- 0016
  voice_token_hash text,                            -- 0017: sha256 of the per-session voice token
  is_voice         boolean NOT NULL DEFAULT false   -- 0017
);
CREATE INDEX idx_session_employee_id ON session (employee_id);
-- 0009: at most one active session per employee
CREATE UNIQUE INDEX uq_one_active_session_per_employee ON session (employee_id) WHERE ended_at IS NULL AND resumable;
CREATE INDEX idx_session_voice_token_hash ON session (voice_token_hash) WHERE voice_token_hash IS NOT NULL;

-- 0007: turn.seq gives a deterministic order; client_turn_id makes a resent user turn collapse onto the first.
CREATE SEQUENCE turn_seq_seq;
CREATE TABLE turn (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role             turn_role NOT NULL,
  content          text NOT NULL,
  ts               timestamptz NOT NULL DEFAULT now(),
  extracted_fields jsonb,
  seq              bigint NOT NULL DEFAULT nextval('turn_seq_seq'),
  client_turn_id   text,
  input_mode       text  -- 0017: 'voice' | 'text'
);
ALTER SEQUENCE turn_seq_seq OWNED BY turn.seq;
CREATE INDEX idx_turn_session_id ON turn (session_id);
CREATE INDEX idx_turn_session_seq ON turn (session_id, seq);
CREATE UNIQUE INDEX uq_turn_session_client_id ON turn (session_id, client_turn_id) WHERE client_turn_id IS NOT NULL;

CREATE TABLE insight (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  type                 insight_type NOT NULL,
  label                text NOT NULL,
  evidence_quote       text,
  time_per_week_hours  numeric,
  confidence           numeric CHECK (confidence >= 0 AND confidence <= 1),
  attribution_redacted boolean NOT NULL DEFAULT false,
  second_hand          boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_insight_session_id ON insight (session_id);

-- ── synthesis and its cache (0001, 0005) ───────────────────────────────────────────────────────────
CREATE TABLE synthesis (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id     uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  themes            jsonb NOT NULL DEFAULT '[]'::jsonb,
  hot_spots         jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations   jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_ups        jsonb NOT NULL DEFAULT '[]'::jsonb,
  version           int NOT NULL DEFAULT 1,
  headline_read     jsonb,
  methodology       jsonb,
  validation_log    jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version     text,
  rules_version     text,
  input_insight_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_synthesis_engagement_id ON synthesis (engagement_id);
-- 0007 + 0008: the released version; deleting it nulls the pointer
ALTER TABLE engagement ADD CONSTRAINT engagement_released_synthesis_id_fkey
  FOREIGN KEY (released_synthesis_id) REFERENCES synthesis(id) ON DELETE SET NULL;

CREATE TABLE synthesis_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('session', 'unit')),
  key           uuid NOT NULL,
  fingerprint   text NOT NULL,
  payload       jsonb NOT NULL,
  model         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, kind, key)
);
CREATE INDEX idx_synthesis_cache_engagement_id ON synthesis_cache (engagement_id);

-- Port: new. One row per run of the synthesis background function; at most one running per engagement.
CREATE TABLE synthesis_run (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  actor         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  error         text,
  synthesis_id  uuid REFERENCES synthesis(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uq_synthesis_run_running ON synthesis_run (engagement_id) WHERE status = 'running';

-- ── memory_blob: opt-in cross-engagement memory, keyed by person ───────────────────────────────────
CREATE TABLE memory_blob (
  person_id   uuid PRIMARY KEY REFERENCES person(person_id) ON DELETE CASCADE,
  blob        jsonb NOT NULL DEFAULT '{}'::jsonb,
  opted_in    boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  expires_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── context_pack: versioned engagement context ────────────────────────────────────────────────────
CREATE TABLE context_pack (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  version       int NOT NULL DEFAULT 1,
  content       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        context_pack_status NOT NULL DEFAULT 'draft',
  approved_by   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, version)
);
CREATE INDEX idx_context_pack_engagement_id ON context_pack (engagement_id);
ALTER TABLE engagement ADD CONSTRAINT fk_engagement_context_pack
  FOREIGN KEY (context_pack_id) REFERENCES context_pack(id);

-- ── usage_ledger: per-call usage and cost ─────────────────────────────────────────────────────────
CREATE TABLE usage_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid REFERENCES session(id) ON DELETE SET NULL,
  engagement_id uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  model         text NOT NULL,
  input_tokens  bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_pence    bigint NOT NULL DEFAULT 0,
  ts            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_ledger_engagement_id ON usage_ledger (engagement_id);
CREATE INDEX idx_usage_ledger_session_id ON usage_ledger (session_id);

-- ── outbox ────────────────────────────────────────────────────────────────────────────────────────
-- Port: was notion_outbox (drained to Notion). Same columns; GSAM reads it through the bridge.
CREATE TABLE outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  engagement_id   uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  payload         jsonb NOT NULL,
  status          outbox_status NOT NULL DEFAULT 'pending',
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
-- Port: index names follow the table (were idx_notion_outbox_*).
CREATE INDEX idx_outbox_engagement_id ON outbox (engagement_id);
CREATE INDEX idx_outbox_status ON outbox (status) WHERE status = 'pending';

-- ── consent_event: append-only consent log ────────────────────────────────────────────────────────
CREATE TABLE consent_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  kind        consent_kind NOT NULL,
  value       boolean NOT NULL,
  ts          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consent_event_employee_id ON consent_event (employee_id);

-- ── seat_request (0004, 0006) and seat_purchase (0006) ────────────────────────────────────────────
CREATE TABLE seat_request (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagement(id),
  unit_id       uuid REFERENCES org_unit(id),
  requested_by  uuid NOT NULL REFERENCES employee(id),
  seats         int NOT NULL CHECK (seats > 0),
  reason        text,
  status        seat_request_status NOT NULL DEFAULT 'pending',
  decided_by    uuid REFERENCES employee(id),
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE seat_request IS
  'Seat/invite capacity requests. Escalation chain: requester -> nearest delegating leader above the unit -> client_admin -> gs_admin. Approval grants nothing by itself; the approver (or worker plane) applies the allocation change, which stays subject to the 0001 hygiene trigger and claim_seat.';
COMMENT ON COLUMN seat_request.unit_id IS
  'Null = an ENGAGEMENT-LEVEL request to Greatstone: a client_admin asking for the commercial envelope (engagement.seat_total) to grow. Engagement-level rows are decided by gs_admin alone; rows with a unit keep the 0004 escalation chain.';
CREATE INDEX idx_seat_request_engagement ON seat_request (engagement_id, status);
CREATE INDEX idx_seat_request_unit ON seat_request (unit_id);

CREATE TABLE seat_purchase (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid NOT NULL REFERENCES engagement(id),
  seats          int NOT NULL CHECK (seats > 0),
  purchased_by   uuid NOT NULL REFERENCES employee(id),
  amount_pence   int,
  payment_status seat_purchase_payment_status NOT NULL DEFAULT 'pending_wiring',
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE seat_purchase IS
  'Seat purchases made by gs_admin for an engagement. engagement.seat_total is raised at purchase time, so this table is the audit trail, not the capacity gate (claim_seat stays the gate). Stripe wiring lands later: amount_pence is null and payment_status ''pending_wiring'' until a real payment flow fills them in.';
CREATE INDEX idx_seat_purchase_engagement ON seat_purchase (engagement_id);

-- ── rate_event and bump_rate() (0007): fixed-window counter, increment-and-check in one upsert ─────
CREATE TABLE rate_event (
  bucket_key   text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX idx_rate_event_window ON rate_event (window_start);

CREATE FUNCTION bump_rate(p_key text, p_window_secs int, p_limit int) RETURNS boolean
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_window timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs);
  v_count  int;
BEGIN
  INSERT INTO rate_event (bucket_key, window_start, count) VALUES (p_key, v_window, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = rate_event.count + 1
  RETURNING count INTO v_count;
  -- true = within the limit
  RETURN v_count <= p_limit;
END;
$$;

-- ── audit_log (0013): append-only engagement activity ─────────────────────────────────────────────
CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
  actor_email   text,
  actor_name    text,
  action        text NOT NULL,
  summary       text NOT NULL,
  target_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_engagement_created ON audit_log (engagement_id, created_at DESC);

-- ── engagement_spend (0011), create_engagement (0012), claim_first_admin (0015) ───────────────────
CREATE FUNCTION engagement_spend(p_ids uuid[]) RETURNS TABLE (engagement_id uuid, total_pence bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
  SELECT ul.engagement_id, coalesce(sum(ul.cost_pence), 0)::bigint
  FROM usage_ledger ul
  WHERE ul.engagement_id = any(p_ids)
  GROUP BY ul.engagement_id;
$$;

-- One transaction: engagement (enrolment closed), root unit + "Unassigned", draft context pack, the admin row.
CREATE FUNCTION create_engagement(
  p_client_name     text,
  p_seat_total      int,
  p_allowed_domains text[],
  p_enrol_token     text,
  p_enrol_expires   timestamptz,
  p_admin_email     text,
  p_context         jsonb
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
DECLARE
  v_eng        uuid;
  v_root       uuid;
  v_unassigned uuid;
  v_pack       uuid;
BEGIN
  INSERT INTO engagement (client_name, status, seat_total, allowed_email_domains, enrol_token, enrol_enabled, enrol_expires_at)
    VALUES (p_client_name, 'active', p_seat_total, p_allowed_domains, p_enrol_token, false, p_enrol_expires)
    RETURNING id INTO v_eng;
  INSERT INTO org_unit (engagement_id, parent_id, name, kind)
    VALUES (v_eng, NULL, p_client_name, 'organisation') RETURNING id INTO v_root;
  INSERT INTO org_unit (engagement_id, parent_id, name, kind)
    VALUES (v_eng, v_root, 'Unassigned', 'team') RETURNING id INTO v_unassigned;
  UPDATE engagement SET default_unit_id = v_unassigned WHERE id = v_eng;
  INSERT INTO context_pack (engagement_id, version, content, status, approved_by)
    VALUES (v_eng, 1, p_context, 'draft', p_admin_email) RETURNING id INTO v_pack;
  UPDATE engagement SET context_pack_id = v_pack, context_pack_version = 1 WHERE id = v_eng;
  INSERT INTO employee (engagement_id, unit_id, name, email, portal_role, status)
    VALUES (v_eng, v_root, 'Greatstone Admin', p_admin_email, 'gs_admin', 'invited');
  RETURN v_eng;
END;
$$;

-- The first sign-up auto-promoted to client_admin, at most once per engagement (advisory lock).
CREATE FUNCTION claim_first_admin(p_engagement uuid, p_employee uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = interview, public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_engagement::text, 42));
  IF EXISTS (SELECT 1 FROM employee WHERE engagement_id = p_engagement AND portal_role = 'client_admin') THEN
    RETURN false;
  END IF;
  UPDATE employee SET portal_role = 'client_admin' WHERE id = p_employee AND engagement_id = p_engagement;
  RETURN true;
END;
$$;

-- ── Claims helpers ────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION is_system() RETURNS boolean LANGUAGE sql STABLE SET search_path = interview, public, pg_temp AS $$
  SELECT coalesce((auth.jwt() ->> 'scope') = 'system', false) $$;
CREATE FUNCTION claim_email() RETURNS text LANGUAGE sql STABLE SET search_path = interview, public, pg_temp AS $$
  SELECT lower(nullif(auth.jwt() ->> 'email', '')) $$;

-- Port: in the source only the service role wrote employee rows. Here an interviewee's request may update its own
-- row (decline, rejoin, complete, person link), so a participant may not change who the row is, its role or
-- delegation, and may not take a seat except through claim_seat() (which runs as the owner).
CREATE FUNCTION employee_participant_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
BEGIN
  IF current_user <> 'interview_worker' OR is_system() THEN
    RETURN new;
  END IF;
  IF new.engagement_id IS DISTINCT FROM old.engagement_id OR new.email IS DISTINCT FROM old.email
     OR new.portal_role IS DISTINCT FROM old.portal_role OR new.can_delegate IS DISTINCT FROM old.can_delegate
     OR new.invited_by IS DISTINCT FROM old.invited_by OR new.login_token_hash IS DISTINCT FROM old.login_token_hash
     OR (new.status = 'started' AND old.status IS DISTINCT FROM 'started') THEN
    RAISE EXCEPTION 'employee %: participant may not change this column', old.id USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER trg_employee_participant_guard BEFORE UPDATE ON employee
  FOR EACH ROW EXECUTE FUNCTION employee_participant_guard();

-- ── Grants ────────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA interview FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA interview FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA interview FROM PUBLIC, anon, authenticated, service_role;
-- RLS decides the rows. No TRUNCATE, REFERENCES or TRIGGER (RLS does not govern them).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA interview TO interview_worker;
GRANT USAGE, SELECT ON SEQUENCE turn_seq_seq TO interview_worker;
-- Trigger functions get no grant: a trigger does not need one.
GRANT EXECUTE ON FUNCTION
  claim_seat(uuid),
  bump_rate(text, int, int),
  engagement_spend(uuid[]),
  create_engagement(text, int, text[], text, timestamptz, text, jsonb),
  claim_first_admin(uuid, uuid),
  is_system(),
  claim_email()
TO interview_worker;

-- ── Row level security ────────────────────────────────────────────────────────────────────────────
-- Every table: enabled and forced, owner_all for the owner (SECURITY DEFINER functions), system_all for the worker
-- with system claims. Participant policies follow.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['person', 'engagement', 'org_unit', 'employee', 'session', 'turn', 'insight', 'synthesis',
    'synthesis_cache', 'synthesis_run', 'memory_blob', 'context_pack', 'usage_ledger', 'outbox', 'consent_event', 'seat_request',
    'seat_purchase', 'rate_event', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE interview.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE interview.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('CREATE POLICY owner_all ON interview.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', tab);
    EXECUTE format('CREATE POLICY system_all ON interview.%I FOR ALL TO interview_worker
      USING (interview.is_system()) WITH CHECK (interview.is_system())', tab);
  END LOOP;
END $$;

-- Round metadata needed for enrolment and the prompt: read only.
CREATE POLICY participant_select ON engagement FOR SELECT TO interview_worker USING (claim_email() IS NOT NULL);
CREATE POLICY participant_select ON org_unit FOR SELECT TO interview_worker USING (claim_email() IS NOT NULL);
CREATE POLICY participant_select ON context_pack FOR SELECT TO interview_worker USING (claim_email() IS NOT NULL);

-- person: own row by verified email.
CREATE POLICY participant_select ON person FOR SELECT TO interview_worker
  USING (lower(verified_email) = claim_email());
CREATE POLICY participant_insert ON person FOR INSERT TO interview_worker
  WITH CHECK (lower(verified_email) = claim_email());
CREATE POLICY participant_update ON person FOR UPDATE TO interview_worker
  USING (lower(verified_email) = claim_email()) WITH CHECK (lower(verified_email) = claim_email());

-- employee: own rows by email. Enrolment inserts a plain invited employee; the guard trigger limits updates.
CREATE POLICY participant_select ON employee FOR SELECT TO interview_worker
  USING (lower(email) = claim_email());
CREATE POLICY participant_insert ON employee FOR INSERT TO interview_worker
  WITH CHECK (lower(email) = claim_email() AND portal_role = 'employee' AND status = 'invited'
    AND NOT can_delegate AND invited_by IS NULL);
CREATE POLICY participant_update ON employee FOR UPDATE TO interview_worker
  USING (lower(email) = claim_email()) WITH CHECK (lower(email) = claim_email());

-- session: through the employee.
CREATE POLICY participant_select ON session FOR SELECT TO interview_worker
  USING (employee_id IN (SELECT e.id FROM employee e WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_insert ON session FOR INSERT TO interview_worker
  WITH CHECK (employee_id IN (SELECT e.id FROM employee e WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_update ON session FOR UPDATE TO interview_worker
  USING (employee_id IN (SELECT e.id FROM employee e WHERE lower(e.email) = claim_email()))
  WITH CHECK (employee_id IN (SELECT e.id FROM employee e WHERE lower(e.email) = claim_email()));

-- turn and insight: through session and employee.
CREATE POLICY participant_select ON turn FOR SELECT TO interview_worker
  USING (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_insert ON turn FOR INSERT TO interview_worker
  WITH CHECK (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_update ON turn FOR UPDATE TO interview_worker
  USING (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()))
  WITH CHECK (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_select ON insight FOR SELECT TO interview_worker
  USING (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_insert ON insight FOR INSERT TO interview_worker
  WITH CHECK (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_update ON insight FOR UPDATE TO interview_worker
  USING (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()))
  WITH CHECK (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));

-- consent_event: append-only, own employee rows.
CREATE POLICY participant_select ON consent_event FOR SELECT TO interview_worker
  USING (employee_id IN (SELECT e.id FROM employee e WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_insert ON consent_event FOR INSERT TO interview_worker
  WITH CHECK (employee_id IN (SELECT e.id FROM employee e WHERE lower(e.email) = claim_email()));

-- usage_ledger: own session rows (the budget check reads them); insert only against own session and its
-- engagement. Engagement-wide spend goes through engagement_spend().
CREATE POLICY participant_select ON usage_ledger FOR SELECT TO interview_worker
  USING (session_id IN (SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE lower(e.email) = claim_email()));
CREATE POLICY participant_insert ON usage_ledger FOR INSERT TO interview_worker
  WITH CHECK (EXISTS (SELECT 1 FROM session s JOIN employee e ON e.id = s.employee_id
    WHERE s.id = usage_ledger.session_id AND e.engagement_id = usage_ledger.engagement_id AND lower(e.email) = claim_email()));

-- memory_blob: own person; delete is the hard-delete opt-out.
CREATE POLICY participant_all ON memory_blob FOR ALL TO interview_worker
  USING (person_id IN (SELECT p.person_id FROM person p WHERE lower(p.verified_email) = claim_email()))
  WITH CHECK (person_id IN (SELECT p.person_id FROM person p WHERE lower(p.verified_email) = claim_email()));

-- rate_event: any worker request (bump_rate runs as the caller). audit_log: any worker request appends.
CREATE POLICY worker_all ON rate_event FOR ALL TO interview_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_insert ON audit_log FOR INSERT TO interview_worker WITH CHECK (true);

-- synthesis, synthesis_cache, synthesis_run, seat_request, seat_purchase, outbox: system_all only.
