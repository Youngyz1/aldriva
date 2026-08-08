-- migration_57_pending_deletion_status_rollback.sql
--
-- WARNING: narrowing the constraint again re-breaks account deletion, which
-- writes 'pending_deletion'. It will also FAIL outright if any row currently
-- holds that status — migrate those rows first:
--
--   UPDATE profiles SET status = 'active', deleted_at = NULL, purge_at = NULL
--   WHERE status = 'pending_deletion';
--
-- (That restores them, which is the safe direction. Setting them to 'purged'
-- instead would strand people mid-grace-period with no way back.)

BEGIN;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'purged'::text]));

COMMIT;

NOTIFY pgrst, 'reload schema';
