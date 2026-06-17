-- 0002_rls.sql — Row-Level Security: org-isolation backstop on every business table.
-- Policies key off current_setting('app.current_org'), which the app sets per request.
-- A query that forgets the org filter returns ZERO cross-tenant rows. The Supabase
-- service_role (BYPASSRLS) and migrations/seed (which SET the GUC) are unaffected.

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_org', true), '')::uuid $$;

ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON ai_actions;
CREATE POLICY org_isolation ON ai_actions USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON audit_log;
CREATE POLICY org_isolation ON audit_log USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON categories;
CREATE POLICY org_isolation ON categories USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_pages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON content_pages;
CREATE POLICY org_isolation ON content_pages USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE customer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tiers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON customer_tiers;
CREATE POLICY org_isolation ON customer_tiers USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON customer_users;
CREATE POLICY org_isolation ON customer_users USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON customers;
CREATE POLICY org_isolation ON customers USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE import_job_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_job_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON import_job_rows;
CREATE POLICY org_isolation ON import_job_rows USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON import_jobs;
CREATE POLICY org_isolation ON import_jobs USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON media_assets;
CREATE POLICY org_isolation ON media_assets USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE offering_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_media FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON offering_media;
CREATE POLICY org_isolation ON offering_media USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE offering_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_specs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON offering_specs;
CREATE POLICY org_isolation ON offering_specs USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE offering_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_variants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON offering_variants;
CREATE POLICY org_isolation ON offering_variants USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON offerings;
CREATE POLICY org_isolation ON offerings USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON order_items;
CREATE POLICY org_isolation ON order_items USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON orders;
CREATE POLICY org_isolation ON orders USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE page_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON page_status_history;
CREATE POLICY org_isolation ON page_status_history USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON page_versions;
CREATE POLICY org_isolation ON page_versions USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE pricing_rule_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rule_targets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON pricing_rule_targets;
CREATE POLICY org_isolation ON pricing_rule_targets USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON pricing_rules;
CREATE POLICY org_isolation ON pricing_rules USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON quote_items;
CREATE POLICY org_isolation ON quote_items USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON quotes;
CREATE POLICY org_isolation ON quotes USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON role_permissions;
CREATE POLICY org_isolation ON role_permissions USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON user_permissions;
CREATE POLICY org_isolation ON user_permissions USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON users;
CREATE POLICY org_isolation ON users USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON vendors;
CREATE POLICY org_isolation ON vendors USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_self ON organisations;
CREATE POLICY org_self ON organisations USING (id = app_current_org()) WITH CHECK (id = app_current_org());

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perms_read ON permissions;
CREATE POLICY perms_read ON permissions FOR SELECT USING (true);

