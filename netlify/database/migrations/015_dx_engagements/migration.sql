-- Port of supabase/migrations/0013_dx_engagements.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0013_dx_engagements.sql — the DX (digital-experience) engagement timeline + a company-admin role.
--
-- Greatstone staff curate a per-company record of the engagement journey: meeting recaps, milestones,
-- deliverables, kickoffs, reviews and notes. Each item is EITHER inline rich content (body_html, rendered
-- sanitised) OR a link to a deployed artefact (external_url — e.g. a Netlify meeting-recap page, a Notion
-- doc). A signed-in buyer READS only their own company's SHARED items; only staff write. This mirrors the
-- established security model: 0004 staff_all (org_id = app_staff_org()) OR'd with a 0008-style customer_self.
--
-- Also: a first-class company-admin role on customer_users. is_primary stays the legacy "primary contact"
-- signal; role ('admin' | 'member') is the capability flag (future multi-admin), backfilled from is_primary.
-- The 0009 buyer-guard is extended so a buyer can never self-promote.

-- 1) Company-admin role (additive; backfilled from is_primary). -----------------------------------------
ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin','member'));
UPDATE customer_users SET role = 'admin' WHERE is_primary AND role <> 'admin';

-- Extend the 0009 BEFORE UPDATE guard: a self-service buyer may still only edit full_name / phone on their
-- OWN row. Adding role to the blocked-column list stops a buyer escalating themselves to company admin.
-- (Staff / service_role resolve app_customer_id() = NULL and pass through unrestricted, exactly as before.)
CREATE OR REPLACE FUNCTION guard_customer_user_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_customer_id() IS NULL THEN RETURN NEW; END IF;        -- staff / service_role / not-a-buyer: unrestricted
  IF NEW.customer_id  IS DISTINCT FROM OLD.customer_id
     OR NEW.org_id    IS DISTINCT FROM OLD.org_id
     OR NEW.auth_subject IS DISTINCT FROM OLD.auth_subject
     OR NEW.email     IS DISTINCT FROM OLD.email
     OR NEW.is_primary IS DISTINCT FROM OLD.is_primary
     OR NEW.role      IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'buyers may only edit name and phone';
  END IF;
  RETURN NEW;
END; $$;
-- (trigger trg_guard_customer_user_update from 0009 already points at this function — no re-create needed.)

-- 2) Engagement typing. ---------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE engagement_kind AS ENUM ('recap','milestone','deliverable','kickoff','review','note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE engagement_status AS ENUM ('draft','shared','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) The engagements table. -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind         engagement_kind   NOT NULL DEFAULT 'recap',
    status       engagement_status NOT NULL DEFAULT 'shared',     -- draft = staff-only; shared = visible to the customer
    title        TEXT NOT NULL,
    summary      TEXT,                                            -- 1–2 line teaser shown on the card
    body_html    TEXT,                                            -- optional inline rich content (sanitised on render)
    external_url TEXT,                                            -- optional link to a deployed recap / doc
    occurred_on  DATE NOT NULL DEFAULT current_date,              -- the date of the meeting / milestone (drives the timeline + past-vs-upcoming)
    phase        TEXT,                                            -- Discovery | Build | Adoption | Review (free text, optional grouping)
    owner_name   TEXT,                                            -- the Greatstone lead (display)
    attendees    TEXT[] NOT NULL DEFAULT '{}',                    -- names / emails present
    tags         TEXT[] NOT NULL DEFAULT '{}',
    pinned       BOOLEAN NOT NULL DEFAULT false,                  -- surfaced in the Highlights rail
    metadata     JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_by   UUID REFERENCES users(id),                       -- staff author
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version  INTEGER NOT NULL DEFAULT 1,
    deleted_at   TIMESTAMPTZ,
    -- an external link must be http(s); inline body is free-form
    CONSTRAINT chk_engagement_url CHECK (external_url IS NULL OR external_url ~* '^https?://'),
    -- a recap / deliverable should carry SOMETHING to open; milestones/kickoffs/reviews/notes can stand alone
    CONSTRAINT chk_engagement_content CHECK (
      kind IN ('milestone','note','kickoff','review')
      OR body_html IS NOT NULL OR external_url IS NOT NULL
    )
);
CREATE INDEX IF NOT EXISTS idx_engagements_customer ON engagements(customer_id, occurred_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_engagements_org ON engagements(org_id) WHERE deleted_at IS NULL;

-- updated_at / row_version maintenance (reuse the shared trigger fn from 0001).
DROP TRIGGER IF EXISTS trg_touch_engagements ON engagements;
CREATE TRIGGER trg_touch_engagements BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- 4) RLS — staff write their org; a buyer reads only their company's SHARED items. ----------------------
ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON engagements TO authenticated;

-- staff (owner/admin/editor) get full access to their org's rows (mirrors 0004 staff_all).
DROP POLICY IF EXISTS staff_all ON engagements;
CREATE POLICY staff_all ON engagements FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- a buyer reads ONLY their own company's shared, live items (mirrors 0008 customer_self). SELECT only —
-- there is no customer write policy, so a buyer INSERT/UPDATE/DELETE fails the only ALL policy (staff_all).
DROP POLICY IF EXISTS customer_self ON engagements;
CREATE POLICY customer_self ON engagements FOR SELECT TO authenticated
  USING (customer_id = app_customer_id() AND status = 'shared' AND deleted_at IS NULL);
