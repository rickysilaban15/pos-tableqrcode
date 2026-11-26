ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS qr_ordering_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS subscriptions_merchant_idx
  ON subscriptions(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_merchant_created_idx
  ON audit_logs(merchant_id, created_at DESC);
