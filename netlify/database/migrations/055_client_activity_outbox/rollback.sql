-- Review before use: dropping the outbox permanently loses undelivered client events.
DROP TRIGGER IF EXISTS client_activity_engagement ON public.engagements;
DROP TRIGGER IF EXISTS client_activity_snapshot ON public.deep_dive_snapshots;
DROP TRIGGER IF EXISTS client_activity_acceptance ON public.portal_acceptances;
DROP TRIGGER IF EXISTS client_activity_document ON public.portal_documents;
DROP TRIGGER IF EXISTS client_activity_order ON public.orders;
DROP TRIGGER IF EXISTS client_activity_quote ON public.quotes;
DROP TRIGGER IF EXISTS client_activity_customer ON public.customers;
DROP FUNCTION IF EXISTS public.client_activity_from_engagement();
DROP FUNCTION IF EXISTS public.client_activity_from_snapshot();
DROP FUNCTION IF EXISTS public.client_activity_from_acceptance();
DROP FUNCTION IF EXISTS public.client_activity_from_document();
DROP FUNCTION IF EXISTS public.client_activity_from_order();
DROP FUNCTION IF EXISTS public.client_activity_from_quote();
DROP FUNCTION IF EXISTS public.client_activity_from_customer();
DROP FUNCTION IF EXISTS public.client_activity_emit(uuid,uuid,text,text,text);
DROP TABLE IF EXISTS public.client_activity_outbox;
DROP FUNCTION IF EXISTS public.client_activity_no_change();
