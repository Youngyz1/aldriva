-- eventbrite_sources_schema.sql
-- Selected Eventbrite organizer feeds that can be synced into local events.

CREATE TABLE IF NOT EXISTS eventbrite_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
    organizer_name TEXT NOT NULL,
    organizer_url TEXT NOT NULL,
    organizer_eventbrite_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    last_sync_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, organizer_eventbrite_id, organizer_id)
);

CREATE INDEX IF NOT EXISTS idx_eventbrite_sources_user_id
ON eventbrite_sources(user_id);

CREATE INDEX IF NOT EXISTS idx_eventbrite_sources_enabled
ON eventbrite_sources(enabled);

ALTER TABLE eventbrite_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can read their Eventbrite sources"
ON eventbrite_sources FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can create their Eventbrite sources"
ON eventbrite_sources FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    AND (
        organizer_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM organizers
            WHERE organizers.id = eventbrite_sources.organizer_id
              AND organizers.user_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Users can update their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can update their Eventbrite sources"
ON eventbrite_sources FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND (
        organizer_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM organizers
            WHERE organizers.id = eventbrite_sources.organizer_id
              AND organizers.user_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Users can delete their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can delete their Eventbrite sources"
ON eventbrite_sources FOR DELETE
USING (auth.uid() = user_id);
