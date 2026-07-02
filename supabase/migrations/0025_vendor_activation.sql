-- 0025_vendor_activation.sql — per-product-range activation instructions.
--
-- Ben (1 Jul technical review): most product ranges (Aspose, GroupDocs, et al.) activate the same way within
-- the range, so staff should author the activation steps ONCE per vendor range, not per product. Those steps
-- then travel automatically: into the fulfilment email and onto the customer's account beside each licence.
-- This adds a single free-text column on the vendor. It is authored in the catalogue admin (Activation tab),
-- shown to the buyer on their account (matched to the licence's range), and injected into the licence email
-- on the next deploy of notify-licence-issued (see docs/ACTIVATION-INSTRUCTIONS.md).
--
-- Apply with the rest of the migrations. Idempotent. No secrets. Staff write it via the existing vendors
-- staff_all policy (0004); the buyer reads it via the existing vendors public_read (0003, published only) —
-- activation steps are help content, not secret, so no new RLS is needed.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS activation_instructions TEXT;

COMMENT ON COLUMN vendors.activation_instructions IS
  'Plain-text activation steps for this product range, authored once per vendor in the catalogue admin. '
  'Shown to the buyer on their account beside each licence in the range, and injected into the licence email.';
