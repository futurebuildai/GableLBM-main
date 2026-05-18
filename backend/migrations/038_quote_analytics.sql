-- Quote lifecycle tracking and analytics columns
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_total NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Store original uploaded file for AI-sourced quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS original_file BYTEA;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS original_content_type TEXT;

-- Store AI parse mapping data (raw_text -> matched product mapping) as JSONB
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS parse_map JSONB;

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_quotes_state ON quotes(state);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_source ON quotes(source);
