-- Rollback for 077_order_pipedrive. Roll stripe-webhook, staff-store and admin-bridge back first: they name the
-- columns. The deals already in Pipedrive stay; only the website's record of them goes.
ALTER TABLE orders
  DROP COLUMN IF EXISTS pipedrive_synced_at,
  DROP COLUMN IF EXISTS pipedrive_person_id,
  DROP COLUMN IF EXISTS pipedrive_org_id,
  DROP COLUMN IF EXISTS pipedrive_deal_id;
