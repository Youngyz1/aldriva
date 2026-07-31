-- migration_09_fundraiser_media.sql
-- Adds multiple fundraiser banner/gallery photos with per-photo captions.

CREATE TABLE IF NOT EXISTS fundraiser_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id UUID NOT NULL REFERENCES fundraisers(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  caption       TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fundraiser_media_fundraiser_id
  ON fundraiser_media(fundraiser_id);

CREATE INDEX IF NOT EXISTS idx_fundraiser_media_sort_order
  ON fundraiser_media(fundraiser_id, sort_order);

ALTER TABLE fundraiser_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fundraiser media is publicly readable" ON fundraiser_media;
CREATE POLICY "Fundraiser media is publicly readable"
  ON fundraiser_media FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can create media for their fundraisers"
  ON fundraiser_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM fundraisers
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND fundraisers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can update media for their fundraisers"
  ON fundraiser_media FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM fundraisers
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND fundraisers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM fundraisers
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND fundraisers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can delete media for their fundraisers"
  ON fundraiser_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM fundraisers
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND fundraisers.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
