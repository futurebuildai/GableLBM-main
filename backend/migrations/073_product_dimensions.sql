-- Migration: 073_product_dimensions
-- Description: Add canonical parametric 3D geometry to products so the PIM is the
--              source of truth for per-product dimensions. AI_LM's Load Builder
--              consumes these via /api/integration/products to render each product
--              as a scaled digital twin (1 inch = 1/12 Three.js world unit).
--              Dimensions are nullable: NULL means "no geometry entered yet" and
--              downstream consumers fall back to their own defaults. geometry_source
--              is a forward-compat seam so a future 'mesh' value + mesh_url column
--              can ship without breaking the integration contract.

ALTER TABLE products ADD COLUMN IF NOT EXISTS length_in DECIMAL(19,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_in  DECIMAL(19,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_in DECIMAL(19,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stackable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS geometry_source TEXT NOT NULL DEFAULT 'parametric';
