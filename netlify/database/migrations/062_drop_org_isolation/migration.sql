-- GRE-3772 (Flint's GRE-1797 concern 3): drop the policies that trust app.current_org.
-- 004, 007 and 055 made org_isolation (and 004 org_self) with no TO clause, so they apply to anon too, and they
-- pass on a GUC that any session can set with set_config(). No request sets it: staff, customers and the bridge
-- each have their own policies keyed on claims. So these do nothing today, but anon would get CRUD on the whole
-- org the moment anything set the GUC. 053 already dropped the one on public.users.
-- app_current_org() stays: it returns NULL when the GUC is unset and nothing grants through it after this.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_actions', 'audit_log', 'categories', 'content_pages', 'customer_tiers', 'customer_users',
    'customers', 'import_job_rows', 'import_jobs', 'media_assets', 'offering_media', 'offering_specs',
    'offering_variants', 'offerings', 'order_items', 'orders', 'page_status_history', 'page_versions',
    'pricing_rule_targets', 'pricing_rules', 'quote_items', 'quotes', 'role_permissions', 'user_permissions',
    'vendors', 'org_settings', 'fx_rate_history', 'billing_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS org_self ON public.organisations;
