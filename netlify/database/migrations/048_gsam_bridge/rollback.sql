-- Remove every key from GSAM_BRIDGE_KEYS and redeploy before rolling this migration back: the admin bridge
-- function needs these objects. The audit rows go with the table, so export them first if they are still needed.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'customer_users', 'quotes', 'quote_items', 'orders', 'order_items',
    'licence_keys', 'portal_documents', 'portal_acceptances', 'service_inquiries', 'front_door_leads'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_read ON public.%I', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS admin_bridge_finish(uuid, text, text, text, integer);
DROP FUNCTION IF EXISTS admin_bridge_begin(text, text, text, bigint, text, uuid, text, text);
DROP TABLE IF EXISTS public.admin_bridge_audit;
DROP TABLE IF EXISTS public.admin_bridge_nonce;
ALTER TABLE public.licence_keys DROP COLUMN IF EXISTS licence_key_last4;
DROP FUNCTION IF EXISTS app_bridge_org();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsam_bridge_read') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM gsam_bridge_read';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM gsam_bridge_read';
    EXECUTE 'DROP ROLE gsam_bridge_read';
  END IF;
END $$;
