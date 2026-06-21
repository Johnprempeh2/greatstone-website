-- 0016_invite_request_guard.sql — close the cycle-4-7 review's high-severity insert-forgery hole.
-- 0015 gave buyers an INSERT policy but only checked customer_id + is-admin, leaving org_id, status,
-- requested_by and handled_* attacker-controlled (cross-tenant misfiling, queue/status forgery, fake
-- audit trail). Mirror the established BEFORE-trigger guard pattern: for a self-service buyer, the DB
-- STAMPS the trusted columns and ignores whatever the client sent. Also: scope the admin check to the
-- caller's own company (future-proofs multi-org), and stop duplicate pending invites for one email.

-- 1) Buyer insert guard — fires only for buyers (app_customer_id() not null); staff/service pass through.
CREATE OR REPLACE FUNCTION guard_invite_request_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF app_customer_id() IS NULL THEN RETURN NEW; END IF;     -- staff / service_role: unrestricted
  SELECT org_id INTO v_org FROM public.customers WHERE id = app_customer_id();
  NEW.org_id      := v_org;                                 -- derive from the company, never trust the client
  NEW.customer_id := app_customer_id();
  NEW.status      := 'pending';                             -- a buyer can only create a pending request
  NEW.handled_at  := NULL;
  NEW.handled_by  := NULL;
  NEW.requested_by := (SELECT id FROM public.customer_users               -- attribute to the actual caller
                        WHERE auth_subject = (auth.uid())::text AND deleted_at IS NULL LIMIT 1);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_invite_request_insert ON member_invite_requests;
CREATE TRIGGER trg_guard_invite_request_insert BEFORE INSERT ON member_invite_requests
  FOR EACH ROW EXECUTE FUNCTION guard_invite_request_insert();

-- 2) Scope admin-ness to the caller's own company (was org-agnostic; safe today only via the single-org
--    uniqueness index, but the build is heading multi-org). Used by 0014 guard + 0015 insert policy.
CREATE OR REPLACE FUNCTION app_customer_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.customer_users cu
       WHERE cu.auth_subject = (auth.uid())::text
         AND cu.customer_id = app_customer_id()
         AND cu.deleted_at IS NULL
         AND (cu.role = 'admin' OR cu.is_primary)
    )
  $$;

-- 3) One pending request per email per company (case-insensitive). Surfaces as 23505 → friendly no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_pending
  ON member_invite_requests(customer_id, lower(email)) WHERE status = 'pending';
