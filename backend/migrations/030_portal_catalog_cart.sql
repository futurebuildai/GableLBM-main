-- Sprint 27: Portal Product Catalog + Online Ordering
-- Adds product metadata for catalog filtering and portal shopping cart tables.

-- 1. Extend products table with catalog metadata
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS species VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS grade VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_species ON products(species);
CREATE INDEX IF NOT EXISTS idx_products_grade ON products(grade);

-- 2. Portal Shopping Carts
CREATE TABLE IF NOT EXISTS portal_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_id) -- one active cart per customer
);

CREATE INDEX IF NOT EXISTS idx_portal_carts_customer ON portal_carts(customer_id);

-- 3. Portal Cart Items
CREATE TABLE IF NOT EXISTS portal_cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES portal_carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cart_id, product_id) -- one row per product per cart
);

CREATE INDEX IF NOT EXISTS idx_portal_cart_items_cart ON portal_cart_items(cart_id);

-- 4. Seed realistic catalog metadata on existing products
UPDATE products SET category = 'Framing Lumber', species = 'SPF', grade = '#2' WHERE sku LIKE '2x4%' OR sku LIKE '2x6%' OR sku LIKE '2x8%' OR sku LIKE '2x10%' OR sku LIKE '2x12%';
UPDATE products SET category = 'Sheathing', species = 'OSB', grade = 'Structural' WHERE sku ILIKE '%OSB%' OR sku ILIKE '%plywood%' OR description ILIKE '%sheathing%';
UPDATE products SET category = 'Hardware', species = NULL, grade = NULL WHERE sku ILIKE '%simpson%' OR description ILIKE '%connector%' OR description ILIKE '%hanger%' OR description ILIKE '%nail%' OR description ILIKE '%screw%';
UPDATE products SET category = 'Roofing', species = NULL, grade = NULL WHERE description ILIKE '%shingle%' OR description ILIKE '%roof%' OR description ILIKE '%felt%';
UPDATE products SET category = 'Insulation', species = NULL, grade = NULL WHERE description ILIKE '%insul%' OR description ILIKE '%foam%';
UPDATE products SET category = 'Concrete', species = NULL, grade = NULL WHERE description ILIKE '%concrete%' OR description ILIKE '%cement%' OR description ILIKE '%rebar%';
-- Catch-all for anything not categorized
UPDATE products SET category = 'General' WHERE category IS NULL;
