-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create UOM Enum Type
-- Comprehensive list for Lumber & Hardware
-- 1. Create UOM Enum Type
-- Comprehensive list for Lumber & Hardware
DO $$ BEGIN
    CREATE TYPE uom_type AS ENUM (
        'PCS',      -- Pieces (Standard)
        'EA',       -- Each (Hardware alternative)
        'LF',       -- Linear Feet (Moulding/Decking)
        'SF',       -- Square Feet (Drywall/Plywood)
        'BF',       -- Board Feet (Hardwood)
        'MBF',      -- Thousand Board Feet (Commodity Lumber)
        'SQ',       -- Square (Roofing - 100 sq ft)
        'BOX',      -- Box (Screws/Nails)
        'CTN',      -- Carton
        'RL',       -- Roll (Insulation/Wrap)
        'GAL',      -- Gallon (Paint/Chemicals)
        'LBS',      -- Pounds (Bulk Nails)
        'BAG',      -- Bag (Concrete)
        'BUNDLE',   -- Bundle (Shingles/Lath)
        'PAIR',     -- Pair (Gloves)
        'SET'       -- Set (Door Hardware)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    uom_primary uom_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location TEXT NOT NULL, -- e.g. "Gable Yard A-12", "Row 4"
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location);
