-- 0014_payment_gateway_and_invoices.sql
-- Additive schema extensions for Midtrans Sandbox Dynamic QRIS, webhook audit/idempotency,
-- extended Pay-First queue constraint (covering READY_TO_SERVE while preserving post-serve refunds),
-- and isolated SaaS subscription invoices.

-- 1. Outlet-level toggle for dynamic QRIS (only selectable when merchant is also eligible server-side)
ALTER TABLE outlet_settings
  ADD COLUMN IF NOT EXISTS enable_dynamic_qris boolean NOT NULL DEFAULT true;

-- 2. Extend payments table additively while preserving all historical CASH and static QRIS rows
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id),
  ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES outlets(id),
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS expected_gross_amount integer,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS qr_string text,
  ADD COLUMN IF NOT EXISTS qr_image_url text,
  ADD COLUMN IF NOT EXISTS acquirer text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill tenant, expected amount, and provider labels on existing historical payments safely
UPDATE payments p
SET merchant_id = o.merchant_id,
    outlet_id = o.outlet_id,
    expected_gross_amount = COALESCE(p.expected_gross_amount, p.amount),
    provider = CASE
      WHEN p.method = 'QRIS' AND p.provider = 'INTERNAL' THEN 'MANUAL_STATIC'
      ELSE p.provider
    END
FROM orders o
WHERE o.id = p.order_id
  AND (p.merchant_id IS NULL OR p.outlet_id IS NULL OR p.expected_gross_amount IS NULL);

ALTER TABLE payments
  ALTER COLUMN expected_gross_amount SET DEFAULT 0;

UPDATE payments SET expected_gross_amount = amount WHERE expected_gross_amount IS NULL;

ALTER TABLE payments
  ALTER COLUMN expected_gross_amount SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_id_uq
  ON payments(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_tx_id_uq
  ON payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_per_order_uq
  ON payments(order_id)
  WHERE status IN ('UNPAID', 'PENDING_VERIFICATION', 'PAID');

CREATE INDEX IF NOT EXISTS payments_merchant_env_status_idx
  ON payments(merchant_id, environment, status, created_at DESC);

-- 3. Strengthen orders_paid_queue_check to cover READY_TO_SERVE as well as NEW_ORDER and IN_PROGRESS,
-- while preserving authorized post-service refunds (READY_TO_SERVE + REFUNDED).
UPDATE orders
SET order_status = 'AWAITING_PAYMENT'
WHERE order_status = 'READY_TO_SERVE'
  AND payment_status NOT IN ('PAID', 'REFUNDED');

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_paid_queue_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_paid_queue_check
  CHECK (
    (order_status NOT IN ('NEW_ORDER', 'IN_PROGRESS') OR payment_status = 'PAID')
    AND (order_status <> 'READY_TO_SERVE' OR payment_status IN ('PAID', 'REFUNDED'))
  );

-- 4. Webhook notification ledger for idempotency, out-of-order defense, and security quarantine
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  provider_order_id text NOT NULL,
  provider_transaction_id text,
  merchant_id uuid REFERENCES merchants(id),
  payment_id uuid REFERENCES payments(id),
  signature_valid boolean NOT NULL,
  processing_status text NOT NULL,
  rejection_reason text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_order_idx
  ON payment_webhook_events(provider, provider_order_id, created_at DESC);

-- 5. Separate SaaS platform subscription invoice domain (never mixed with merchant F&B orders/payments)
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  subscription_id uuid REFERENCES subscriptions(id),
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  invoice_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING_PAYMENT',
  amount integer NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  billing_period_days integer NOT NULL DEFAULT 30 CHECK (billing_period_days > 0),
  provider text NOT NULL DEFAULT 'MANUAL_INVOICE',
  environment text NOT NULL DEFAULT 'SANDBOX',
  provider_order_id text UNIQUE,
  provider_transaction_id text,
  provider_status text,
  qr_string text,
  qr_image_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  activated_period_start timestamptz,
  activated_period_end timestamptz,
  created_by uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_invoices_merchant_idx
  ON subscription_invoices(merchant_id, created_at DESC);
