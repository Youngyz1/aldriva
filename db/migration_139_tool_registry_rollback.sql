-- migration_139_tool_registry_rollback.sql
BEGIN;
DROP TRIGGER IF EXISTS trg_tool_definitions_updated_at ON tool_definitions;
DROP FUNCTION IF EXISTS update_tool_definitions_updated_at();
DROP TABLE IF EXISTS tool_definitions;
COMMIT;
NOTIFY pgrst, 'reload schema';
