CREATE TABLE rfcs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    problem_statement TEXT,
    proposed_solution TEXT,
    content TEXT,
    author_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rfcs_status ON rfcs(status);
CREATE INDEX idx_rfcs_author_id ON rfcs(author_id);
