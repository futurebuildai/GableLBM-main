-- 013_add_product_metadata.sql
-- Add UPC and Vendor fields to products table

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS upc TEXT,
ADD COLUMN IF NOT EXISTS vendor TEXT;

CREATE INDEX IF NOT EXISTS idx_products_upc ON products(upc);
