-- Removes the bridge's activation-steps guard and licence count. Deploy admin-bridge without the
-- vendors/<id>/activation-steps route first. The column and the staff Activation tab are not touched.
DROP TRIGGER IF EXISTS trg_guard_bridge_activation_text ON public.vendors;
DROP FUNCTION IF EXISTS public.guard_bridge_activation_text();
DROP FUNCTION IF EXISTS public.bridge_vendor_licence_count(uuid);
DROP FUNCTION IF EXISTS public._bridge_text_has_licence_key(text);
