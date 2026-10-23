-- Back to 032 to 036: service_role only, no anon access to the front door.
DROP POLICY IF EXISTS anon_update_own ON front_door_leads;
DROP POLICY IF EXISTS anon_select_own ON front_door_leads;
DROP POLICY IF EXISTS anon_insert_own ON front_door_leads;
REVOKE ALL ON front_door_leads FROM anon;
REVOKE EXECUTE ON FUNCTION front_door_purge() FROM anon;
REVOKE EXECUTE ON FUNCTION front_door_release_slot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION front_door_take_slot(text, int) FROM anon;
ALTER TABLE front_door_leads ALTER COLUMN org_id DROP DEFAULT;
DROP FUNCTION IF EXISTS front_door_org();
DROP FUNCTION IF EXISTS front_door_lead_id();
