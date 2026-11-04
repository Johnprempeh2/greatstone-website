-- GRE-3981. GSAM writes a product range's activation steps (vendors.activation_instructions, 027) through the bridge:
-- PUT /api/admin/v1/vendors/<id>/activation-steps, and PATCH /vendors/<id> as before. 049 already grants the write
-- role UPDATE on the column and its catalogue guard already holds (an agent changes only a draft vendor). This adds:
--
--   1. A second guard on vendors for the write role: activation steps that contain a full licence key of the
--      organisation are refused (GBK01, licence_key_in_text). The steps go to every buyer in the range, by email
--      and on their account, so a pasted key would leak to all of them. Keys shorter than 8 characters are not
--      checked, so a short key cannot refuse ordinary words. The check reads licence_keys as the owner and answers
--      true or false only; the write role still has no grant on licence_keys.
--   2. bridge_vendor_licence_count(vendor): how many live licences of the organisation name this range, matched as
--      src/lib/activation-match.mjs does (a token of the product name contains the vendor's dot-stripped name, or
--      strictly extends its first 3+ character token). A count only, for "shows on N licences".
--
-- Staff writes (the catalogue admin's Activation tab) are not changed. Re-runnable. Rollback: rollback.sql.

CREATE OR REPLACE FUNCTION _bridge_text_has_licence_key(p_text text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_text IS NOT NULL AND EXISTS (
    SELECT 1 FROM licence_keys k
    WHERE k.org_id = app_bridge_write_org() AND k.deleted_at IS NULL
      AND length(k.licence_key) >= 8 AND strpos(p_text, k.licence_key) > 0) $$;
REVOKE ALL ON FUNCTION _bridge_text_has_licence_key(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _bridge_text_has_licence_key(text) TO gsam_bridge_write;

CREATE OR REPLACE FUNCTION guard_bridge_activation_text() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'gsam_bridge_write' THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' OR NEW.activation_instructions IS DISTINCT FROM OLD.activation_instructions)
     AND _bridge_text_has_licence_key(NEW.activation_instructions) THEN
    RAISE EXCEPTION 'activation steps contain a licence key' USING ERRCODE = 'GBK01';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_bridge_activation_text() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_bridge_activation_text ON public.vendors;
CREATE TRIGGER trg_guard_bridge_activation_text BEFORE INSERT OR UPDATE OF activation_instructions ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION guard_bridge_activation_text();

CREATE OR REPLACE FUNCTION bridge_vendor_licence_count(p_vendor uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (
    SELECT regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') AS dotless,
           coalesce((SELECT t FROM regexp_split_to_table(lower(name), '[^a-z0-9]+') WITH ORDINALITY AS s(t, i)
                     WHERE length(t) >= 3 ORDER BY i LIMIT 1), '') AS first
    FROM vendors WHERE id = p_vendor AND org_id = app_bridge_write_org() AND deleted_at IS NULL)
  SELECT count(*)::integer FROM licence_keys k, v
  WHERE k.org_id = app_bridge_write_org() AND k.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM regexp_split_to_table(lower(k.offering_name), '[^a-z0-9]+') AS t
                WHERE t <> '' AND ((length(v.dotless) >= 3 AND strpos(t, v.dotless) > 0)
                   OR (v.first <> '' AND left(t, length(v.first)) = v.first AND length(t) > length(v.first)))) $$;
REVOKE ALL ON FUNCTION bridge_vendor_licence_count(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION bridge_vendor_licence_count(uuid) TO gsam_bridge_write;
