-- migration_135_profile_locale_rollback.sql
BEGIN;
DROP INDEX IF EXISTS idx_profiles_locale;
ALTER TABLE profiles DROP COLUMN IF EXISTS locale;
COMMIT;
NOTIFY pgrst, 'reload schema';
