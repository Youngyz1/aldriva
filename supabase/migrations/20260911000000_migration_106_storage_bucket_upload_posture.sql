-- 20260911000000_migration_106_storage_bucket_upload_posture.sql
--
-- Supabase-CLI mirror of db/migration_106_storage_bucket_upload_posture.sql
-- (identical body; the db/ file is canonical per CLAUDE.md). Kept in sync so
-- `supabase db push` deploys the same caps as the manual db/ history.
--
-- P1 F-09 part B: bucket-level file_size_limit + allowed_mime_types for the
-- media buckets (defense in depth behind the app-code magic-byte checks).
--
-- Context: the audit snapshot (docs/migration-audit/sql/009) shows every
-- media bucket with file_size_limit = null and allowed_mime_types = null;
-- only organizer-verification-docs (migration_86) and user-identity-docs
-- (migration_87) carry bucket-level limits. Client-direct uploads to
-- videos/event-videos therefore had no server-side size or type backstop.
--
-- Caps below are set AT the largest legitimate flow per bucket (verified by
-- reading upload call sites — never below, so no current flow breaks):
--   videos            50MB  video/mp4, webm, ogg, quicktime
--                     (max legit: 50MB client cap; RichTextEditor + create-fundraiser)
--   event-videos      200MB video/mp4, webm, ogg, quicktime, x-msvideo, x-m4v
--                     (max legit: 200MB IMPORT_VIDEO_MAX_BYTES via the
--                     service-role media/import path; direct clients stay
--                     50MB via app code. A 50MB bucket cap would break imports.)
--   event-banners     15MB  image/jpeg, png, webp, gif, avif
--                     (max legit: 15MB IMPORT_IMAGE_MAX_BYTES via media/import)
--   guest-images      8MB   image/jpeg, png, webp, avif
--                     (max legit: 8MB MAX_SOURCE_FILE_SIZE in lib/image-processing.ts)
--   profile-images,
--   fundraiser-media,
--   organizer-banners,
--   organizer-images  5MB   image/jpeg, png, webp, gif, avif
--                     (max legit: 5MB MAX_ORIGINAL_BYTES — every writer funnels
--                     through lib/uploadImage.ts, which pre-filters to
--                     jpeg/png/webp; gif/avif included to match the shared
--                     DEFAULT_IMAGE_TYPES contract, sizes still capped)
--
-- Honest limits of this migration (read before applying):
--   * allowed_mime_types is checked against the upload's DECLARED content
--     type, which is client-supplied on direct uploads — spoofable on its
--     own. It is a backstop, not the control: the actual byte checks are the
--     app-code validators (validateVideoMagicBytes for video, the
--     uploadImage pipeline for images). file_size_limit IS hard-enforced
--     server-side on the byte count.
--   * Operator must still verify live bucket state in the Supabase dashboard
--     (this repo cannot confirm production buckets match the audit snapshot)
--     and smoke-test the media/import video flow in staging after applying,
--     since a 200MB import exercises the top of the event-videos cap.
--
-- Rollback: db/migration_106_storage_bucket_upload_posture_rollback.sql
-- (restores null/null — removes the backstop, emergency use only).

BEGIN;

UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
WHERE id = 'videos';

UPDATE storage.buckets
SET file_size_limit = 209715200,
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-m4v']
WHERE id = 'event-videos';

UPDATE storage.buckets
SET file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
WHERE id = 'event-banners';

-- guest-images is referenced by uploadGuestPortrait (lib/image-processing.ts)
-- but, unlike every other bucket here, NO migration in the repo ever creates
-- it and it appears in no audit snapshot — a bare UPDATE would silently
-- affect 0 rows if it is absent in production. Create-if-missing first
-- (migration_12/74/82 precedent), public with a public-read SELECT policy
-- (migration_74 article-audio precedent: portraits are served via
-- getPublicUrl), then cap it like the rest. Server-side writes via the
-- service-role client bypass RLS, so no INSERT policy is needed or added.
INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-images', 'guest-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Guest images are public for SELECT" ON storage.objects;
CREATE POLICY "Guest images are public for SELECT"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'guest-images');

UPDATE storage.buckets
SET file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
WHERE id = 'guest-images';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
WHERE id IN ('profile-images', 'fundraiser-media', 'organizer-banners', 'organizer-images');

COMMIT;

NOTIFY pgrst, 'reload schema';
