-- migration_158_media_buckets_setup.sql
--
-- Create-if-missing for the hand-created media buckets the app writes to.
--
-- Background: several media buckets were created by hand in the production
-- project and NO migration in the repo creates them (verified: only
-- migration_106 UPDATEs their limits, which silently affects 0 rows when a
-- bucket is absent). Fresh/staging projects therefore fail uploads with a
-- raw "Bucket not found" — e.g. publishing a public event with a banner
-- (uploadImage(banner, "event-banners", <event-id>)).
--
-- Buckets created here (public, limits/MIME match migration_106 caps):
--   event-banners     15MB  image/jpeg, png, webp, gif, avif
--   fundraiser-media   5MB  image/jpeg, png, webp, gif, avif
--   organizer-banners  5MB  image/jpeg, png, webp, gif, avif
--   organizer-images   5MB  image/jpeg, png, webp, gif, avif
--   videos            50MB  video/mp4, webm, ogg, quicktime
--   event-videos     200MB  video/mp4, webm, ogg, quicktime, x-msvideo, x-m4v
--
-- Policies: public-read SELECT on all six (guest-images precedent,
-- migration_106). Authenticated INSERT on the five buckets that have no
-- scoped upload policy in the repo (sibling-bucket precedent described in
-- migration_102). event-banners keeps its scoped manager policy from
-- migration_102 untouched. Operators who need tighter per-path rules
-- should add scoped policies after applying.
--
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING, DROP POLICY IF EXISTS +
-- CREATE, unconditional UPDATEs. Safe to re-run.
--
-- NOT applied to any database by this commit. Verify live bucket state in
-- the Supabase dashboard after applying.
--
-- Rollback: db/migration_158_media_buckets_setup_rollback.sql
-- (drops the policies created here, restores null limits, drops buckets
-- only when empty — never deletes stored objects).

BEGIN;

-- ── 1. Buckets (create if missing) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('event-banners', 'event-banners', true, 15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('fundraiser-media', 'fundraiser-media', true, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('organizer-banners', 'organizer-banners', true, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('organizer-images', 'organizer-images', true, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('videos', 'videos', true, 52428800,
    ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']),
  ('event-videos', 'event-videos', true, 209715200,
    ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-m4v'])
ON CONFLICT (id) DO NOTHING;

-- ── 2. Limits/MIME (same caps as migration_106, re-asserted) ──
UPDATE storage.buckets
SET file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
WHERE id = 'event-banners';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
WHERE id IN ('fundraiser-media', 'organizer-banners', 'organizer-images');

UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
WHERE id = 'videos';

UPDATE storage.buckets
SET file_size_limit = 209715200,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-m4v']
WHERE id = 'event-videos';

-- ── 3. Public-read SELECT policies ──
DROP POLICY IF EXISTS "Media buckets are public for SELECT" ON storage.objects;
CREATE POLICY "Media buckets are public for SELECT"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('event-banners', 'fundraiser-media', 'organizer-banners', 'organizer-images', 'videos', 'event-videos'));

-- ── 4. Authenticated INSERT policies (buckets without a scoped policy) ──
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated users can upload media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('fundraiser-media', 'organizer-banners', 'organizer-images', 'videos', 'event-videos'));

COMMIT;

NOTIFY pgrst, 'reload schema';
