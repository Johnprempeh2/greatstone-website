-- Roll back only before any client links are made: dropping the columns loses those links.
DROP TRIGGER IF EXISTS enquiry_client_link_emit ON public.service_inquiries;
DROP TRIGGER IF EXISTS front_door_client_link_emit ON public.front_door_leads;
DROP TRIGGER IF EXISTS enquiry_client_link_guard ON public.service_inquiries;
DROP TRIGGER IF EXISTS front_door_client_link_guard ON public.front_door_leads;
DROP FUNCTION IF EXISTS public.enquiry_client_link_emit();
DROP FUNCTION IF EXISTS public.enquiry_client_link_guard();
ALTER TABLE public.service_inquiries DROP COLUMN IF EXISTS customer_id;
ALTER TABLE public.front_door_leads DROP COLUMN IF EXISTS customer_id;
DROP FUNCTION IF EXISTS public.client_activity_emit(uuid,uuid,text,text,text,timestamptz);
CREATE OR REPLACE FUNCTION public.client_activity_emit(p_org uuid, p_customer uuid, p_kind text,
    p_subject text, p_label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_customer IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND org_id = p_org) THEN
    RAISE EXCEPTION 'activity client does not belong to tenant';
  END IF;
  PERFORM pg_advisory_xact_lock(2652, 1);
  INSERT INTO public.client_activity_outbox(org_id, organisation_id, kind, subject_id, label)
    VALUES (p_org, p_customer, p_kind, p_subject, p_label);
END $$;
