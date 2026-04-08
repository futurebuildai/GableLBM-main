-- 049: Hierarchical product categories using PostgreSQL ltree extension
-- Enables category-aware pricing rules with ancestor inheritance

CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE IF NOT EXISTS product_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    path        ltree NOT NULL UNIQUE,
    parent_id   UUID REFERENCES product_categories(id),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_path_gist ON product_categories USING GIST (path);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_id);

-- Seed LBM category hierarchy
INSERT INTO product_categories (name, slug, path, parent_id, sort_order) VALUES
    ('Lumber',          'lumber',           'lumber',              NULL, 1),
    ('Hardware',        'hardware',         'hardware',            NULL, 2),
    ('Roofing',         'roofing',          'roofing',             NULL, 3),
    ('Insulation',      'insulation',       'insulation',          NULL, 4),
    ('Concrete',        'concrete',         'concrete',            NULL, 5),
    ('General',         'general',          'general',             NULL, 99)
ON CONFLICT (slug) DO NOTHING;

-- Child categories (depend on parent IDs)
INSERT INTO product_categories (name, slug, path, parent_id, sort_order) VALUES
    ('Framing Lumber',  'framing_lumber',   'lumber.framing',      (SELECT id FROM product_categories WHERE slug = 'lumber'), 1),
    ('Sheathing',       'sheathing',        'lumber.sheathing',    (SELECT id FROM product_categories WHERE slug = 'lumber'), 2),
    ('Engineered Wood', 'engineered_wood',  'lumber.engineered',   (SELECT id FROM product_categories WHERE slug = 'lumber'), 3),
    ('Fasteners',       'fasteners',        'hardware.fasteners',  (SELECT id FROM product_categories WHERE slug = 'hardware'), 1),
    ('Connectors',      'connectors',       'hardware.connectors', (SELECT id FROM product_categories WHERE slug = 'hardware'), 2)
ON CONFLICT (slug) DO NOTHING;

-- Add category_id FK to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- Data migration: link existing products to new category tree by matching the flat category text column
UPDATE products p SET category_id = pc.id
FROM product_categories pc
WHERE p.category_id IS NULL
  AND (
    (p.category = 'Framing Lumber' AND pc.slug = 'framing_lumber') OR
    (p.category = 'Sheathing' AND pc.slug = 'sheathing') OR
    (p.category = 'Hardware' AND pc.slug = 'hardware') OR
    (p.category = 'Roofing' AND pc.slug = 'roofing') OR
    (p.category = 'Insulation' AND pc.slug = 'insulation') OR
    (p.category = 'Concrete' AND pc.slug = 'concrete') OR
    (p.category = 'General' AND pc.slug = 'general')
  );

-- Fallback: anything still unlinked goes to General
UPDATE products SET category_id = (SELECT id FROM product_categories WHERE slug = 'general')
WHERE category_id IS NULL;
