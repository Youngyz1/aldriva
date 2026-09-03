-- migration_86_storage_bucket_limits.sql
-- Configure bucket-level file size limits and allowed MIME types for organizer-verification-docs bucket.
--
-- File size limit: 10MB (10485760 bytes)
-- Allowed MIME types: application/pdf, image/jpeg, image/png, image/webp

BEGIN;

UPDATE storage.buckets
SET 
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
WHERE id = 'organizer-verification-docs';

COMMIT;

NOTIFY pgrst, 'reload schema';
