-- organizers_schema.sql
-- Public organizer profiles are business pages owned by auth users.

CREATE TABLE IF NOT EXISTS organizers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    bio TEXT,
    photo TEXT,
    banner TEXT,
    facebook TEXT,
    twitter TEXT,
    website TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizers_user_id ON organizers(user_id);

ALTER TABLE events
ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events(organizer_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Events are publicly readable" ON events;
CREATE POLICY "Events are publicly readable"
ON events FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can create events for their organizer profiles" ON events;
CREATE POLICY "Users can create events for their organizer profiles"
ON events FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = events.organizer_id
          AND organizers.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can update events for their organizer profiles" ON events;
CREATE POLICY "Users can update events for their organizer profiles"
ON events FOR UPDATE
USING (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = events.organizer_id
          AND organizers.user_id = auth.uid()
    )
)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = events.organizer_id
          AND organizers.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can delete their events" ON events;
CREATE POLICY "Users can delete their events"
ON events FOR DELETE
USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS organizer_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organizer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organizer_follows_organizer_id
ON organizer_follows(organizer_id);

CREATE INDEX IF NOT EXISTS idx_organizer_follows_user_id
ON organizer_follows(user_id);

ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers are publicly readable" ON organizers;
CREATE POLICY "Organizers are publicly readable"
ON organizers FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can create organizer profiles" ON organizers;
CREATE POLICY "Users can create organizer profiles"
ON organizers FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their organizer profiles" ON organizers;
CREATE POLICY "Users can update their organizer profiles"
ON organizers FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their organizer profiles" ON organizers;
CREATE POLICY "Users can delete their organizer profiles"
ON organizers FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organizer follows are publicly readable" ON organizer_follows;
CREATE POLICY "Organizer follows are publicly readable"
ON organizer_follows FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can follow organizers" ON organizer_follows;
CREATE POLICY "Users can follow organizers"
ON organizer_follows FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unfollow organizers" ON organizer_follows;
CREATE POLICY "Users can unfollow organizers"
ON organizer_follows FOR DELETE
USING (auth.uid() = user_id);
