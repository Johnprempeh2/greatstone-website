-- GRE-2621: keep the legacy Supabase portal schema in step with Netlify Database.
ALTER TABLE public.portal_documents DROP CONSTRAINT portal_documents_kind_check;
ALTER TABLE public.portal_documents ADD CONSTRAINT portal_documents_kind_check
  CHECK (kind IN ('engagement_pack','nda','gita','terms','pre_read',
                 'north_star','investigation_plan','deep_dive','gdxp'));
