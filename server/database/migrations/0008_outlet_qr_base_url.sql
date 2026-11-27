ALTER TABLE outlet_settings
  ADD COLUMN IF NOT EXISTS qr_base_url text NOT NULL DEFAULT '';
