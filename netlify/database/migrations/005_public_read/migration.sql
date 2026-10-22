-- Port of supabase/migrations/0003_public_read.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0003_public_read.sql — let the PUBLIC storefront (anon role) read the PUBLISHED catalogue
-- without an org context. These are additive (permissive, OR'd with org_isolation): admins still
-- see their full org via the GUC; anonymous visitors see only published, non-deleted rows.
-- Writes remain org-gated + admin-only (these are FOR SELECT only).

DROP POLICY IF EXISTS public_read ON vendors;
CREATE POLICY public_read ON vendors FOR SELECT TO public
  USING (status = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS public_read ON categories;
CREATE POLICY public_read ON categories FOR SELECT TO public
  USING (status = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS public_read ON offerings;
CREATE POLICY public_read ON offerings FOR SELECT TO public
  USING (status = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS public_read ON offering_variants;
CREATE POLICY public_read ON offering_variants FOR SELECT TO public
  USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.status = 'published' AND o.deleted_at IS NULL));

DROP POLICY IF EXISTS public_read ON offering_specs;
CREATE POLICY public_read ON offering_specs FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.status = 'published' AND o.deleted_at IS NULL));

DROP POLICY IF EXISTS public_read ON offering_media;
CREATE POLICY public_read ON offering_media FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.status = 'published' AND o.deleted_at IS NULL));

DROP POLICY IF EXISTS public_read ON pricing_rules;
CREATE POLICY public_read ON pricing_rules FOR SELECT TO public
  USING (active AND status = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS public_read ON pricing_rule_targets;
CREATE POLICY public_read ON pricing_rule_targets FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM pricing_rules r WHERE r.id = rule_id AND r.active AND r.status = 'published' AND r.deleted_at IS NULL));

-- Table-level grants so Supabase's anon/authenticated roles can REACH these tables;
-- RLS (above) then filters which ROWS each role sees. (Admin write-grants land in Phase 2.)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON vendors, categories, offerings, offering_variants, offering_specs, offering_media, pricing_rules, pricing_rule_targets, permissions TO anon, authenticated;
