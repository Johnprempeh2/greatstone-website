-- 0004 — staff write access (admin CMS).
-- A signed-in Supabase user whose auth.uid() maps to a public.users row with role
-- owner/admin/editor (active, not deleted) gets full read+write on THEIR org's catalogue &
-- pricing. Anonymous visitors stay read-only-published (0003). The JWT carries identity, so this
-- works for real Supabase Auth sessions; no app.current_org GUC needed for staff.

-- Resolve the signed-in staff user's org (SECURITY DEFINER so it can read public.users under RLS).
CREATE OR REPLACE FUNCTION app_staff_org() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.org_id FROM public.users u
     WHERE u.auth_subject = (auth.uid())::text
       AND u.role IN ('owner','admin','editor') AND u.is_active AND u.deleted_at IS NULL
     LIMIT 1
  $$;

-- Catalogue + pricing tables: staff get all-access to their org's rows (read incl. drafts + write).
-- (public_read from 0003 still lets anon see published rows; permissive policies are OR'd.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','categories','offerings','offering_variants','offering_specs','offering_media','pricing_rules','pricing_rule_targets','media_assets']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON %I', t);
    EXECUTE format('CREATE POLICY staff_all ON %I FOR ALL TO authenticated USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org())', t);
  END LOOP;
END $$;

-- Quotes/orders/imports/ai: staff read+write their org (customer-facing writes come later via edge fns).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotes','quote_items','orders','order_items','import_jobs','import_job_rows','ai_actions','customers','customer_tiers','customer_users','audit_log','content_pages','page_versions','page_status_history']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON %I', t);
    EXECUTE format('CREATE POLICY staff_all ON %I FOR ALL TO authenticated USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org())', t);
  END LOOP;
END $$;

-- A signed-in user may read their OWN profile row (so the app learns their role).
GRANT SELECT ON users TO authenticated;
DROP POLICY IF EXISTS self_read ON users;
CREATE POLICY self_read ON users FOR SELECT TO authenticated USING (auth_subject = (auth.uid())::text);
-- ...and staff may read/manage their org's users (team panel).
DROP POLICY IF EXISTS staff_users ON users;
CREATE POLICY staff_users ON users FOR ALL TO authenticated USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

GRANT SELECT ON organisations TO authenticated;
DROP POLICY IF EXISTS staff_org ON organisations;
CREATE POLICY staff_org ON organisations FOR SELECT TO authenticated USING (id = app_staff_org());
