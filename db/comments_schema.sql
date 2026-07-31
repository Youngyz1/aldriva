-- comments_schema.sql
-- Public comments for events and fundraisers.

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('event', 'fundraiser')),
    target_id UUID NOT NULL,
    author_name VARCHAR(120) DEFAULT 'Anonymous',
    author_email VARCHAR(255),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 1000),
    status VARCHAR(30) DEFAULT 'approved' CHECK (status IN ('approved', 'hidden')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_target
ON comments(target_type, target_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;

CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_updated_at();

NOTIFY pgrst, 'reload schema';
