CREATE TABLE outlet_settings (
  outlet_id uuid PRIMARY KEY REFERENCES outlets(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', whatsapp text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '', operating_hours text NOT NULL DEFAULT '', is_open boolean NOT NULL DEFAULT true,
  enable_dine_in boolean NOT NULL DEFAULT true, enable_takeaway boolean NOT NULL DEFAULT true,
  enable_table_service boolean NOT NULL DEFAULT true, enable_pickup_counter boolean NOT NULL DEFAULT true,
  qris_image_url text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (enable_dine_in OR enable_takeaway), CHECK (enable_table_service OR enable_pickup_counter)
);
CREATE INDEX outlet_settings_merchant_idx ON outlet_settings(merchant_id);
