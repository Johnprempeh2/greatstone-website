-- GRE-1991: staff provisioning writes are reserved for active owners and admins.
-- The Netlify staff-store endpoint remains read-only for users; this policy is
-- the database boundary for a future provisioning path.

CREATE OR REPLACE FUNCTION public.app_staff_admin_org() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT u.org_id FROM public.users AS u
     WHERE u.auth_subject = (auth.uid())::text
       AND u.role IN ('owner', 'admin')
       AND u.is_active AND u.deleted_at IS NULL
     LIMIT 1
  $$;
REVOKE ALL ON FUNCTION public.app_staff_admin_org() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.app_staff_admin_org() TO authenticated;

-- 004's permissive org_isolation applies to every command and trusts a
-- caller-set GUC. Remove it for users so it cannot OR past the admin check.
DROP POLICY IF EXISTS org_isolation ON public.users;
DROP POLICY IF EXISTS staff_users ON public.users;
CREATE POLICY staff_users_read ON public.users FOR SELECT TO authenticated
  USING (org_id = public.app_staff_org());
CREATE POLICY staff_users_insert ON public.users FOR INSERT TO authenticated
  WITH CHECK (org_id = public.app_staff_admin_org());
CREATE POLICY staff_users_update ON public.users FOR UPDATE TO authenticated
  USING (org_id = public.app_staff_admin_org())
  WITH CHECK (org_id = public.app_staff_admin_org());
CREATE POLICY staff_users_delete ON public.users FOR DELETE TO authenticated
  USING (org_id = public.app_staff_admin_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon;
