-- GRE-2475. Customer answers may change, but delivery state belongs to the server.
REVOKE INSERT, UPDATE (status, received_at) ON public.deep_dive_answers FROM authenticated;
GRANT INSERT (tenant_id, request_id, customer_id, customer_user_id, name, email, note),
  UPDATE (note) ON public.deep_dive_answers TO authenticated;
