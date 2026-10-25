-- GSAM admin bridge, phase 2c: commerce reads, the write capability and the refund-request capability (GRE-2354,
-- design rev 3; built in GRE-2363). Builds on 048_gsam_bridge. Adds objects only, so the previous deploy runs
-- against it unchanged.
--
--   * Read (gsam_bridge_read, same key): column grants and one read policy per commerce table, as 048 does.
--   * Write (gsam_bridge_write, its own key): column-level INSERT/UPDATE on allow-listed columns, DELETE only on the
--     child rows with no deleted_at (offering_specs, offering_media, pricing_rule_targets). orders and order_items
--     get no write grant; they change only through the bridge_* functions below.
--       BEGIN; SET LOCAL ROLE gsam_bridge_write;
--       SELECT * FROM admin_bridge_begin_write(...)      -- window, nonce, audit row, idempotency claim
--       SELECT set_config('request.jwt.claims', '{"role":"gsam_bridge","cap":"write","org":…,"audit":…}', true);
--       SAVEPOINT w; … one typed operation …; (ROLLBACK TO SAVEPOINT w on a refused write)
--       SELECT admin_bridge_finish_write(...); COMMIT;
--   * Refund request (gsam_bridge_refund, its own key): no table grant at all. It may call its begin/finish and
--     bridge_request_refund / bridge_refund_decision. No Stripe call exists on this path; a person refunds in the
--     Stripe dashboard and the webhook's refunded_minor marks approved requests done (oldest decision first).
--   * admin_bridge_idempotency and admin_bridge_change: no grant to any bridge role; only the SECURITY DEFINER
--     begin/finish functions and the change trigger touch them.
--   * "People only" operations (publish, archive, FX, import apply, invoice issue, refund decision) refuse any actor
--     that is not user:. The actor is read from the audit row this transaction opened, not from the request.
-- Error codes the site function maps: GB400 bad_request, GB403 denied, GB404 not_found, GB409 conflict,
-- GBR01 over_refundable, GB004 idempotency key malformed. GB001-GB003 are 048's.
-- Re-runnable. Rollback: rollback.sql in this folder.

