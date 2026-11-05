-- Removes the bridge's people and access functions and the users change log. Deploy admin-bridge without the
-- /access routes first. users, portal_approvers and customer_users rows are not touched, and the change log rows
-- already written stay.
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.users;
DROP FUNCTION IF EXISTS public.bridge_access_remove_client_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.bridge_access_set_client_member_role(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.bridge_access_add_client_member(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.bridge_access_remove_portal_approver(uuid);
DROP FUNCTION IF EXISTS public.bridge_access_put_portal_approver(uuid, text);
DROP FUNCTION IF EXISTS public._bridge_log_approver(uuid, uuid, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.bridge_access_set_staff_role(uuid, text);
DROP FUNCTION IF EXISTS public.bridge_access_client_members(uuid);
DROP FUNCTION IF EXISTS public.bridge_access_portal_approvers();
DROP FUNCTION IF EXISTS public.bridge_access_staff();
DROP FUNCTION IF EXISTS public._bridge_member_json(uuid, uuid);
DROP FUNCTION IF EXISTS public._bridge_approver_json(uuid, uuid);
DROP FUNCTION IF EXISTS public._bridge_staff_json(uuid, uuid);
