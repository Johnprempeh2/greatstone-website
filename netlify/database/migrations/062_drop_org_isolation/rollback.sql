-- Restores the caller-controlled app.current_org policies of 004, 007 and 055 (not public.users; see 053's rollback).
-- They give anon the whole org if the GUC is set; use only with a reviewed rollback.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_actions', 'audit_log', 'categories', 'content_pages', 'customer_tiers', 'customer_users',
    'customers', 'import_job_rows', 'import_jobs', 'media_assets', 'offering_media', 'offering_specs',
    'offering_variants', 'offerings', 'order_items', 'orders', 'page_status_history', 'page_versions',
    'pricing_rule_targets', 'pricing_rules', 'quote_items', 'quotes', 'role_permissions', 'user_permissions',
    'vendors', 'org_settings', 'fx_rate_history', 'billing_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY org_isolation ON public.%I USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org())', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS org_self ON public.organisations;
CREATE POLICY org_self ON public.organisations USING (id = app_current_org()) WITH CHECK (id = app_current_org());
