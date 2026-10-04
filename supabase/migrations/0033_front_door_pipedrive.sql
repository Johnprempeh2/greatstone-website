-- 0033_front_door_pipedrive.sql — the Pipedrive push, once per lead (GRE-469 B9, spec GRE-416 rev 2 §3).
--
-- At S6, when the visitor ticked the contact box, the `front-door` edge function upserts a Pipedrive Person
-- and opens a Deal. pipedrive_synced_at is the once-only claim (UPDATE ... WHERE pipedrive_synced_at IS NULL
-- before the push, cleared again if Pipedrive fails), so a repeated S6 never opens a second deal. The two ids
-- link the row to Pipedrive for staff.
--
-- ⚠️ Needs 0031. Until this is applied the claim fails, the function logs it and pushes nothing; the lead,
-- the pack and the alert still work. Dormant anyway until PIPEDRIVE_API_TOKEN is set.
-- RLS: unchanged (0031's staff-only policies cover the new columns). Re-runnable.
-- Rollback: ALTER TABLE front_door_leads DROP COLUMN IF EXISTS pipedrive_synced_at,
--   DROP COLUMN IF EXISTS pipedrive_person_id, DROP COLUMN IF EXISTS pipedrive_deal_id;

ALTER TABLE front_door_leads
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipedrive_person_id bigint,
  ADD COLUMN IF NOT EXISTS pipedrive_deal_id bigint;
