-- migration_10_organizer_visibility.sql
-- Adds public/private visibility to organizer profiles.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS and recreates the read policy.

ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));

UPDATE organizers
SET visibility = 'public'
WHERE visibility IS NULL OR visibility = '';

CREATE INDEX IF NOT EXISTS idx_organizers_visibility ON organizers(visibility);

DROP POLICY IF EXISTS "Organizers are publicly readable" ON organizers;
DROP POLICY IF EXISTS "Public organizers are readable" ON organizers;
CREATE POLICY "Public organizers are readable"
ON organizers FOR SELECT
USING (
  visibility = 'public'
  OR auth.uid() = user_id
);

NOTIFY pgrst, 'reload schema';