-- ── roles ───────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE ROLE gsam_bridge_write NOLOGIN NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE gsam_bridge_refund NOLOGIN NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A role made earlier by hand could carry attributes these must not have (048's guard).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['gsam_bridge_write', 'gsam_bridge_refund'] LOOP
    IF (SELECT rolbypassrls OR rolsuper OR rolcanlogin OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = r) THEN
      RAISE EXCEPTION '% must be NOLOGIN, NOBYPASSRLS, NOSUPERUSER, NOCREATEROLE and NOCREATEDB', r;
    END IF;
  END LOOP;
END $$;
GRANT gsam_bridge_write, gsam_bridge_refund TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO gsam_bridge_write, gsam_bridge_refund;

-- ── claims ──────────────────────────────────────────────────────────────────────────────────────────
-- The org from the claims, only for the write capability. 048's app_bridge_org() (read) is not changed.
CREATE OR REPLACE FUNCTION app_bridge_write_org() RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN c ->> 'role' = 'gsam_bridge' AND c ->> 'cap' = 'write'
              THEN nullif(c ->> 'org', '')::uuid END
  FROM (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb AS c) s $$;
REVOKE ALL ON FUNCTION app_bridge_write_org() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_bridge_write_org() TO gsam_bridge_write;

-- The audit row this transaction opened for the claims' capability: id, actor, run and org. Empty when there is
-- none, so a forged claim with no begin call names no actor.
CREATE OR REPLACE FUNCTION app_bridge_open_audit(p_capability text)
RETURNS TABLE (audit_id uuid, actor text, run uuid, org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.actor_type || ':' || a.actor_id, a.gsam_run_id, nullif(c ->> 'org', '')::uuid
  FROM (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb AS c) s
  JOIN admin_bridge_audit a
    ON c ->> 'role' = 'gsam_bridge' AND c ->> 'cap' = p_capability
   AND a.id = CASE WHEN c ->> 'audit' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   THEN (c ->> 'audit')::uuid END
   AND a.capability = p_capability AND a.kid = c ->> 'kid'
   AND a.outcome = 'started' AND a.at = now() $$;
REVOKE ALL ON FUNCTION app_bridge_open_audit(text) FROM PUBLIC, anon, authenticated, service_role;

-- The actor of this transaction's open write audit row, for the catalogue guard below.
CREATE OR REPLACE FUNCTION app_bridge_write_actor() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT actor FROM app_bridge_open_audit('write') $$;
REVOKE ALL ON FUNCTION app_bridge_write_actor() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_bridge_write_actor() TO gsam_bridge_write;

-- The context every bridge_* function starts from. Raises GB003 when no audit row is open for the capability.
CREATE OR REPLACE FUNCTION _bridge_ctx(p_capability text, OUT org_id uuid, OUT actor text, OUT run uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT o.org_id, o.actor, o.run INTO org_id, actor, run FROM app_bridge_open_audit(p_capability) o;
  IF org_id IS NULL THEN RAISE EXCEPTION 'no open bridge audit row in this transaction' USING ERRCODE = 'GB003'; END IF;
END $$;
REVOKE ALL ON FUNCTION _bridge_ctx(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION _bridge_person(p_actor text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF split_part(coalesce(p_actor, ''), ':', 1) <> 'user' THEN
    RAISE EXCEPTION 'people only: % may not do this', coalesce(split_part(p_actor, ':', 1), '?') USING ERRCODE = 'GB403';
  END IF;
END $$;
REVOKE ALL ON FUNCTION _bridge_person(text) FROM PUBLIC, anon, authenticated, service_role;

-- ── audit, idempotency and the change log ───────────────────────────────────────────────────────────
ALTER TABLE public.admin_bridge_audit DROP CONSTRAINT IF EXISTS admin_bridge_audit_outcome_check;
ALTER TABLE public.admin_bridge_audit ADD CONSTRAINT admin_bridge_audit_outcome_check
  CHECK (outcome IN ('started', 'ok', 'not_found', 'bad_request', 'conflict', 'denied', 'replayed'));

-- One row per (kid, idempotency key), kept 24 hours. A committed row is always 'done': begin claims it and finish
-- stores the answer in the same transaction, and a transaction that fails takes its claim with it.
CREATE TABLE IF NOT EXISTS public.admin_bridge_idempotency (
  kid          text NOT NULL,
  key          text NOT NULL CHECK (key ~ '^[A-Za-z0-9_-]{22}$'),
  method       text NOT NULL,
  path         text NOT NULL,
  body_sha256  text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  audit_id     uuid NOT NULL,
  status       text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'done')),
  response     jsonb,
  at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kid, key)
);
CREATE INDEX IF NOT EXISTS admin_bridge_idempotency_at ON public.admin_bridge_idempotency (at);

-- Append-only: one row per row a bridge write changed, with before and after, in the write's transaction.
CREATE TABLE IF NOT EXISTS public.admin_bridge_change (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audit_id    uuid NOT NULL,
  table_name  text NOT NULL,
  row_id      uuid NOT NULL,
  op          text NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_bridge_change_audit ON public.admin_bridge_change (audit_id);
CREATE INDEX IF NOT EXISTS admin_bridge_change_row ON public.admin_bridge_change (table_name, row_id, at DESC);

REVOKE ALL ON public.admin_bridge_idempotency, public.admin_bridge_change
  FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
REVOKE ALL ON public.admin_bridge_audit, public.admin_bridge_nonce FROM gsam_bridge_write, gsam_bridge_refund;
ALTER TABLE public.admin_bridge_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bridge_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bridge_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bridge_change FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_all ON public.admin_bridge_idempotency;
CREATE POLICY owner_all ON public.admin_bridge_idempotency FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS owner_insert ON public.admin_bridge_change;
CREATE POLICY owner_insert ON public.admin_bridge_change FOR INSERT TO CURRENT_USER WITH CHECK (true);
DROP POLICY IF EXISTS owner_read ON public.admin_bridge_change;
CREATE POLICY owner_read ON public.admin_bridge_change FOR SELECT TO CURRENT_USER USING (true);

-- 048's begin, as the one body every capability shares. No grant: only the begin functions call it.
CREATE OR REPLACE FUNCTION _admin_bridge_open(p_kid text, p_capability text, p_nonce text, p_time bigint,
  p_actor text, p_run uuid, p_method text, p_path text)
RETURNS TABLE (audit_id uuid, org_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text := split_part(p_actor, ':', 1);
  v_id   text := substr(p_actor, length(split_part(p_actor, ':', 1)) + 2);
  v_org  uuid;
  v_audit uuid;
BEGIN
  IF p_time IS NULL OR abs(extract(epoch FROM now()) - p_time) > 60 THEN
    RAISE EXCEPTION 'bridge request time outside the window' USING ERRCODE = 'GB001';
  END IF;
  IF p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9_-]{22}$' THEN
    RAISE EXCEPTION 'bridge nonce malformed' USING ERRCODE = 'GB002';
  END IF;
  DELETE FROM admin_bridge_nonce WHERE seen_at < now() - interval '10 minutes';
  INSERT INTO admin_bridge_nonce (kid, nonce) VALUES (p_kid, p_nonce);
  SELECT o.id INTO v_org FROM organisations o ORDER BY o.created_at LIMIT 1;
  INSERT INTO admin_bridge_audit (kid, capability, actor_type, actor_id, gsam_run_id, method, path, nonce)
    VALUES (p_kid, p_capability, v_type, v_id, p_run, p_method, p_path, p_nonce)
    RETURNING id INTO v_audit;
  RETURN QUERY SELECT v_audit, v_org;
END $$;
REVOKE ALL ON FUNCTION _admin_bridge_open(text, text, text, bigint, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- 048's read begin now opens read rows only, so no role can open an audit row in another capability's name.
CREATE OR REPLACE FUNCTION admin_bridge_begin(p_kid text, p_capability text, p_nonce text, p_time bigint,
  p_actor text, p_run uuid, p_method text, p_path text)
RETURNS TABLE (audit_id uuid, org_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_capability IS DISTINCT FROM 'read' THEN
    RAISE EXCEPTION 'admin_bridge_begin opens read calls only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM _admin_bridge_open(p_kid, 'read', p_nonce, p_time, p_actor, p_run, p_method, p_path);
END $$;

-- Opens a write or refund call and claims its idempotency key in the same transaction as the nonce.
--   replay:   the stored answer when the key was used before for the same method, path and body
--   mismatch: true when the key was used before for something else
-- A second call while the first is still running waits on the key's row, then sees the first one's answer.
CREATE OR REPLACE FUNCTION _admin_bridge_open_idempotent(p_capability text, p_kid text, p_nonce text, p_time bigint,
  p_actor text, p_run uuid, p_method text, p_path text, p_key text, p_body_sha256 text)
RETURNS TABLE (audit_id uuid, org_id uuid, replay jsonb, mismatch boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open record;
  v_row admin_bridge_idempotency%ROWTYPE;
BEGIN
  SELECT * INTO v_open FROM _admin_bridge_open(p_kid, p_capability, p_nonce, p_time, p_actor, p_run, p_method, p_path);
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{22}$' OR p_body_sha256 IS NULL OR p_body_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'bridge idempotency key malformed' USING ERRCODE = 'GB004';
  END IF;
  DELETE FROM admin_bridge_idempotency WHERE at < now() - interval '24 hours';
  INSERT INTO admin_bridge_idempotency (kid, key, method, path, body_sha256, audit_id)
    VALUES (p_kid, p_key, p_method, p_path, p_body_sha256, v_open.audit_id)
    ON CONFLICT (kid, key) DO NOTHING;
  IF FOUND THEN
    RETURN QUERY SELECT v_open.audit_id, v_open.org_id, NULL::jsonb, false;
    RETURN;
  END IF;
  SELECT * INTO v_row FROM admin_bridge_idempotency WHERE kid = p_kid AND key = p_key FOR UPDATE;
  IF v_row.method <> p_method OR v_row.path <> p_path OR v_row.body_sha256 <> p_body_sha256 THEN
    RETURN QUERY SELECT v_open.audit_id, v_open.org_id, NULL::jsonb, true;
  ELSE
    RETURN QUERY SELECT v_open.audit_id, v_open.org_id, v_row.response, false;
  END IF;
END $$;
REVOKE ALL ON FUNCTION _admin_bridge_open_idempotent(text, text, text, bigint, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- Closes the audit row this transaction opened and stores the answer under the key it claimed (none on a replay
-- or a mismatch: those calls claimed nothing).
CREATE OR REPLACE FUNCTION _admin_bridge_close(p_capability text, p_audit uuid, p_resource text, p_resource_id text,
  p_outcome text, p_row_count integer, p_response jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE admin_bridge_audit SET resource = p_resource, resource_id = p_resource_id, outcome = p_outcome,
    row_count = p_row_count
  WHERE id = p_audit AND capability = p_capability AND outcome = 'started' AND at = now();
  IF NOT FOUND THEN RAISE EXCEPTION 'no open bridge audit row in this transaction' USING ERRCODE = 'GB003'; END IF;
  UPDATE admin_bridge_idempotency SET status = 'done', response = p_response WHERE audit_id = p_audit AND status = 'started';
END $$;
REVOKE ALL ON FUNCTION _admin_bridge_close(text, uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- One begin and one finish per capability, each callable by its own role only.
CREATE OR REPLACE FUNCTION admin_bridge_begin_write(p_kid text, p_nonce text, p_time bigint, p_actor text, p_run uuid,
  p_method text, p_path text, p_key text, p_body_sha256 text)
RETURNS TABLE (audit_id uuid, org_id uuid, replay jsonb, mismatch boolean)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM _admin_bridge_open_idempotent('write', p_kid, p_nonce, p_time, p_actor, p_run, p_method, p_path, p_key, p_body_sha256) $$;
CREATE OR REPLACE FUNCTION admin_bridge_finish_write(p_audit uuid, p_resource text, p_resource_id text, p_outcome text,
  p_row_count integer, p_response jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT _admin_bridge_close('write', p_audit, p_resource, p_resource_id, p_outcome, p_row_count, p_response) $$;
CREATE OR REPLACE FUNCTION admin_bridge_begin_refund(p_kid text, p_nonce text, p_time bigint, p_actor text, p_run uuid,
  p_method text, p_path text, p_key text, p_body_sha256 text)
RETURNS TABLE (audit_id uuid, org_id uuid, replay jsonb, mismatch boolean)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM _admin_bridge_open_idempotent('refund_request', p_kid, p_nonce, p_time, p_actor, p_run, p_method, p_path, p_key, p_body_sha256) $$;
CREATE OR REPLACE FUNCTION admin_bridge_finish_refund(p_audit uuid, p_resource text, p_resource_id text, p_outcome text,
  p_row_count integer, p_response jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT _admin_bridge_close('refund_request', p_audit, p_resource, p_resource_id, p_outcome, p_row_count, p_response) $$;
REVOKE ALL ON FUNCTION admin_bridge_begin_write(text, text, bigint, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_bridge_finish_write(uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_bridge_begin_refund(text, text, bigint, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_bridge_finish_refund(uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_bridge_begin_write(text, text, bigint, text, uuid, text, text, text, text) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION admin_bridge_finish_write(uuid, text, text, text, integer, jsonb) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION admin_bridge_begin_refund(text, text, bigint, text, uuid, text, text, text, text) TO gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION admin_bridge_finish_refund(uuid, text, text, text, integer, jsonb) TO gsam_bridge_refund;

-- ── refund requests ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  order_id           uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_minor       bigint NOT NULL CHECK (amount_minor > 0),
  currency           char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason             text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  status             text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'done', 'cancelled')),
  requested_by       text NOT NULL CHECK (requested_by ~ '^(agent|user|system):[A-Za-z0-9_-]{1,64}$'),
  gsam_run_id        uuid,
  gsam_approval_ref  text CHECK (char_length(gsam_approval_ref) <= 200),
  decided_by         text CHECK (decided_by ~ '^user:[A-Za-z0-9_-]{1,64}$'),
  decided_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((decided_by IS NULL) = (decided_at IS NULL)),
  CHECK (status = 'requested' OR status = 'cancelled' OR decided_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON public.refund_requests (order_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_org ON public.refund_requests (org_id, created_at);
REVOKE ALL ON public.refund_requests FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_write, gsam_bridge_refund;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_all ON public.refund_requests;
CREATE POLICY owner_all ON public.refund_requests FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Matches the order's refunds to its approved requests, from totals: unallocated = refunded - done requests. Walks
-- approved requests oldest decision first and marks each done while it fits; stops at the first that does not, so
-- a later small request never jumps an older large one. Reading totals makes a repeated or late webhook harmless.
CREATE OR REPLACE FUNCTION _refund_allocate(p_order uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_left bigint;
  r record;
BEGIN
  SELECT o.refunded_minor - coalesce((SELECT sum(q.amount_minor) FROM refund_requests q
                                       WHERE q.order_id = o.id AND q.status = 'done'), 0)
    INTO v_left FROM orders o WHERE o.id = p_order;
  IF v_left IS NULL OR v_left <= 0 THEN RETURN; END IF;
  FOR r IN SELECT q.id, q.amount_minor FROM refund_requests q WHERE q.order_id = p_order AND q.status = 'approved'
           ORDER BY q.decided_at, q.id FOR UPDATE LOOP
    EXIT WHEN r.amount_minor > v_left;
    UPDATE refund_requests SET status = 'done' WHERE id = r.id;
    v_left := v_left - r.amount_minor;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION _refund_allocate(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION refund_requests_match() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _refund_allocate(NEW.id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION refund_requests_match() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_refund_requests_match ON public.orders;
CREATE TRIGGER trg_refund_requests_match AFTER UPDATE OF refunded_minor ON public.orders
  FOR EACH ROW WHEN (NEW.refunded_minor IS DISTINCT FROM OLD.refunded_minor) EXECUTE FUNCTION refund_requests_match();

-- Records a refund request. Moves no money. The order must be this org's, not deleted, and the amount must fit in
-- total - refunded - open requests; the order row lock makes two requests at once take turns.
CREATE OR REPLACE FUNCTION bridge_request_refund(p_order uuid, p_amount_minor bigint, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('refund_request');
  o orders%ROWTYPE;
  v_open bigint;
  v_req refund_requests%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'GB404'; END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'amount must be above zero' USING ERRCODE = 'GB400'; END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 OR char_length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'a reason of 1 to 2000 characters is needed' USING ERRCODE = 'GB400';
  END IF;
  SELECT coalesce(sum(amount_minor), 0) INTO v_open FROM refund_requests
   WHERE order_id = p_order AND status IN ('requested', 'approved');
  IF p_amount_minor > o.total_minor - o.refunded_minor - v_open THEN
    RAISE EXCEPTION 'amount is more than the order has left to refund' USING ERRCODE = 'GBR01';
  END IF;
  INSERT INTO refund_requests (org_id, order_id, amount_minor, currency, reason, requested_by, gsam_run_id)
    VALUES (ctx.org_id, p_order, p_amount_minor, o.currency, p_reason, ctx.actor, ctx.run)
    RETURNING * INTO v_req;
  RETURN to_jsonb(v_req) - 'org_id';
END $$;

-- A person approves or rejects a request that is still 'requested'. Approving also runs the match, so a refund
-- already made in Stripe before the approval is picked up.
CREATE OR REPLACE FUNCTION bridge_refund_decision(p_request uuid, p_decision text, p_approval_ref text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('refund_request');
  v_req refund_requests%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision is approved or rejected' USING ERRCODE = 'GB400';
  END IF;
  SELECT * INTO v_req FROM refund_requests WHERE id = p_request AND org_id = ctx.org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund request not found' USING ERRCODE = 'GB404'; END IF;
  IF v_req.status <> 'requested' THEN RAISE EXCEPTION 'refund request is already %', v_req.status USING ERRCODE = 'GB409'; END IF;
  UPDATE refund_requests SET status = p_decision, decided_by = ctx.actor, decided_at = now(),
    gsam_approval_ref = p_approval_ref
  WHERE id = p_request;
  IF p_decision = 'approved' THEN PERFORM _refund_allocate(v_req.order_id); END IF;
  SELECT * INTO v_req FROM refund_requests WHERE id = p_request;
  RETURN to_jsonb(v_req) - 'org_id';
END $$;
REVOKE ALL ON FUNCTION bridge_request_refund(uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION bridge_refund_decision(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION bridge_request_refund(uuid, bigint, text) TO gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_refund_decision(uuid, text, text) TO gsam_bridge_refund;

-- ── what the read role may read ─────────────────────────────────────────────────────────────────────
-- Whether Stripe took the payment, so the payment report never needs the payment intent id.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_by_stripe boolean
  GENERATED ALWAYS AS (stripe_payment_intent IS NOT NULL) STORED;

-- Column grants: no user ids (created_by, updated_by, changed_by), no search vectors, no import rollback tokens
-- or raw spreadsheet rows. row_version is readable so GSAM can send expectedRowVersion.
GRANT SELECT (row_version) ON public.quotes TO gsam_bridge_read;
GRANT SELECT (row_version, paid_by_stripe) ON public.orders TO gsam_bridge_read;
GRANT SELECT (id, org_id, slug, name, domain, logo_asset_id, logo_url, description, status, sort_order,
  activation_instructions, created_at, updated_at, published_at, deleted_at, row_version)
  ON public.vendors TO gsam_bridge_read;
GRANT SELECT (id, org_id, parent_id, slug, name, description, icon_asset_id, icon_url, status, sort_order, created_at,
  updated_at, published_at, deleted_at, row_version)
  ON public.categories TO gsam_bridge_read;
GRANT SELECT (id, org_id, type, vendor_id, category_id, slug, name, short_description, description, platforms, tags,
  status, featured, fulfilment, primary_image_id, from_price_minor, from_price_currency, attributes, seo, created_at,
  updated_at, published_at, deleted_at, row_version)
  ON public.offerings TO gsam_bridge_read;
GRANT SELECT (id, org_id, offering_id, sku, name, license_type, platform, billing_period, base_price_minor, currency,
  min_order_qty, list_discount_pct, sort_order, created_at, updated_at, deleted_at, row_version)
  ON public.offering_variants TO gsam_bridge_read;
GRANT SELECT (id, org_id, offering_id, label, value, sort_order) ON public.offering_specs TO gsam_bridge_read;
GRANT SELECT (id, org_id, offering_id, asset_id, sort_order, created_at) ON public.offering_media TO gsam_bridge_read;
GRANT SELECT (id, org_id, slug, name, rank, description, created_at, updated_at, deleted_at)
  ON public.customer_tiers TO gsam_bridge_read;
GRANT SELECT (id, org_id, name, active, scope_type, applies_to_offering_type, adjustment_type, adjustment_value,
  adjustment_value_pct, currency, audience, audience_tier_id, starts_at, ends_at, priority, floor_fraction, label,
  status, created_at, updated_at, published_at, deleted_at, row_version)
  ON public.pricing_rules TO gsam_bridge_read;
GRANT SELECT (id, org_id, rule_id, vendor_id, category_id, offering_id, tier_id) ON public.pricing_rule_targets TO gsam_bridge_read;
GRANT SELECT (id, org_id, usd_to_gbp_display_rate, created_at, updated_at, row_version) ON public.org_settings TO gsam_bridge_read;
GRANT SELECT (id, org_id, old_rate, new_rate, changed_at, note) ON public.fx_rate_history TO gsam_bridge_read;
GRANT SELECT (id, org_id, filename, type, status, dry_run, source_checksum, column_mapping, diff_summary, error_summary,
  total_rows, applied_at, rolled_back_at, created_at, deleted_at)
  ON public.import_jobs TO gsam_bridge_read;
GRANT SELECT (id, org_id, job_id, row_number, mapped, target_entity, match_key, action, errors, before, after)
  ON public.import_job_rows TO gsam_bridge_read;
GRANT SELECT (id, org_id, order_id, amount_minor, currency, reason, status, requested_by, gsam_run_id,
  gsam_approval_ref, decided_by, decided_at, created_at)
  ON public.refund_requests TO gsam_bridge_read;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media',
    'customer_tiers', 'pricing_rules', 'pricing_rule_targets', 'org_settings', 'fx_rate_history', 'import_jobs',
    'import_job_rows', 'refund_requests'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_read ON public.%I', t);
    EXECUTE format('CREATE POLICY gsam_bridge_read ON public.%I FOR SELECT TO gsam_bridge_read USING (org_id = app_bridge_org())', t);
  END LOOP;
END $$;

-- ── what the write role may read and change ─────────────────────────────────────────────────────────
-- SELECT: the read role's columns, on the tables it writes or reads back after a write.
DO $$
DECLARE
  t text;
  cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media',
    'customer_tiers', 'pricing_rules', 'pricing_rule_targets', 'org_settings', 'fx_rate_history', 'import_jobs',
    'import_job_rows', 'quotes', 'quote_items', 'orders', 'order_items'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ') INTO cols FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = t AND grantee = 'gsam_bridge_read' AND privilege_type = 'SELECT';
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO gsam_bridge_write', cols, t);
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_write ON public.%I', t);
    EXECUTE format('CREATE POLICY gsam_bridge_write ON public.%I FOR ALL TO gsam_bridge_write USING (org_id = app_bridge_write_org()) WITH CHECK (org_id = app_bridge_write_org())', t);
  END LOOP;
END $$;

-- INSERT and UPDATE on allow-listed columns only. status and published_at are never granted: publish and archive
-- go through bridge_set_status. Soft delete is an UPDATE of deleted_at.
GRANT INSERT (org_id, slug, name, domain, logo_asset_id, logo_url, description, sort_order, activation_instructions),
  UPDATE (slug, name, domain, logo_asset_id, logo_url, description, sort_order, activation_instructions, deleted_at)
  ON public.vendors TO gsam_bridge_write;
GRANT INSERT (org_id, parent_id, slug, name, description, icon_asset_id, icon_url, sort_order),
  UPDATE (parent_id, slug, name, description, icon_asset_id, icon_url, sort_order, deleted_at)
  ON public.categories TO gsam_bridge_write;
GRANT INSERT (org_id, type, vendor_id, category_id, slug, name, short_description, description, platforms, tags, featured,
    fulfilment, primary_image_id, from_price_minor, from_price_currency, attributes, seo),
  UPDATE (type, vendor_id, category_id, slug, name, short_description, description, platforms, tags, featured, fulfilment,
    primary_image_id, from_price_minor, from_price_currency, attributes, seo, deleted_at)
  ON public.offerings TO gsam_bridge_write;
GRANT INSERT (org_id, offering_id, sku, name, license_type, platform, billing_period, base_price_minor, currency,
    min_order_qty, list_discount_pct, sort_order),
  UPDATE (sku, name, license_type, platform, billing_period, base_price_minor, currency, min_order_qty, list_discount_pct,
    sort_order, deleted_at)
  ON public.offering_variants TO gsam_bridge_write;
GRANT INSERT (org_id, offering_id, label, value, sort_order), DELETE ON public.offering_specs TO gsam_bridge_write;
GRANT INSERT (org_id, offering_id, asset_id, sort_order), DELETE ON public.offering_media TO gsam_bridge_write;
GRANT INSERT (org_id, name, active, scope_type, applies_to_offering_type, adjustment_type, adjustment_value,
    adjustment_value_pct, currency, audience, audience_tier_id, starts_at, ends_at, priority, floor_fraction, label),
  UPDATE (name, active, scope_type, applies_to_offering_type, adjustment_type, adjustment_value, adjustment_value_pct,
    currency, audience, audience_tier_id, starts_at, ends_at, priority, floor_fraction, label, deleted_at)
  ON public.pricing_rules TO gsam_bridge_write;
GRANT INSERT (org_id, rule_id, vendor_id, category_id, offering_id, tier_id), DELETE ON public.pricing_rule_targets TO gsam_bridge_write;
GRANT UPDATE (status, po_reference, quoted_total_minor, valid_until) ON public.quotes TO gsam_bridge_write;
GRANT INSERT (org_id, filename, type, status, dry_run, source_checksum, column_mapping, diff_summary, error_summary, total_rows)
  ON public.import_jobs TO gsam_bridge_write;
GRANT INSERT (org_id, job_id, row_number, raw, mapped, target_entity, match_key, action, errors, before, after)
  ON public.import_job_rows TO gsam_bridge_write;

-- ── scope: the bridge roles see their org's rows and nothing else ───────────────────────────────────
-- Permissive policies are OR'd, and the public_read (published catalogue, org_settings) and org_isolation
-- (app.current_org) policies apply TO public. A restrictive policy per bridge role ANDs its org onto all of them.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'customer_users', 'quotes', 'quote_items', 'orders', 'order_items',
    'licence_keys', 'portal_documents', 'portal_acceptances', 'service_inquiries', 'front_door_leads',
    'vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media', 'customer_tiers',
    'pricing_rules', 'pricing_rule_targets', 'org_settings', 'fx_rate_history', 'import_jobs', 'import_job_rows',
    'refund_requests'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_read_scope ON public.%I', t);
    EXECUTE format('CREATE POLICY gsam_bridge_read_scope ON public.%I AS RESTRICTIVE FOR ALL TO gsam_bridge_read USING (org_id = app_bridge_org()) WITH CHECK (false)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media',
    'customer_tiers', 'pricing_rules', 'pricing_rule_targets', 'org_settings', 'fx_rate_history', 'import_jobs',
    'import_job_rows', 'quotes', 'quote_items', 'orders', 'order_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_write_scope ON public.%I', t);
    EXECUTE format('CREATE POLICY gsam_bridge_write_scope ON public.%I AS RESTRICTIVE FOR ALL TO gsam_bridge_write USING (org_id = app_bridge_write_org()) WITH CHECK (org_id = app_bridge_write_org())', t);
  END LOOP;
END $$;

-- ── guards on the write role's own statements ───────────────────────────────────────────────────────
-- Whether an id is a live row of the bridge's org, for references the write role cannot read (media_assets) or
-- that a foreign key alone would let cross organisations.
CREATE OR REPLACE FUNCTION _bridge_ref_ok(p_table text, p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean;
BEGIN
  IF p_id IS NULL THEN RETURN true; END IF;
  IF p_table NOT IN ('vendors', 'categories', 'offerings', 'pricing_rules', 'customer_tiers', 'media_assets') THEN RETURN false; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL)', p_table)
    INTO v USING p_id, app_bridge_write_org();
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION _bridge_ref_ok(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _bridge_ref_ok(text, uuid) TO gsam_bridge_write;

-- Catalogue rows the write role makes are drafts; it never changes status; an actor that is not a person changes
-- only draft rows, and child rows only of a draft parent. Fires for the write role only: staff, the owner and the
-- SECURITY DEFINER bridge_* functions are not affected. Column grants are the first lock; this is the second.
CREATE OR REPLACE FUNCTION guard_bridge_catalogue_write() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_person boolean;
  v_row jsonb;
  v_parent text;
  v_ref record;
BEGIN
  IF current_user <> 'gsam_bridge_write' THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  v_person := split_part(coalesce(app_bridge_write_actor(), ''), ':', 1) = 'user';
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP <> 'DELETE' THEN
    FOR v_ref IN SELECT * FROM (VALUES ('vendor_id', 'vendors'), ('category_id', 'categories'), ('parent_id', 'categories'),
        ('offering_id', 'offerings'), ('rule_id', 'pricing_rules'), ('tier_id', 'customer_tiers'),
        ('audience_tier_id', 'customer_tiers'), ('logo_asset_id', 'media_assets'), ('icon_asset_id', 'media_assets'),
        ('primary_image_id', 'media_assets'), ('asset_id', 'media_assets')) r(col, tbl) LOOP
      IF v_row ? v_ref.col AND (TG_OP = 'INSERT' OR v_row -> v_ref.col IS DISTINCT FROM to_jsonb(OLD) -> v_ref.col)
         AND NOT _bridge_ref_ok(v_ref.tbl, (v_row ->> v_ref.col)::uuid) THEN
        RAISE EXCEPTION '% is not a live row of this organisation', v_ref.col USING ERRCODE = 'GB400';
      END IF;
    END LOOP;
  END IF;
  IF TG_TABLE_NAME IN ('vendors', 'categories', 'offerings', 'pricing_rules') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'draft';
      NEW.published_at := NULL;
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
      RAISE EXCEPTION 'status changes go through publish or archive' USING ERRCODE = '42501';
    END IF;
    IF NOT v_person AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only a person may change a % row that is not a draft', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
  ELSIF NOT v_person THEN
    IF TG_TABLE_NAME = 'pricing_rule_targets' THEN
      SELECT status::text INTO v_parent FROM pricing_rules WHERE id = (v_row ->> 'rule_id')::uuid;
    ELSE
      SELECT status::text INTO v_parent FROM offerings WHERE id = (v_row ->> 'offering_id')::uuid;
    END IF;
    IF v_parent IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'only a person may change % of a parent that is not a draft', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION guard_bridge_catalogue_write() FROM PUBLIC, anon, authenticated, service_role;

-- An import the write role makes is a dry run, validated or failed, and its rows go only into a job made in the
-- same transaction, so no one can add rows to a job a person is about to apply.
CREATE OR REPLACE FUNCTION guard_bridge_import_write() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'gsam_bridge_write' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'import_jobs' THEN
    IF NEW.status NOT IN ('validated', 'failed') OR NOT NEW.dry_run THEN
      RAISE EXCEPTION 'the bridge makes dry-run imports only' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM import_jobs j WHERE j.id = NEW.job_id AND j.created_at = now()) THEN
    RAISE EXCEPTION 'import rows go only into a job made in this transaction' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_bridge_import_write() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'pricing_rules', 'offering_variants', 'offering_specs',
    'offering_media', 'pricing_rule_targets'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_bridge_write ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_guard_bridge_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION guard_bridge_catalogue_write()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['import_jobs', 'import_job_rows'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_bridge_write ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_guard_bridge_write BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION guard_bridge_import_write()', t);
  END LOOP;
END $$;

-- ── the change log ──────────────────────────────────────────────────────────────────────────────────
-- One row per changed row while the claims say cap = write, in the same transaction, with the audit row that
-- names the actor. Write claims with no open audit row are refused, so a write cannot go unlogged.
CREATE OR REPLACE FUNCTION admin_bridge_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_audit uuid;
BEGIN
  IF c IS NULL OR c ->> 'role' IS DISTINCT FROM 'gsam_bridge' OR c ->> 'cap' IS DISTINCT FROM 'write' THEN RETURN NULL; END IF;
  SELECT audit_id INTO v_audit FROM app_bridge_open_audit('write');
  IF v_audit IS NULL THEN RAISE EXCEPTION 'bridge write with no open audit row' USING ERRCODE = 'GB003'; END IF;
  INSERT INTO admin_bridge_change (audit_id, table_name, row_id, op, before, after)
    VALUES (v_audit, TG_TABLE_NAME, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, lower(TG_OP),
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'search_tsv' - 'stripe_payment_intent' END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'search_tsv' - 'stripe_payment_intent' END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION admin_bridge_log_change() FROM PUBLIC, anon, authenticated, service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media',
    'pricing_rules', 'pricing_rule_targets', 'org_settings', 'quotes', 'orders', 'order_items', 'import_jobs',
    'import_job_rows'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION admin_bridge_log_change()', t);
  END LOOP;
END $$;

-- ── shared bodies: the staff functions and the bridge functions run the same code ───────────────────
CREATE OR REPLACE FUNCTION _next_invoice_number() RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_no_seq')::text, 5, '0') $$;
REVOKE ALL ON FUNCTION _next_invoice_number() FROM PUBLIC, anon, authenticated, service_role;

-- 014's convert_quote_to_order body, for any org. p_issue = true is the staff path: the order is confirmed with an
-- invoice number. p_issue = false is the bridge's invoice draft: pending, no number, not placed.
CREATE OR REPLACE FUNCTION _convert_quote(p_org uuid, p_quote_id uuid, p_issue boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q quotes%ROWTYPE;
  v_oid uuid; v_sub bigint; v_total bigint; v_inv text;
BEGIN
  SELECT * INTO q FROM quotes WHERE id = p_quote_id AND org_id = p_org AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote not found'; END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE quote_id = p_quote_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'quote already converted to an order';
  END IF;
  SELECT COALESCE(sum(COALESCE(captured_price_minor, 0) * qty), 0) INTO v_sub FROM quote_items WHERE quote_id = p_quote_id;
  -- inc-VAT total: the staff's finalised figure if set, else subtotal + 20% VAT
  v_total := COALESCE(q.quoted_total_minor, round(v_sub * 1.20));
  v_inv := CASE WHEN p_issue THEN _next_invoice_number() END;
  INSERT INTO orders(org_id, reference, quote_id, customer_id, customer_user_id, customer_email, status, currency, subtotal_minor, total_minor, po_reference, invoice_number, placed_at)
    VALUES (p_org, q.reference || '-ORD', p_quote_id, q.customer_id, q.customer_user_id, q.contact_email,
            CASE WHEN p_issue THEN 'confirmed' ELSE 'pending' END::order_status, q.currency, v_sub, v_total, q.po_reference,
            v_inv, CASE WHEN p_issue THEN now() END)
    RETURNING id INTO v_oid;
  INSERT INTO order_items(org_id, order_id, offering_id, variant_id, applied_rule_id, offering_name, variant_name, qty, unit_price_minor, line_total_minor, currency)
    SELECT p_org, v_oid, offering_id, variant_id, applied_rule_id, offering_name, variant_name, qty,
           COALESCE(captured_price_minor, 0), COALESCE(captured_price_minor, 0) * qty, currency
      FROM quote_items WHERE quote_id = p_quote_id;
  UPDATE quotes SET status = 'won', updated_at = now() WHERE id = p_quote_id;
  RETURN jsonb_build_object('order_id', v_oid, 'invoice_number', v_inv);
END; $$;
REVOKE ALL ON FUNCTION _convert_quote(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- Staff, unchanged in what it does: confirmed order with an invoice number, in one step.
CREATE OR REPLACE FUNCTION convert_quote_to_order(p_quote_id uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := app_staff_org();
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'not authorised (catalogue editor only)'; END IF;
  RETURN _convert_quote(v_org, p_quote_id, true);
END; $$;

-- 012's import_skus body, for any org.
CREATE OR REPLACE FUNCTION _import_skus(v_org uuid, p_creates jsonb, p_updates jsonb)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c jsonb; u jsonb;
  v_slug citext; v_oid uuid; v_vendor uuid; v_cat uuid;
  v_created int := 0; v_updated int := 0;
  v_touched uuid[] := '{}';
  fn_slug text;
BEGIN
  -- CREATES: resolve/auto-create parent offering (+ vendor/category), then insert the variant.
  FOR c IN SELECT value FROM jsonb_array_elements(p_creates) LOOP
    v_slug := c->>'offeringSlug';
    SELECT id INTO v_oid FROM offerings WHERE org_id = v_org AND slug = v_slug AND deleted_at IS NULL LIMIT 1;
    IF v_oid IS NULL THEN
      v_vendor := NULL;
      IF NULLIF(c->>'vendor', '') IS NOT NULL THEN
        fn_slug := trim(both '-' from regexp_replace(lower(c->>'vendor'), '[^a-z0-9]+', '-', 'g'));
        SELECT id INTO v_vendor FROM vendors WHERE org_id = v_org AND (slug = fn_slug OR lower(name) = lower(c->>'vendor')) LIMIT 1;
        IF v_vendor IS NULL THEN
          INSERT INTO vendors(org_id, slug, name) VALUES (v_org, left(fn_slug, 60), c->>'vendor') RETURNING id INTO v_vendor;
        END IF;
      END IF;
      v_cat := NULL;
      IF NULLIF(c->>'category', '') IS NOT NULL THEN
        fn_slug := trim(both '-' from regexp_replace(lower(c->>'category'), '[^a-z0-9]+', '-', 'g'));
        SELECT id INTO v_cat FROM categories WHERE org_id = v_org AND (slug = fn_slug OR lower(name) = lower(c->>'category')) LIMIT 1;
        IF v_cat IS NULL THEN
          INSERT INTO categories(org_id, slug, name) VALUES (v_org, left(fn_slug, 60), c->>'category') RETURNING id INTO v_cat;
        END IF;
      END IF;
      INSERT INTO offerings(org_id, slug, name, type, status, featured, fulfilment, vendor_id, category_id)
        VALUES (v_org, v_slug, COALESCE(NULLIF(c->>'offeringName', ''), v_slug::text), 'product',
                COALESCE(NULLIF(c->>'status', ''), 'draft')::publish_status, COALESCE((c->>'featured')::boolean, false),
                'license', v_vendor, v_cat)
        RETURNING id INTO v_oid;
    END IF;
    INSERT INTO offering_variants(org_id, offering_id, sku, name, license_type, billing_period, base_price_minor, currency)
      VALUES (v_org, v_oid, c->>'sku', COALESCE(NULLIF(c#>>'{variant,name}', ''), 'Standard'),
              NULLIF(c#>>'{variant,license_type}', ''),
              COALESCE(NULLIF(c#>>'{variant,billing_period}', ''), 'perpetual')::billing_period,
              NULLIF(c#>>'{variant,base_price_minor}', '')::bigint,
              CASE WHEN NULLIF(c#>>'{variant,base_price_minor}', '') IS NOT NULL THEN 'USD' ELSE NULL END);
    v_created := v_created + 1;
    v_touched := array_append(v_touched, v_oid);
  END LOOP;

  -- UPDATES: patch only changed fields by variant id (org-scoped).
  FOR u IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    UPDATE offering_variants SET
      name             = COALESCE(NULLIF(u#>>'{changes,name,to}', ''), name),
      license_type     = COALESCE(u#>>'{changes,license_type,to}', license_type),
      billing_period   = COALESCE(NULLIF(u#>>'{changes,billing_period,to}', ''), billing_period::text)::billing_period,
      base_price_minor = COALESCE((u#>>'{changes,base_price_minor,to}')::bigint, base_price_minor),
      currency         = CASE WHEN (u#>>'{changes,base_price_minor,to}') IS NOT NULL THEN 'USD' ELSE currency END,
      updated_at       = now()
    WHERE id = (u->>'variantId')::uuid AND org_id = v_org;
    IF FOUND THEN v_updated := v_updated + 1; v_touched := array_append(v_touched, (u->>'offeringId')::uuid); END IF;
  END LOOP;

  -- Recompute each touched offering's from_price (min USD across its priced, non-deleted variants).
  UPDATE offerings o SET
    from_price_minor = sub.m,
    from_price_currency = CASE WHEN sub.m IS NULL THEN NULL ELSE 'USD' END
  FROM (
    SELECT ov.offering_id, min(ov.base_price_minor) AS m
      FROM offering_variants ov
     WHERE ov.org_id = v_org AND ov.deleted_at IS NULL AND ov.base_price_minor IS NOT NULL
     GROUP BY ov.offering_id
  ) sub
  WHERE o.id = sub.offering_id AND o.id = ANY(v_touched);
  -- touched offerings left with no priced variant → POA
  UPDATE offerings SET from_price_minor = NULL, from_price_currency = NULL
   WHERE id = ANY(v_touched)
     AND NOT EXISTS (SELECT 1 FROM offering_variants v WHERE v.offering_id = offerings.id AND v.deleted_at IS NULL AND v.base_price_minor IS NOT NULL);

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END; $$;
REVOKE ALL ON FUNCTION _import_skus(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Staff, unchanged in what it does.
CREATE OR REPLACE FUNCTION import_skus(p_creates jsonb DEFAULT '[]'::jsonb, p_updates jsonb DEFAULT '[]'::jsonb)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := app_staff_org();
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'not authorised (catalogue editor only)'; END IF;
  RETURN _import_skus(v_org, p_creates, p_updates);
END; $$;

-- ── bridge write functions ──────────────────────────────────────────────────────────────────────────
-- Quote → invoice draft: a pending order with no invoice number. Agents may call it.
CREATE OR REPLACE FUNCTION bridge_convert_quote(p_quote uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx record := _bridge_ctx('write');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote AND org_id = ctx.org_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'quote not found' USING ERRCODE = 'GB404';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE quote_id = p_quote AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'quote already converted to an order' USING ERRCODE = 'GB409';
  END IF;
  RETURN (_convert_quote(ctx.org_id, p_quote, false) ->> 'order_id')::uuid;
END $$;

-- Edits an invoice draft while it is pending with no number. p_patch keys: po_reference, subtotal_minor,
-- total_minor, lines ([{offering_id, variant_id, offering_name, variant_name, qty, unit_price_minor}], replaces all).
-- With new lines and no subtotal, the subtotal is their sum; with a new subtotal and no total, the total is the
-- subtotal + 20% VAT, as convert does.
CREATE OR REPLACE FUNCTION bridge_edit_draft_invoice(p_order uuid, p_expected_row_version integer, p_patch jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  o orders%ROWTYPE;
  v_sub bigint;
  v_total bigint;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'GB404'; END IF;
  IF o.status <> 'pending' OR o.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'only a pending invoice draft with no number can be edited' USING ERRCODE = 'GB409';
  END IF;
  IF o.row_version IS DISTINCT FROM p_expected_row_version THEN RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409'; END IF;
  v_sub := (p_patch ->> 'subtotal_minor')::bigint;
  IF p_patch ? 'lines' THEN
    DELETE FROM order_items WHERE order_id = p_order;
    INSERT INTO order_items (org_id, order_id, offering_id, variant_id, offering_name, variant_name, qty, unit_price_minor,
                             line_total_minor, currency)
      SELECT ctx.org_id, p_order, l.offering_id, l.variant_id, l.offering_name, l.variant_name, l.qty, l.unit_price_minor,
             l.qty * l.unit_price_minor, o.currency
        FROM jsonb_to_recordset(p_patch -> 'lines') AS l(offering_id uuid, variant_id uuid, offering_name text,
             variant_name text, qty integer, unit_price_minor bigint);
    IF v_sub IS NULL THEN
      SELECT coalesce(sum(line_total_minor), 0) INTO v_sub FROM order_items WHERE order_id = p_order;
    END IF;
  END IF;
  v_sub := coalesce(v_sub, o.subtotal_minor);
  v_total := coalesce((p_patch ->> 'total_minor')::bigint,
                      CASE WHEN v_sub IS DISTINCT FROM o.subtotal_minor THEN round(v_sub * 1.20) ELSE o.total_minor END);
  UPDATE orders SET
    po_reference = CASE WHEN p_patch ? 'po_reference' THEN p_patch ->> 'po_reference' ELSE po_reference END,
    subtotal_minor = v_sub, total_minor = v_total
  WHERE id = p_order;
  RETURN p_order;
END $$;

-- People only: takes the next invoice number and confirms the order.
CREATE OR REPLACE FUNCTION bridge_issue_invoice(p_order uuid, p_expected_row_version integer) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  o orders%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  SELECT * INTO o FROM orders WHERE id = p_order AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'GB404'; END IF;
  IF o.status <> 'pending' OR o.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'invoice already issued' USING ERRCODE = 'GB409';
  END IF;
  IF o.row_version IS DISTINCT FROM p_expected_row_version THEN RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409'; END IF;
  UPDATE orders SET invoice_number = _next_invoice_number(), status = 'confirmed', placed_at = now() WHERE id = p_order;
  RETURN p_order;
END $$;

-- People only: applies a validated dry-run job through import_skus's body. Rows marked insert are its creates and
-- rows marked update its updates, in row order; each row's mapped value is one entry of that plan.
CREATE OR REPLACE FUNCTION bridge_import_apply(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  j import_jobs%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  SELECT * INTO j FROM import_jobs WHERE id = p_job AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'import not found' USING ERRCODE = 'GB404'; END IF;
  IF j.status <> 'validated' THEN RAISE EXCEPTION 'only a validated import can be applied (it is %)', j.status USING ERRCODE = 'GB409'; END IF;
  v_result := _import_skus(ctx.org_id,
    coalesce((SELECT jsonb_agg(r.mapped ORDER BY r.row_number) FROM import_job_rows r WHERE r.job_id = p_job AND r.action = 'insert'), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(r.mapped ORDER BY r.row_number) FROM import_job_rows r WHERE r.job_id = p_job AND r.action = 'update'), '[]'::jsonb));
  UPDATE import_jobs SET status = 'applied', applied_at = now(), dry_run = false WHERE id = p_job;
  RETURN v_result;
END $$;

-- People only: publish or archive a catalogue row, with its expected row version.
CREATE OR REPLACE FUNCTION bridge_set_status(p_table text, p_id uuid, p_status text, p_expected_row_version integer) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  n integer;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_table NOT IN ('vendors', 'categories', 'offerings', 'pricing_rules') THEN RAISE EXCEPTION 'table' USING ERRCODE = 'GB400'; END IF;
  IF p_status NOT IN ('published', 'archived') THEN RAISE EXCEPTION 'status' USING ERRCODE = 'GB400'; END IF;
  EXECUTE format('UPDATE %I SET status = $1::publish_status,
      published_at = CASE WHEN $1 = ''published'' THEN now() ELSE published_at END
    WHERE id = $2 AND org_id = $3 AND deleted_at IS NULL AND row_version = $4', p_table)
    USING p_status, p_id, ctx.org_id, p_expected_row_version;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    EXECUTE format('SELECT count(*) FROM %I WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL', p_table) INTO n USING p_id, ctx.org_id;
    IF n = 0 THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'GB404'; END IF;
    RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409';
  END IF;
  RETURN p_id;
END $$;

-- People only: the display rate. 007's trigger writes fx_rate_history (changed_by stays null); the change log
-- names the GSAM actor.
CREATE OR REPLACE FUNCTION bridge_set_fx(p_rate numeric, p_expected_row_version integer) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_id uuid;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  UPDATE org_settings SET usd_to_gbp_display_rate = p_rate, updated_by = NULL
   WHERE org_id = ctx.org_id AND row_version = p_expected_row_version RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM org_settings WHERE org_id = ctx.org_id) THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'GB404'; END IF;
    RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409';
  END IF;
  RETURN v_id;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['bridge_convert_quote(uuid)', 'bridge_edit_draft_invoice(uuid, integer, jsonb)',
    'bridge_issue_invoice(uuid, integer)', 'bridge_import_apply(uuid)', 'bridge_set_status(text, uuid, text, integer)',
    'bridge_set_fx(numeric, integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO gsam_bridge_write', f);
  END LOOP;
END $$;
