-- Only together with the code before GRE-1797's fix: that code does not call these functions.
DROP FUNCTION IF EXISTS public.deep_dive_answer_received(uuid);
DROP FUNCTION IF EXISTS public.deep_dive_client_document_add(uuid, uuid, text, text, integer, text);
DROP FUNCTION IF EXISTS public.visitor_quote_po_index();
