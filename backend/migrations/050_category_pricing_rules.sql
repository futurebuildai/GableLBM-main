-- 050: Category-aware pricing rules for the tier/account pricing matrix
-- Replaces hardcoded tier multipliers with flexible, category-scoped rules

CREATE TABLE IF NOT EXISTS category_pricing_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target: WHO this rule applies to
    target_type     TEXT NOT NULL CHECK (target_type IN ('ACCOUNT', 'TIER')),
    customer_id     UUID REFERENCES customers(id),
    tier            TEXT,

    -- Scope: WHAT product category this rule covers
    category_id     UUID NOT NULL REFERENCES product_categories(id),

    -- Rule: HOW to calculate effective price
    rule_type       TEXT NOT NULL CHECK (rule_type IN ('MARKUP', 'MARKDOWN', 'FIXED', 'MARGIN')),
    rule_value      NUMERIC(19,4) NOT NULL,

    -- Margin protection
    margin_floor_pct NUMERIC(6,4),

    -- Validity window
    starts_at       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    priority        INTEGER NOT NULL DEFAULT 0,

    -- Audit
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure ACCOUNT rules have customer_id and TIER rules have tier
    CHECK (
        (target_type = 'ACCOUNT' AND customer_id IS NOT NULL) OR
        (target_type = 'TIER' AND tier IS NOT NULL)
    )
);

-- Performance indexes for the 5-step resolution algorithm
CREATE INDEX IF NOT EXISTS idx_cat_pricing_account_category
    ON category_pricing_rules(customer_id, category_id)
    WHERE is_active = true AND target_type = 'ACCOUNT';

CREATE INDEX IF NOT EXISTS idx_cat_pricing_tier_category
    ON category_pricing_rules(tier, category_id)
    WHERE is_active = true AND target_type = 'TIER';

CREATE INDEX IF NOT EXISTS idx_cat_pricing_active
    ON category_pricing_rules(is_active, target_type);

-- Seed default tier rules replicating existing hardcoded multipliers:
-- Silver = 10% markdown, Gold = 15% markdown, Platinum = 20% markdown
-- Applied to all root-level categories (not General)

INSERT INTO category_pricing_rules (target_type, tier, category_id, rule_type, rule_value, created_by)
SELECT 'TIER', 'SILVER', id, 'MARKDOWN', 10.0000, 'system_migration'
FROM product_categories WHERE parent_id IS NULL AND slug != 'general';

INSERT INTO category_pricing_rules (target_type, tier, category_id, rule_type, rule_value, created_by)
SELECT 'TIER', 'GOLD', id, 'MARKDOWN', 15.0000, 'system_migration'
FROM product_categories WHERE parent_id IS NULL AND slug != 'general';

INSERT INTO category_pricing_rules (target_type, tier, category_id, rule_type, rule_value, created_by)
SELECT 'TIER', 'PLATINUM', id, 'MARKDOWN', 20.0000, 'system_migration'
FROM product_categories WHERE parent_id IS NULL AND slug != 'general';
