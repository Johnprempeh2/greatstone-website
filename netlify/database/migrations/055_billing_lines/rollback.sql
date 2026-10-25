-- Use only after stopping bridge writes and checking for records to preserve.
DROP TABLE IF EXISTS public.billing_lines;
DROP FUNCTION IF EXISTS public.billing_line_refs();
