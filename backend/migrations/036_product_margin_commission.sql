-- Add unit cost, target margin, and commission rate to products

ALTER TABLE products
ADD COLUMN IF NOT EXISTS average_unit_cost DECIMAL(19,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_margin NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 0;
