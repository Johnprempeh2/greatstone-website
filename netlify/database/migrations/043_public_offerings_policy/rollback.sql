-- Restore the legacy policy with the safe org helper. The 004 org policy is still the primary check.
CREATE POLICY offerings_tenant_isolation ON offerings
  USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
