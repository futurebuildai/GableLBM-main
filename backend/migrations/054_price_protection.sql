-- Migration: 054_price_protection
-- Lumber Index-Aware Quote Price Protection
-- Extends migration 023 (market_indices, price_escalators) and 049 (product_categories).
-- All changes are additive.

-- 1. Extend market_indices with stable code + taxonomy + activation
ALTER TABLE market_indices
    ADD COLUMN IF NOT EXISTS index_code TEXT,
    ADD COLUMN IF NOT EXISTS commodity_kind TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill index_code for existing seeded rows
UPDATE market_indices SET index_code = 'RL_FRAMING_COMP' WHERE index_code IS NULL AND name = 'Random Lengths Framing Lumber Composite';
UPDATE market_indices SET index_code = 'RL_PANEL_COMP'   WHERE index_code IS NULL AND name = 'Random Lengths Structural Panel Composite';
UPDATE market_indices SET index_code = 'CME_LBR'         WHERE index_code IS NULL AND name = 'CME Lumber Futures';

-- Enforce NOT NULL + UNIQUE on index_code now that all rows have values
ALTER TABLE market_indices
    ALTER COLUMN index_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'market_indices_index_code_unique'
    ) THEN
        ALTER TABLE market_indices
            ADD CONSTRAINT market_indices_index_code_unique UNIQUE (index_code);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_market_indices_active ON market_indices(is_active) WHERE is_active;

-- Seed remaining indices needed for the MVP taxonomy
INSERT INTO market_indices (name, source, current_value, previous_value, unit, index_code, commodity_kind, description)
VALUES
    ('Random Lengths SPF #2&Btr 2x4',       'RANDOM_LENGTHS', 412.0000, 405.0000, 'MBF', 'RL_SPF_2X4',    'DIMENSIONAL_LUMBER', 'Western SPF #2&Btr 2x4 spot price'),
    ('Random Lengths SYP 2x4',              'RANDOM_LENGTHS', 478.0000, 470.0000, 'MBF', 'RL_SYP_2X4',    'DIMENSIONAL_LUMBER', 'Southern Yellow Pine 2x4 spot price'),
    ('Random Lengths OSB 7/16"',            'RANDOM_LENGTHS', 530.0000, 522.0000, 'MSF', 'RL_OSB_716',    'PANEL',              'OSB 7/16" 4x8 spot price'),
    ('Madison''s Lumber Prices Composite',  'MADISONS',       522.0000, 515.0000, 'MBF', 'MADISONS_COMP', 'COMPOSITE',          'Madison''s 497-product composite, public weekly')
ON CONFLICT (index_code) DO NOTHING;

-- Backfill commodity_kind for the original 3 seeded rows where it is still NULL
UPDATE market_indices SET commodity_kind = 'COMPOSITE' WHERE commodity_kind IS NULL AND index_code IN ('RL_FRAMING_COMP', 'RL_PANEL_COMP');
UPDATE market_indices SET commodity_kind = 'FUTURES'   WHERE commodity_kind IS NULL AND index_code = 'CME_LBR';

-- 2. Market index history (time-series append-only)
CREATE TABLE IF NOT EXISTS market_index_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_index_id UUID NOT NULL REFERENCES market_indices(id) ON DELETE CASCADE,
    value           DECIMAL(19,4) NOT NULL CHECK (value > 0),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by     TEXT,
    source          TEXT NOT NULL DEFAULT 'MANUAL'
);
CREATE INDEX IF NOT EXISTS idx_market_index_history_index_time ON market_index_history(market_index_id, recorded_at DESC);

