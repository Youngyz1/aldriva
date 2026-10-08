-- migration_158_media_buckets_setup_rollback.sql
--
-- Rollback twin of db/migration_158_media_buckets_setup.sql.
-- Reverse order: policies first, limits restored to null (migration_106
-- rollback precedent), buckets dropped ONLY when empty — stored objects
-- are never deleted by this rollback.

BEGIN;

-- ── 4. Drop the INSERT policy created here ──
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

-- ── 3. Drop the SELECT policy created here ──
DROP POLICY IF EXISTS "Media buckets are public for SELECT" ON storage.objects;

-- ── 2. Restore null limits ──
UPDATE storage.buckets
SET file_size_limit = NULL,
    allowed_mime_types = NULL
WHERE id IN ('event-banners', 'fundraiser-media', 'organizer-banners', 'organizer-images', 'videos', 'event-videos');

-- ── 1. Drop buckets only when they hold no objects ──
DO $$
DECLARE
  bucket_name TEXT;
BEGIN
  FOREACH bucket_name IN ARRAY ARRAY['event-banners', 'fundraiser-media', 'organizer-banners', 'organizer-images', 'videos', 'event-videos']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = bucket_name) THEN
      DELETE FROM storage.buckets WHERE id = bucket_name;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
