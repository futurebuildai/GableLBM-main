-- Add weight per unit to products for capacity calculation
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_lbs DECIMAL(10,2) DEFAULT 0;

-- Comment: weight_lbs represents per-unit weight in pounds.
-- For lumber (BF/MBF), set to per-board-foot weight.
-- For bags (concrete, gravel), set to per-bag weight.
-- Zero means weight unknown (will be excluded from capacity calculations).
