-- Rollback for 076_gsam_accounts. Roll the gsam-* functions back first: until then they name these tables.
-- Dropping gsam_accounts loses every stored licence key; the hub keeps only hashes, so a customer would need a new
-- key from the hub. Export the rows first if any customer has bought GSAM.
DROP TABLE IF EXISTS gsam_billing_events;
DROP TABLE IF EXISTS gsam_accounts;
