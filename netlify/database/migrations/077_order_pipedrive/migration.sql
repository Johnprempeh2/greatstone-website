-- 077_order_pipedrive: each shop order goes to Pipedrive once (GRE-6336). A paid card order (stripe-webhook) and a PO
-- order (its invoice issued: staff convert_quote_to_order or the bridge's issue) open one Person, Organisation and Deal.
-- pipedrive_synced_at is the once-only claim, as on front_door_leads (035): UPDATE ... WHERE pipedrive_synced_at IS
-- NULL RETURNING id, so a second Stripe delivery or a parallel call matches no row. A failed push sets it back to null.
-- The ids are a convenience for staff. The worker writes them as service_role, which already updates orders
-- (refunds); no new grant. Re-runnable (IF NOT EXISTS).
-- Rollback: rollback.sql in this folder. Roll the functions back first: until then they name the columns.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipedrive_person_id bigint,
  ADD COLUMN IF NOT EXISTS pipedrive_org_id bigint,
  ADD COLUMN IF NOT EXISTS pipedrive_deal_id bigint;
