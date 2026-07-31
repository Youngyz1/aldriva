-- migration_34_follows_table.sql
-- User-to-user follows table and policies.

CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CONSTRAINT chk_follower_following_not_equal CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follows are publicly readable" ON follows;
CREATE POLICY "Follows are publicly readable"
ON follows FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can create follows" ON follows;
CREATE POLICY "Users can create follows"
ON follows FOR INSERT
WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can delete follows" ON follows;
CREATE POLICY "Users can delete follows"
ON follows FOR DELETE
USING (auth.uid() = follower_id);

NOTIFY pgrst, 'reload schema';
