-- migration_106_storage_bucket_upload_posture_rollback.sql
--
-- Emergency rollback for migration_106: restores file_size_limit = null and
-- allowed_mime_types = null on the media buckets (the pre-F-09 state per the
-- audit snapshot) and therefore REMOVES the server-side upload backstop.
-- Use only to restore uploads if the 106 caps block a legitimate flow that
-- was missed during review; fix the cap forward instead if possible.

BEGIN;

UPDATE storage.buckets
SET file_size_limit = NULL,
    allowed_mime_types = NULL
WHERE id IN (
  'videos', 'event-videos', 'event-banners', 'guest-images',
  'profile-images', 'fundraiser-media', 'organizer-banners', 'organizer-images'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
