ALTER TABLE orders ADD COLUMN tracking_token_hash text;
CREATE UNIQUE INDEX orders_tracking_token_hash_uq ON orders(tracking_token_hash) WHERE tracking_token_hash IS NOT NULL;
