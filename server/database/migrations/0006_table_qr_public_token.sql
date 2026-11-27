ALTER TABLE table_qr_codes ADD COLUMN IF NOT EXISTS public_token text;
CREATE UNIQUE INDEX IF NOT EXISTS table_qr_codes_public_token_uq ON table_qr_codes(public_token) WHERE public_token IS NOT NULL;
