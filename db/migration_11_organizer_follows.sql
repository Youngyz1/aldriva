-- migration_11_organizer_follows.sql
-- Ensures organizer follow storage and RLS policies exist.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS organizer_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organizer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organizer_follows_organizer_id
ON organizer_follows(organizer_id);

CREATE INDEX IF NOT EXISTS idx_organizer_follows_user_id
ON organizer_follows(user_id);

ALTER TABLE organizer_follows ENABLE ROW LEVEL SECURITY;

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

NOTIFY pgrst, 'reload schema';
