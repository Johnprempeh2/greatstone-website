-- 076_gsam_accounts: GSAM for Mac (P4). A customer company buys GSAM on the website; the GSAM hub makes the install
-- and returns its licence key (gsamlk_...) once, in its answer to the forwarded Stripe checkout event. The hub keeps
-- only a hash, so the website keeps the key, encrypted with GSAM_LICENCE_ENCRYPTION_KEY (AES-256-GCM, bound to the
-- customer id), so the "My GSAM" page can show it again.
--
--   gsam_accounts        one row per customer company (one subscription per customer, the hub's rule). Written
--                        only by the GSAM webhook (service_role). A member of the company reads its own row
--                        (customer_self); the key is ciphertext here and is decrypted only in the function.
--   gsam_billing_events  the Stripe event ids the website has forwarded and settled, so a repeat is answered
--                        without reaching the hub again. service_role only.
--
-- Status, modules and the period end are read live from Stripe, so they are not copied here.
-- Re-runnable. Rollback: rollback.sql in this folder.

CREATE TABLE IF NOT EXISTS gsam_accounts (
  customer_id            uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  stripe_customer_id     text NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  fleet_instance_id      text,
  licence_key_enc        text CHECK (licence_key_enc IS NULL OR licence_key_enc LIKE 'v1:%'),
  licence_key_expires_at timestamptz,
  valid_until            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gsam_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsam_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON gsam_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON gsam_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gsam_accounts TO service_role;

DROP POLICY IF EXISTS customer_self ON gsam_accounts;
CREATE POLICY customer_self ON gsam_accounts FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());

CREATE TABLE IF NOT EXISTS gsam_billing_events (
  stripe_event_id text PRIMARY KEY CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]+$'),
  type            text NOT NULL,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  outcome         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gsam_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsam_billing_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON gsam_billing_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON gsam_billing_events TO service_role;
