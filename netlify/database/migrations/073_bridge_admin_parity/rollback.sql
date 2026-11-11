-- Removes 073. Deploy admin-bridge without the invite-requests resource, the decision route, the PO file route and
-- the agent package route first. Decided requests and their audit and change rows stay.
DROP FUNCTION IF EXISTS public.bridge_invite_request_decide(uuid, text);
DROP FUNCTION IF EXISTS public.bridge_lead_package(uuid);
DROP FUNCTION IF EXISTS public.bridge_lead_has_package(uuid);
DROP FUNCTION IF EXISTS public.bridge_po_document(text, uuid);
DROP FUNCTION IF EXISTS public.bridge_quote_has_po(uuid);
DROP FUNCTION IF EXISTS public._bridge_any_org();
DROP POLICY IF EXISTS gsam_bridge_read_scope ON public.member_invite_requests;
DROP POLICY IF EXISTS gsam_bridge_read ON public.member_invite_requests;
REVOKE SELECT ON public.member_invite_requests FROM gsam_bridge_read;
