DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.portal_documents WHERE kind = 'deep_dive') THEN
    RAISE EXCEPTION 'retain Deep Dive portal documents before rolling back GRE-2621';
  END IF;
END $$;
ALTER TABLE public.portal_documents DROP CONSTRAINT portal_documents_kind_check;
ALTER TABLE public.portal_documents ADD CONSTRAINT portal_documents_kind_check
  CHECK (kind IN ('engagement_pack','nda','gita','terms','pre_read',
                 'north_star','investigation_plan','gdxp'));
