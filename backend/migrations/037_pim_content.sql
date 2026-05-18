-- 037_pim_content.sql
-- AI-Powered PIM (Product Information Management) tables

-- PIM Content: 1:1 with products — AI descriptions, attributes, SEO metadata
CREATE TABLE IF NOT EXISTS pim_content (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,

    -- AI-generated descriptions
    short_description   TEXT DEFAULT '',
    long_description    TEXT DEFAULT '',
    marketing_copy      TEXT DEFAULT '',

    -- Extracted product attributes (species, grade, treatment, dimensions, etc.)
    attributes          JSONB DEFAULT '{}',

    -- SEO metadata
    seo_title           VARCHAR(120) DEFAULT '',
    seo_description     VARCHAR(320) DEFAULT '',
    seo_keywords        TEXT[] DEFAULT '{}',
    seo_slug            VARCHAR(255) DEFAULT '',

    -- Generation audit trail
    last_gen_model      VARCHAR(100) DEFAULT '',
    last_gen_prompt     TEXT DEFAULT '',
    last_gen_at         TIMESTAMP WITH TIME ZONE,

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pim_content_product ON pim_content(product_id);

-- PIM Media: 1:many product images
CREATE TABLE IF NOT EXISTS pim_media (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    media_type      VARCHAR(30) NOT NULL DEFAULT 'hero',   -- hero, lifestyle, technical, swatch
    url             TEXT NOT NULL DEFAULT '',               -- URL or data URI
    alt_text        VARCHAR(500) DEFAULT '',
    sort_order      INT DEFAULT 0,
    is_primary      BOOLEAN DEFAULT FALSE,

    -- AI generation metadata
    gen_model       VARCHAR(100) DEFAULT '',
    gen_prompt      TEXT DEFAULT '',
    gen_style       VARCHAR(50) DEFAULT '',
    generated_at    TIMESTAMP WITH TIME ZONE,

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pim_media_product ON pim_media(product_id);

-- PIM Collateral: 1:many sell sheets, social posts, email blasts
CREATE TABLE IF NOT EXISTS pim_collateral (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    collateral_type VARCHAR(30) NOT NULL DEFAULT 'sell_sheet', -- sell_sheet, facebook, instagram, linkedin, email_blast
    title           VARCHAR(255) DEFAULT '',
    content         TEXT DEFAULT '',
    tone            VARCHAR(50) DEFAULT '',
    audience        VARCHAR(100) DEFAULT '',

    -- AI generation metadata
    gen_model       VARCHAR(100) DEFAULT '',
    gen_prompt      TEXT DEFAULT '',
    generated_at    TIMESTAMP WITH TIME ZONE,

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pim_collateral_product ON pim_collateral(product_id);
