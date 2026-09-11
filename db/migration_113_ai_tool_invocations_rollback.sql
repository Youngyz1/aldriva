-- migration_113_ai_tool_invocations_rollback.sql
--
-- Rollback for migration_113.

BEGIN;

DROP TABLE IF EXISTS ai_tool_invocations CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
