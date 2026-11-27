-- Enforce Pay-First queue invariant at the database engine level:
-- Orders in NEW_ORDER or IN_PROGRESS must have verified PAID payment_status.
UPDATE orders
SET order_status = 'AWAITING_PAYMENT'
WHERE order_status IN ('NEW_ORDER', 'IN_PROGRESS')
  AND payment_status <> 'PAID';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_paid_queue_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_paid_queue_check
      CHECK (order_status NOT IN ('NEW_ORDER', 'IN_PROGRESS') OR payment_status = 'PAID');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_history_idx
  ON orders(merchant_id, outlet_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS payments_status_created_idx
  ON payments(order_id, status, created_at DESC);
