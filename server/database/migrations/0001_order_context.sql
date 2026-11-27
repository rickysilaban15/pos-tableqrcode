ALTER TABLE orders ADD COLUMN customer_name text NOT NULL DEFAULT 'Customer';
ALTER TABLE orders ADD COLUMN order_type text NOT NULL DEFAULT 'DINE_IN' CHECK(order_type IN ('DINE_IN','TAKEAWAY'));
ALTER TABLE orders ADD COLUMN fulfillment_method text NOT NULL DEFAULT 'TABLE_SERVICE' CHECK(fulfillment_method IN ('TABLE_SERVICE','PICKUP_COUNTER'));
