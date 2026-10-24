-- Restores the pre-049 anon write grant and caller-controlled org_isolation policy; use only with a reviewed rollback.
REVOKE INSERT, UPDATE, DELETE ON public.users FROM authenticated;
GRANT INSERT, UPDATE, DELETE ON public.users TO anon;
DROP POLICY IF EXISTS staff_users_read ON public.users;
DROP POLICY IF EXISTS staff_users_insert ON public.users;
DROP POLICY IF EXISTS staff_users_update ON public.users;
DROP POLICY IF EXISTS staff_users_delete ON public.users;
CREATE POLICY org_isolation ON public.users
  USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
CREATE POLICY staff_users ON public.users FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());
DROP FUNCTION IF EXISTS public.app_staff_admin_org();
