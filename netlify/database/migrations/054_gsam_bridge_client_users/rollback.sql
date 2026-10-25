-- Removes 054's functions and change-log trigger. Users and memberships it created stay: they are real sign-ins.
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.customer_users;
DROP FUNCTION IF EXISTS bridge_client_users(uuid[]);
DROP FUNCTION IF EXISTS bridge_create_client_user(uuid, text, text);
