-- 0036_inquiry_ip_purge.sql — clear the IP address on an enquiry after 30 days (GRE-659; GRE-656 legal doc,
-- "Code findings" 4). Needs 0023.
--
-- service_inquiries.ip is kept only to rate-limit the form: the `enquiry` edge function and the
-- submit_service_inquiry rpc both count rows from the same IP in the last 1 day. An IP older than that is
-- never read again, so the Privacy page promises 30 days and this enforces it. Same self-prune idea as 0022
-- (no scheduler, no manual work): every insert into service_inquiries clears IPs older than 30 days. The
-- update touches only rows that still have an IP, through idx_inquiries_ip, so it stays cheap.
--
-- Limit of the self-prune pattern: with no new enquiry for a while, an old IP waits for the next insert. If
-- pg_cron is enabled on the production project, also schedule it daily:
--   SELECT cron.schedule('purge-inquiry-ips', '17 3 * * *', 'SELECT purge_inquiry_ips()');
--
-- Re-runnable (CREATE OR REPLACE, DROP TRIGGER IF EXISTS).
-- Rollback (removes only what this adds; IPs already cleared stay cleared):
--   DROP TRIGGER IF EXISTS trg_inquiry_ip_purge ON service_inquiries;
--   DROP FUNCTION IF EXISTS trg_purge_inquiry_ips();
--   DROP FUNCTION IF EXISTS purge_inquiry_ips();

CREATE OR REPLACE FUNCTION purge_inquiry_ips() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE service_inquiries SET ip = NULL
    WHERE ip IS NOT NULL AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
-- maintenance only: no public or signed-in caller needs it (the trigger runs as the table owner)
REVOKE ALL ON FUNCTION purge_inquiry_ips() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION trg_purge_inquiry_ips() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM purge_inquiry_ips();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_purge_inquiry_ips() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inquiry_ip_purge ON service_inquiries;
CREATE TRIGGER trg_inquiry_ip_purge
  AFTER INSERT ON service_inquiries
  FOR EACH STATEMENT EXECUTE FUNCTION trg_purge_inquiry_ips();
