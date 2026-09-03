-- migration_90_ai_content_calendar_rollback.sql

BEGIN;

DROP TABLE IF EXISTS ai_content_calendar CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
