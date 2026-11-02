-- Removes the PO upload limit. Deploy request-quote without po_upload_take_slot first.
DROP FUNCTION IF EXISTS public.po_upload_take_slot(text);
DROP TABLE IF EXISTS public.po_upload_rate;
