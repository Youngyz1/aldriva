-- migration_13_fundraisers_organizer_ownership.sql
-- Adds organizer ownership to fundraisers and backfills existing rows.
-- Safe to re-run: uses IF NOT EXISTS, idempotent backfill, and policy recreation.

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fundraisers_organizer_id
  ON fundraisers(organizer_id);

-- Backfill old fundraiser rows to the owner's oldest organizer profile.
-- If a user has no organizer profile, the fundraiser remains unassigned.
WITH first_organizers AS (
  SELECT DISTINCT ON (user_id)
    id,
    user_id
  FROM organizers
  ORDER BY user_id, created_at ASC
)
UPDATE fundraisers
SET organizer_id = first_organizers.id
FROM first_organizers
WHERE fundraisers.organizer_id IS NULL
  AND fundraisers.user_id = first_organizers.user_id;

ALTER TABLE fundraisers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fundraisers are publicly readable" ON fundraisers;
CREATE POLICY "Fundraisers are publicly readable"
  ON fundraisers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create fundraisers for their organizer profiles" ON fundraisers;
CREATE POLICY "Users can create fundraisers for their organizer profiles"
  ON fundraisers FOR INSERT
  WITH CHECK (
    auth.uid() = fundraisers.user_id
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = fundraisers.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update fundraisers for their organizer profiles" ON fundraisers;
CREATE POLICY "Users can update fundraisers for their organizer profiles"
  ON fundraisers FOR UPDATE
  USING (
    auth.uid() = fundraisers.user_id
    OR EXISTS (
      SELECT 1
      FROM organizers
      WHERE organizers.id = fundraisers.organizer_id
        AND organizers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = fundraisers.user_id
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = fundraisers.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete their organizer fundraisers" ON fundraisers;
CREATE POLICY "Users can delete their organizer fundraisers"
  ON fundraisers FOR DELETE
  USING (
    auth.uid() = fundraisers.user_id
    OR EXISTS (
      SELECT 1
      FROM organizers
      WHERE organizers.id = fundraisers.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

-- Keep fundraiser media editable after fundraisers move to organizer ownership.
DROP POLICY IF EXISTS "Users can create media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can create media for their fundraisers"
  ON fundraiser_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM fundraisers
      LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (
          fundraisers.user_id = auth.uid()
          OR organizers.user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Users can update media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can update media for their fundraisers"
  ON fundraiser_media FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM fundraisers
      LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (
          fundraisers.user_id = auth.uid()
          OR organizers.user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM fundraisers
      LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (
          fundraisers.user_id = auth.uid()
          OR organizers.user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Users can delete media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can delete media for their fundraisers"
  ON fundraiser_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM fundraisers
      LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (
          fundraisers.user_id = auth.uid()
          OR organizers.user_id = auth.uid()
        )
    )
  );

NOTIFY pgrst, 'reload schema';
