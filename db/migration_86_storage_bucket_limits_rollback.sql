-- migration_86_storage_bucket_limits_rollback.sql
-- Revert file_size_limit and allowed_mime_types to NULL.

BEGIN;

UPDATE storage.buckets
SET 
  file_size_limit = NULL,
  allowed_mime_types = NULL
WHERE id = 'organizer-verification-docs';

COMMIT;

NOTIFY pgrst, 'reload schema';
