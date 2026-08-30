-- migration_82_organizer_verification_storage_rollback.sql
-- Removes the organizer-verification-docs storage bucket and its RLS policies.

BEGIN;

DROP POLICY IF EXISTS "Admins can read all verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Organizer can read own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Organizer can upload verification docs" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'organizer-verification-docs';

COMMIT;

NOTIFY pgrst, 'reload schema';
