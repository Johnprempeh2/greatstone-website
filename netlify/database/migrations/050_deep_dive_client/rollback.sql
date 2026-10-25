-- Use only after confirming the snapshot cache and pending answers are no longer needed.
DROP TABLE IF EXISTS public.deep_dive_answers;
DROP TABLE IF EXISTS public.deep_dive_snapshots;
DROP TABLE IF EXISTS public.deep_dive_tenant_links;
DROP INDEX IF EXISTS public.customers_id_org_for_deep_dive;
