-- migration_140_agent_registry_rollback.sql
BEGIN;
DROP TABLE IF EXISTS agent_tools;
DROP TABLE IF EXISTS agent_versions;
DROP TRIGGER IF EXISTS trg_agents_updated_at ON agents;
DROP FUNCTION IF EXISTS update_agents_updated_at();
DROP TABLE IF EXISTS agents;
COMMIT;
NOTIFY pgrst, 'reload schema';
