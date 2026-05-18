-- Add Base Price to Products
ALTER TABLE products ADD COLUMN base_price NUMERIC(12, 4) NOT NULL DEFAULT 0.0000;
