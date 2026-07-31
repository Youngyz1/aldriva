-- gofundme_sources_schema.sql
-- Selected GoFundMe fundraiser pages that can be synced into local fundraisers.

CREATE TABLE IF NOT EXISTS gofundme_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fundraiser_id UUID REFERENCES fundraisers(id) ON DELETE SET NULL,
    title TEXT,
    organizer TEXT,
    source_url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    last_sync_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, source_url)
);

CREATE INDEX IF NOT EXISTS idx_gofundme_sources_user_id
ON gofundme_sources(user_id);

CREATE INDEX IF NOT EXISTS idx_gofundme_sources_enabled
ON gofundme_sources(enabled);

ALTER TABLE gofundme_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their GoFundMe sources" ON gofundme_sources;
CREATE POLICY "Users can read their GoFundMe sources"
ON gofundme_sources FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their GoFundMe sources" ON gofundme_sources;
CREATE POLICY "Users can create their GoFundMe sources"
ON gofundme_sources FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their GoFundMe sources" ON gofundme_sources;
CREATE POLICY "Users can update their GoFundMe sources"
ON gofundme_sources FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their GoFundMe sources" ON gofundme_sources;
CREATE POLICY "Users can delete their GoFundMe sources"
ON gofundme_sources FOR DELETE
USING (auth.uid() = user_id);
