-- 0032_front_door_pack.sql — the team pack email, once per lead (GRE-464, spec GRE-416 rev 2 S6).
--
-- The S6 step sends the visitor's team pack to the address they typed. pack_sent_at is the once-only claim:
-- the `front-door` edge function sets it with UPDATE ... WHERE pack_sent_at IS NULL before it sends, and
-- clears it again if Resend fails. So one lead sends at most one pack, however often S6 is posted, and the
-- pack cannot be used to send mail to many addresses.
--
-- ⚠️ Needs 0031. Until this is applied the claim fails, the function logs it and sends no pack; the lead,
-- the contact and the internal alert still work, and the alert says "Team pack: Not sent" so staff send it.
-- RLS: unchanged (0031's staff-only policies cover the new column). Re-runnable.
-- Rollback: ALTER TABLE front_door_leads DROP COLUMN IF EXISTS pack_sent_at;

ALTER TABLE front_door_leads ADD COLUMN IF NOT EXISTS pack_sent_at timestamptz;