-- 3. Category → index default mapping
CREATE TABLE IF NOT EXISTS product_category_index_defaults (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL UNIQUE REFERENCES product_categories(id) ON DELETE CASCADE,
    market_index_id UUID NOT NULL REFERENCES market_indices(id) ON DELETE RESTRICT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_category_index_defaults_index ON product_category_index_defaults(market_index_id);

-- Seed category defaults for the lumber subtree
INSERT INTO product_category_index_defaults (category_id, market_index_id)
SELECT pc.id, mi.id
FROM product_categories pc
JOIN market_indices mi ON mi.index_code = CASE pc.slug
    WHEN 'framing_lumber'  THEN 'RL_FRAMING_COMP'
    WHEN 'sheathing'       THEN 'RL_PANEL_COMP'
    WHEN 'engineered_wood' THEN 'RL_FRAMING_COMP'
    WHEN 'lumber'          THEN 'RL_FRAMING_COMP'
    ELSE NULL
END
WHERE pc.slug IN ('framing_lumber','sheathing','engineered_wood','lumber')
ON CONFLICT (category_id) DO NOTHING;

-- 4. Extend price_escalators with snapshot lifecycle fields
ALTER TABLE price_escalators
    ADD COLUMN IF NOT EXISTS base_index_recorded_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_checked_at             TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_state               TEXT NOT NULL DEFAULT 'OK',
    ADD COLUMN IF NOT EXISTS policy_at_snapshot          TEXT,
    ADD COLUMN IF NOT EXISTS threshold_pct_at_snapshot   DECIMAL(8,4);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'price_escalators_current_state_check'
    ) THEN
        ALTER TABLE price_escalators
            ADD CONSTRAINT price_escalators_current_state_check
            CHECK (current_state IN ('OK','FLAGGED','ESCALATED','ACK_REQUIRED','ACKNOWLEDGED','BLOCKED','OVERRIDDEN','CLEARED'));
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_price_escalators_index_active ON price_escalators(market_index_id, is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_price_escalators_state ON price_escalators(current_state);

-- 5. Append-only exposure event ledger
CREATE TABLE IF NOT EXISTS quote_exposure_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id                UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    quote_line_id           UUID REFERENCES quote_lines(id) ON DELETE CASCADE,
    market_index_id         UUID REFERENCES market_indices(id) ON DELETE SET NULL,
    market_index_history_id UUID REFERENCES market_index_history(id) ON DELETE SET NULL,
    event_type              TEXT NOT NULL CHECK (event_type IN (
        'DETECTED','FLAGGED','ESCALATED','ACK_REQUIRED','ACK_REQUESTED','ACKNOWLEDGED','CLEARED','BLOCKED','OVERRIDDEN'
    )),
    base_index_value        DECIMAL(19,4),
    current_index_value     DECIMAL(19,4),
    delta_pct               DECIMAL(8,4),
    exposure_dollars        DECIMAL(19,4),
    threshold_pct           DECIMAL(8,4),
    policy                  TEXT,
    actor_user_id           TEXT,
    actor_role              TEXT,
    method                  TEXT,
    notes                   TEXT,
    idempotency_key         TEXT NOT NULL UNIQUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_exposure_events_quote_time   ON quote_exposure_events(quote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_exposure_events_type_time    ON quote_exposure_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_exposure_events_line         ON quote_exposure_events(quote_line_id);
CREATE INDEX IF NOT EXISTS idx_quote_exposure_events_market_index ON quote_exposure_events(market_index_id, created_at DESC);

-- 6. Extend customers with escalation policy
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS price_escalation_policy        TEXT NOT NULL DEFAULT 'FLAG_FOR_REQUOTE',
    ADD COLUMN IF NOT EXISTS escalation_threshold_pct       DECIMAL(8,4) NOT NULL DEFAULT 5.0000,
    ADD COLUMN IF NOT EXISTS escalation_agreement_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalation_agreement_ref       TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_escalation_policy_check') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_escalation_policy_check
            CHECK (price_escalation_policy IN ('AUTO_ESCALATE','FLAG_FOR_REQUOTE','REQUIRE_ACK'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_escalation_threshold_check') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_escalation_threshold_check
            CHECK (escalation_threshold_pct > 0 AND escalation_threshold_pct <= 50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_auto_escalate_requires_agreement') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_auto_escalate_requires_agreement
            CHECK (price_escalation_policy <> 'AUTO_ESCALATE' OR escalation_agreement_signed_at IS NOT NULL);
    END IF;
END$$;

-- 7. Extend products with per-SKU index override + commodity flag
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS market_index_id UUID REFERENCES market_indices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_commodity    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_market_index ON products(market_index_id) WHERE market_index_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_commodity ON products(is_commodity) WHERE is_commodity;

-- Initial backfill: mark all products in the lumber.* subtree as commodity
UPDATE products p SET is_commodity = TRUE
FROM product_categories pc
WHERE p.category_id = pc.id
  AND pc.path <@ 'lumber'::ltree
  AND p.is_commodity = FALSE;

-- 8. Extend quotes with denormalized exposure rollup
ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS exposure_state           TEXT NOT NULL DEFAULT 'OK',
    ADD COLUMN IF NOT EXISTS exposure_dollars         DECIMAL(19,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS exposure_last_checked_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_exposure_state_check') THEN
        ALTER TABLE quotes ADD CONSTRAINT quotes_exposure_state_check
            CHECK (exposure_state IN ('OK','FLAGGED','ESCALATED','ACK_REQUIRED','ACKNOWLEDGED','BLOCKED','OVERRIDDEN'));
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_quotes_exposure_state ON quotes(exposure_state) WHERE exposure_state <> 'OK';
