-- 0011_order_refunds.sql — reconcile Stripe refunds back into orders.
-- A refund issued in the Stripe dashboard fires charge.refunded → the webhook maps it to the order via
-- the stored payment intent and records the refunded amount. Fully refunded → status 'refunded'
-- (already in the order_status enum); partially refunded → refunded_minor > 0 with status unchanged.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent ON orders(stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;
