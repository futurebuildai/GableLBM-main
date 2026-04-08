-- Migration 051: Unique constraints for category pricing rules
-- Prevents duplicate active rules for the same target+category combination

-- Only one active TIER rule per tier+category
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpr_unique_tier
    ON category_pricing_rules (tier, category_id)
    WHERE target_type = 'TIER' AND is_active = true;

-- Only one active ACCOUNT rule per customer+category
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpr_unique_account
    ON category_pricing_rules (customer_id, category_id)
    WHERE target_type = 'ACCOUNT' AND is_active = true;
