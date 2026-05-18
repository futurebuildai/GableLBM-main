-- 1. Create Locations Table
-- Hierarchical structure: Zone -> Aisle -> Bin
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
    path TEXT NOT NULL DEFAULT '', -- Materialized path or breadcrumb, e.g., "Zone A/Row 1"
    
    -- Specific fields
    type TEXT NOT NULL, -- 'ZONE', 'AISLE', 'SHELF', 'BIN', 'YARD'
    code TEXT NOT NULL, -- The short code, e.g. "A", "12", "B2"
    description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(parent_id, code) -- Enforce unique codes within a parent
);

-- Index for path searches
CREATE INDEX idx_locations_path ON locations(path);

-- 2. Update Inventory Table
-- Add location_id, make location (text) nullable (eventually deprecate)
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_inventory_location_id ON inventory(location_id);
