-- migration_87_user_identity_verifications_rollback.sql
-- Reverts migration 87.

BEGIN;

DROP TRIGGER IF EXISTS trg_prevent_user_identity_self_approval ON user_identity_verifications;
DROP FUNCTION IF EXISTS prevent_user_identity_self_approval();

DROP POLICY IF EXISTS "User can delete own draft identity docs" ON storage.objects;
DROP POLICY IF EXISTS "User can upload own identity docs" ON storage.objects;
DROP POLICY IF EXISTS "User can read own identity docs" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'user-identity-docs';

DROP TABLE IF EXISTS user_identity_verifications CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
