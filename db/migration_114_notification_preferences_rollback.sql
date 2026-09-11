-- migration_114_notification_preferences_rollback.sql
--
-- Rollback for migration_114.

BEGIN;

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
DROP FUNCTION IF EXISTS update_notification_preferences_updated_at();
DROP TABLE IF EXISTS notification_preferences CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
