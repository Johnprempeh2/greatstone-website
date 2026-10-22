-- Port of supabase/migrations/0015_member_invite_requests.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0015_member_invite_requests.sql — let a company admin REQUEST a teammate in-product.
-- Provisioning real portal access stays staff-side (security model intact), but the admin no longer has
-- to leave the product and draft an email: they file a request, staff see it on the Clients & DX screen
-- and provision + mark it handled. Mirrors the request-quote pattern (customer fills a form → routed to
-- staff). Only the company admin may file; any member may see their company's requests; staff manage all.

DO $$ BEGIN
  CREATE TYPE invite_request_status AS ENUM ('pending', 'provisioned', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS member_invite_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES customer_users(id) ON DELETE SET NULL,
    full_name    TEXT,
    email        CITEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    note         TEXT,
    status       invite_request_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at   TIMESTAMPTZ,
    handled_by   UUID REFERENCES users(id),
    CONSTRAINT chk_invite_email CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
CREATE INDEX IF NOT EXISTS idx_invite_requests_customer ON member_invite_requests(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invite_requests_org ON member_invite_requests(org_id, status);

ALTER TABLE member_invite_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_invite_requests FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON member_invite_requests TO authenticated;

-- staff (owner/admin/editor) manage their org's requests
DROP POLICY IF EXISTS staff_all ON member_invite_requests;
CREATE POLICY staff_all ON member_invite_requests FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- only the company ADMIN may file a request, and only for their OWN company
DROP POLICY IF EXISTS customer_insert ON member_invite_requests;
CREATE POLICY customer_insert ON member_invite_requests FOR INSERT TO authenticated
  WITH CHECK (customer_id = app_customer_id() AND app_customer_is_admin());

-- any member may SEE their company's requests (no buyer UPDATE policy → buyers can't change status)
DROP POLICY IF EXISTS customer_self ON member_invite_requests;
CREATE POLICY customer_self ON member_invite_requests FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());
