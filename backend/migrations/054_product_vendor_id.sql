-- Migration: 054_product_vendor_id
-- Description: Add canonical vendor_id UUID FK to products and enforce the
--              missing FK on purchase_orders.vendor_id so the auto-reorder
--              path can group/merge POs by a real vendor identity instead of
--              by the legacy free-text products.vendor column.

-- 1. Add the FK column on products (nullable; vendors remain optional).
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS vendor_id UUID
        REFERENCES vendors(id) ON DELETE SET NULL;

-- 2. Backfill vendor_id from the existing TEXT column.
--    Migration 020 seeded vendors.name from SELECT DISTINCT vendor FROM products,
--    so this join is expected to resolve every non-null, non-empty vendor.
UPDATE products p
SET vendor_id = v.id
FROM vendors v
WHERE p.vendor_id IS NULL
  AND p.vendor IS NOT NULL
  AND p.vendor <> ''
  AND v.name = p.vendor;

-- 3. Index for reorder grouping by vendor.
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);

-- 4. Add the missing FK on purchase_orders.vendor_id (introduced UUID-typed
--    but unconstrained back in migration 011). Null out any orphan UUIDs
--    first so the constraint validates.
UPDATE purchase_orders po
SET vendor_id = NULL
WHERE vendor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id = po.vendor_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_purchase_orders_vendor'
    ) THEN
        ALTER TABLE purchase_orders
            ADD CONSTRAINT fk_purchase_orders_vendor
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
                NOT VALID;
        ALTER TABLE purchase_orders VALIDATE CONSTRAINT fk_purchase_orders_vendor;
    END IF;
END $$;
