CREATE TABLE IF NOT EXISTS millwork_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL, -- e.g., 'door_type', 'material', 'access'
    name VARCHAR(100) NOT NULL,
    price_adjustment DECIMAL(10, 2) DEFAULT 0.00,
    attributes JSONB DEFAULT '{}'::jsonb, -- Store flexible attributes like dimensions constraints
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_millwork_options_category ON millwork_options(category);
