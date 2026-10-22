-- Port of supabase/migrations/0017_licence_keys.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0017_licence_keys.sql — customer licence keys (the software activation codes a buyer purchases).
-- Until now the #account order detail just showed a placeholder note. This gives keys a real home: a
-- per-customer store of issued keys that the buyer reads in a dedicated "Licence keys" section, and that
-- staff issue. Mirrors the established model: staff_all (org_id = app_staff_org()) OR'd with a customer_self
-- SELECT (customer_id = app_customer_id()); buyers get no write.

DO $$ BEGIN
  CREATE TYPE licence_key_status AS ENUM ('issued', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS licence_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,   -- which order it came from (optional)
    offering_name TEXT NOT NULL,                                   -- the product the key unlocks (display)
    variant_name  TEXT,                                            -- edition / licence type (optional)
    licence_key   TEXT NOT NULL,                                   -- the activation code itself
    seats         INTEGER CHECK (seats IS NULL OR seats >= 1),     -- optional seat count
    status        licence_key_status NOT NULL DEFAULT 'issued',
    delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ,                                     -- optional expiry (subscriptions)
    notes         TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by    UUID REFERENCES users(id),                       -- staff issuer
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version   INTEGER NOT NULL DEFAULT 1,
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_licence_keys_customer ON licence_keys(customer_id, delivered_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_licence_keys_org ON licence_keys(org_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_licence_keys ON licence_keys;
CREATE TRIGGER trg_touch_licence_keys BEFORE UPDATE ON licence_keys
  FOR EACH ROW EXECUTE FUNCTION touch_row();

ALTER TABLE licence_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE licence_keys FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON licence_keys TO authenticated;

-- staff (owner/admin/editor) manage their org's keys
DROP POLICY IF EXISTS staff_all ON licence_keys;
CREATE POLICY staff_all ON licence_keys FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- a buyer reads ONLY their own company's live keys (SELECT only — no buyer write policy)
DROP POLICY IF EXISTS customer_self ON licence_keys;
CREATE POLICY customer_self ON licence_keys FOR SELECT TO authenticated
  USING (customer_id = app_customer_id() AND deleted_at IS NULL);
