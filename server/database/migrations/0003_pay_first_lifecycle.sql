UPDATE orders SET order_status = 'READY_TO_SERVE' WHERE order_status = 'COMPLETED';
ALTER TABLE orders DROP CONSTRAINT orders_order_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check CHECK(order_status IN ('AWAITING_PAYMENT','NEW_ORDER','IN_PROGRESS','READY_TO_SERVE','CANCELLED','EXPIRED'));
ALTER TABLE orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK(payment_status IN ('UNPAID','PENDING_VERIFICATION','PAID','FAILED','EXPIRED','REFUNDED'));
ALTER TABLE orders ADD COLUMN completed_at timestamptz;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK(status IN ('UNPAID','PENDING_VERIFICATION','PAID','FAILED','EXPIRED','REFUNDED'));
CREATE UNIQUE INDEX payments_one_paid_per_order_uq ON payments(order_id) WHERE status = 'PAID';
