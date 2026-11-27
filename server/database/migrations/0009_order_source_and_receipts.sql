ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'QR' CHECK (order_source IN ('QR', 'POS')),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text NOT NULL DEFAULT '';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS cash_received integer,
  ADD COLUMN IF NOT EXISTS change_amount integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_source_status_idx
  ON orders(merchant_id, outlet_id, order_source, order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_order_idx
  ON payments(order_id);
