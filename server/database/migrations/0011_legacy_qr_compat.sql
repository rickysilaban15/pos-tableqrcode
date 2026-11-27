CREATE TABLE IF NOT EXISTS legacy_qr_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_slug text NOT NULL,
  table_name text NOT NULL,
  legacy_token text NOT NULL,
  table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_slug, table_name, legacy_token)
);
