-- Rollback for 076_portal_prototypes. Roll the portal-prototypes function and the admin bridge route back first.
-- The rows are a copy GSAM can push again; dropping the table drops its grants and policies with it.
DROP TABLE IF EXISTS public.portal_prototypes;
DROP FUNCTION IF EXISTS portal_prototypes_client_of_org();
