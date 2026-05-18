-- Sprint 19: Product Configurator Rules Engine

CREATE TABLE IF NOT EXISTS configurator_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_type VARCHAR(50) NOT NULL,       -- e.g., 'Grade', 'Treatment'
    attribute_value VARCHAR(100) NOT NULL,      -- e.g., 'Treatable', '#2'
    depends_on_type VARCHAR(50) NOT NULL,       -- e.g., 'Species'
    depends_on_value VARCHAR(100) NOT NULL,     -- e.g., 'SYP'
    is_allowed BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,                          -- Human-readable conflict message
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_configurator_rules_dependency
    ON configurator_rules(depends_on_type, depends_on_value);
CREATE INDEX IF NOT EXISTS idx_configurator_rules_attribute
    ON configurator_rules(attribute_type, attribute_value);

CREATE TABLE IF NOT EXISTS configurator_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    product_type VARCHAR(50) NOT NULL,          -- 'Lumber', 'Door', 'Trim', 'Panel'
    config JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Full attribute selections
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_configurator_presets_type ON configurator_presets(product_type);

-- =============================================================================
-- Seed: Lumber Rule Matrix (Species → Treatment constraints)
-- =============================================================================

-- SYP: Treatable=YES, Structural=YES, Appearance=NO
INSERT INTO configurator_rules (attribute_type, attribute_value, depends_on_type, depends_on_value, is_allowed, error_message)
VALUES
    ('Treatment', 'Treatable', 'Species', 'SYP', true, NULL),
    ('Grade', 'Structural', 'Species', 'SYP', true, NULL),
    ('Grade', 'Appearance', 'Species', 'SYP', false, 'SYP is not available in Appearance grade — use Cedar or Douglas Fir for appearance applications'),

    -- Douglas Fir: Treatable=NO, Structural=YES, Appearance=YES
    ('Treatment', 'Treatable', 'Species', 'Douglas Fir', false, 'Douglas Fir cannot be pressure treated — use SYP, Hem-Fir, or SPF for treatable applications'),
    ('Grade', 'Structural', 'Species', 'Douglas Fir', true, NULL),
    ('Grade', 'Appearance', 'Species', 'Douglas Fir', true, NULL),

    -- Cedar: Treatable=NO, Structural=NO, Appearance=YES
    ('Treatment', 'Treatable', 'Species', 'Cedar', false, 'Cedar is naturally rot-resistant and should not be pressure treated'),
    ('Grade', 'Structural', 'Species', 'Cedar', false, 'Cedar is not rated for structural applications — use SYP or Douglas Fir'),
    ('Grade', 'Appearance', 'Species', 'Cedar', true, NULL),

    -- Hem-Fir: Treatable=YES, Structural=YES, Appearance=NO
    ('Treatment', 'Treatable', 'Species', 'Hem-Fir', true, NULL),
    ('Grade', 'Structural', 'Species', 'Hem-Fir', true, NULL),
    ('Grade', 'Appearance', 'Species', 'Hem-Fir', false, 'Hem-Fir is not available in Appearance grade — use Cedar or Douglas Fir'),

    -- SPF: Treatable=YES, Structural=NO, Appearance=NO
    ('Treatment', 'Treatable', 'Species', 'SPF', true, NULL),
    ('Grade', 'Structural', 'Species', 'SPF', false, 'SPF is not rated for structural applications — use SYP, Douglas Fir, or Hem-Fir'),
    ('Grade', 'Appearance', 'Species', 'SPF', false, 'SPF is not available in Appearance grade — use Cedar or Douglas Fir')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Seed: Standard Grade options per Species
-- =============================================================================
INSERT INTO configurator_rules (attribute_type, attribute_value, depends_on_type, depends_on_value, is_allowed)
VALUES
    ('Grade', '#1', 'Species', 'SYP', true),
    ('Grade', '#2', 'Species', 'SYP', true),
    ('Grade', '#3', 'Species', 'SYP', true),
    ('Grade', '#1', 'Species', 'Douglas Fir', true),
    ('Grade', '#2', 'Species', 'Douglas Fir', true),
    ('Grade', 'Select Structural', 'Species', 'Douglas Fir', true),
    ('Grade', 'Clear', 'Species', 'Cedar', true),
    ('Grade', 'STK', 'Species', 'Cedar', true),
    ('Grade', '#2', 'Species', 'Hem-Fir', true),
    ('Grade', 'Stud', 'Species', 'Hem-Fir', true),
    ('Grade', 'Stud', 'Species', 'SPF', true),
    ('Grade', '#2', 'Species', 'SPF', true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Seed: Example Presets
-- =============================================================================
INSERT INTO configurator_presets (name, description, product_type, config)
VALUES
    ('Standard Interior Door', 'Basic interior passage door', 'Door', '{"species": "SYP", "grade": "#2", "treatment": "None", "width": 36, "height": 80}'::jsonb),
    ('Treated Deck Frame', 'Pressure-treated SYP for deck framing', 'Lumber', '{"species": "SYP", "grade": "#2", "treatment": "Treatable", "dimensions": "2x6-10"}'::jsonb),
    ('Cedar Fence Picket', 'Western Red Cedar fence boards', 'Lumber', '{"species": "Cedar", "grade": "STK", "treatment": "None", "dimensions": "1x6-6"}'::jsonb)
ON CONFLICT DO NOTHING;
