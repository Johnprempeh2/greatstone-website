-- 044_front_door_anon — the front door as anon, under RLS (GRE-2009, for GRE-1988). Netlify only; no Supabase port.
--
-- On Supabase the `front-door` edge function used the service role, so 032 to 036 gave anon nothing. The Netlify
-- functions run each query as anon (SET LOCAL ROLE anon), never as the owner or service_role. This opens exactly
-- what the front door does, and nothing more:
--
--   * Rate slots and retention: EXECUTE on front_door_take_slot, front_door_release_slot and front_door_purge.
--     They stay SECURITY DEFINER; anon still has no access to the front_door_rate table itself.
--   * One lead per transaction. The function puts the lead's id in the claims:
--       set_config('request.jwt.claims', '{"role":"anon","front_door_lead":"<uuid>"}', true)
--     front_door_lead_id() reads it. Every anon policy below matches only that row, so a transaction can never
--     read or change another lead. Without the claim anon sees and changes nothing.
--       S5 (insert): the function makes the id (crypto.randomUUID()), binds it, then inserts. org_id is filled in
--                    by its default, front_door_org(); anon cannot choose it, nor any S6 or staff column.
--       S6 (update): the id comes from the signed session (lid). Only the contact, consent, alert, pack and
--                    Pipedrive columns can change, and only within an hour of the lead's creation (a session
--                    lasts 30 minutes, SESSION_TTL_MS), so an old lead is out of reach even with its id.
--   * Once-only claims keep their form: UPDATE ... SET pack_sent_at = now() WHERE id = $1 AND pack_sent_at IS NULL
--     RETURNING id (the same for pipedrive_synced_at). Row locking makes the second of two parallel claims match
--     no row. A release sets the column back to NULL.
--   * Anon reads only the columns S6 returns and the claims test: id, industry, industry_other, team_size,
--     company_name, agents, source, consent_given, alert_sent_at, pack_sent_at, pipedrive_synced_at.
--     No contact column, no brand words, no chat summary, no package.
-- No DELETE for anon. Staff access (033 staff_all, TO authenticated) is unchanged. Re-runnable.
-- Rollback: rollback.sql in this folder.

-- The lead this transaction may touch, or NULL. Not a uuid means NULL, never an error.
CREATE OR REPLACE FUNCTION front_door_lead_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v::uuid END
    FROM (SELECT auth.jwt() ->> 'front_door_lead' AS v) c $$;
REVOKE ALL ON FUNCTION front_door_lead_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front_door_lead_id() TO anon, authenticated, service_role;

-- The organisation a front door lead belongs to: the first one, as the edge function chose it. Anon cannot read
-- organisations, so this runs as the owner and returns only the id.
CREATE OR REPLACE FUNCTION front_door_org() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM organisations ORDER BY created_at LIMIT 1 $$;
REVOKE ALL ON FUNCTION front_door_org() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION front_door_org() TO anon, service_role;
ALTER TABLE front_door_leads ALTER COLUMN org_id SET DEFAULT front_door_org();

-- Rate slots and retention (032, 033): the functions only, never the table.
GRANT EXECUTE ON FUNCTION front_door_take_slot(text, int) TO anon;
GRANT EXECUTE ON FUNCTION front_door_release_slot(uuid) TO anon;
GRANT EXECUTE ON FUNCTION front_door_purge() TO anon;

-- Leads: column grants say what anon may write and read; the policies say which row.
GRANT INSERT (id, industry, industry_other, team_size, brand_words, company_name, agents, chat_summary,
              chat_turns, source, agent_package) ON front_door_leads TO anon;
GRANT UPDATE (contact_name, contact_email, contact_role, contact_at, consent_given, consent_at, consent_version,
              alert_sent_at, pack_sent_at, pipedrive_synced_at, pipedrive_person_id, pipedrive_deal_id)
  ON front_door_leads TO anon;
GRANT SELECT (id, industry, industry_other, team_size, company_name, agents, source, consent_given, alert_sent_at,
              pack_sent_at, pipedrive_synced_at) ON front_door_leads TO anon;

DROP POLICY IF EXISTS anon_insert_own ON front_door_leads;
CREATE POLICY anon_insert_own ON front_door_leads FOR INSERT TO anon
  WITH CHECK (id = front_door_lead_id() AND org_id = front_door_org());

DROP POLICY IF EXISTS anon_select_own ON front_door_leads;
CREATE POLICY anon_select_own ON front_door_leads FOR SELECT TO anon
  USING (id = front_door_lead_id() AND created_at > now() - interval '1 hour');

DROP POLICY IF EXISTS anon_update_own ON front_door_leads;
CREATE POLICY anon_update_own ON front_door_leads FOR UPDATE TO anon
  USING (id = front_door_lead_id() AND created_at > now() - interval '1 hour')
  WITH CHECK (id = front_door_lead_id());
