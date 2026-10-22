-- Port of supabase/migrations/0019_maturity_assessments.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0019_maturity_assessments.sql — per-customer eight-pillar digital-maturity assessments.
--
-- ⚠️ DORMANT: written for review, NOT yet applied. Do not apply until John signs off (DX-hub excellence
-- loop, cycle 12). Until it is applied the `maturity_assessments` table does not exist; the #org Maturity
-- Radar reads it, finds nothing, and falls back to a seeded prototype for the demo org only — so applying
-- this migration is purely promotional (prototype → live, staff-authored, re-scorable data). No app code
-- depends on the table existing.
--
-- Greatstone scores each client across the eight pillars (People, Communication, Innovation, Data,
-- Customer, Competition, Technology, Value) on a 1–10 scale, banded Pebble (1–4) / Plateau (5–7) /
-- Peak (8–10). Each assessment is a point-in-time snapshot: keeping a row per review date lets the
-- dashboard later plot the climb over time. A signed-in buyer READS only their own company's
-- assessments; only staff write. Mirrors the established model: 0004 staff_all (org_id = app_staff_org())
-- OR'd with a 0008/0013-style customer_self, plus the shared touch_row() trigger.

CREATE TABLE IF NOT EXISTS maturity_assessments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    assessed_on  DATE NOT NULL DEFAULT current_date,           -- the review date this snapshot reflects
    tier         TEXT,                                         -- denormalised overall band: 'pebble' | 'plateau' | 'peak'
    -- per-pillar scores, keyed by the eight canonical pillar slugs (people, communication, innovation,
    -- data, customer, competition, technology, value); each an integer 1–10. JSONB keeps the shape
    -- flexible as the pillar set evolves without a column churn.
    scores       JSONB NOT NULL DEFAULT '{}'::jsonb,
    benchmark    JSONB,                                        -- optional anonymised peer-average ring (same keys)
    target       JSONB,                                        -- optional target tier the engagement is climbing to (same keys)
    baseline     JSONB,                                        -- optional discovery starting point (for the "up from Pebble" story)
    notes        TEXT,
    created_by   UUID REFERENCES users(id),                    -- staff author
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version  INTEGER NOT NULL DEFAULT 1,
    deleted_at   TIMESTAMPTZ,
    CONSTRAINT chk_maturity_tier CHECK (tier IS NULL OR tier IN ('pebble','plateau','peak'))
);
CREATE INDEX IF NOT EXISTS idx_maturity_customer ON maturity_assessments(customer_id, assessed_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maturity_org ON maturity_assessments(org_id) WHERE deleted_at IS NULL;

-- updated_at / row_version maintenance (reuse the shared trigger fn from 0001).
DROP TRIGGER IF EXISTS trg_touch_maturity ON maturity_assessments;
CREATE TRIGGER trg_touch_maturity BEFORE UPDATE ON maturity_assessments
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- RLS — staff write their org; a buyer reads only their own company's live assessments. ----------------
ALTER TABLE maturity_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_assessments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON maturity_assessments TO authenticated;

-- staff (owner/admin/editor) get full access to their org's rows (mirrors 0004 staff_all).
DROP POLICY IF EXISTS staff_all ON maturity_assessments;
CREATE POLICY staff_all ON maturity_assessments FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- a buyer reads ONLY their own company's live assessments (mirrors 0008/0013 customer_self). SELECT only —
-- there is no customer write policy, so a buyer INSERT/UPDATE/DELETE fails the only ALL policy (staff_all).
DROP POLICY IF EXISTS customer_self ON maturity_assessments;
CREATE POLICY customer_self ON maturity_assessments FOR SELECT TO authenticated
  USING (customer_id = app_customer_id() AND deleted_at IS NULL);
