UPDATE orders SET order_status = 'AWAITING_PAYMENT' WHERE payment_status <> 'PAID' AND order_status IN ('NEW_ORDER','IN_PROGRESS');
