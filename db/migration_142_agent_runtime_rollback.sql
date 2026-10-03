-- migration_142_agent_runtime_rollback.sql
BEGIN;
DROP TABLE IF EXISTS agent_reports;
DROP TABLE IF EXISTS agent_steps;
DROP TABLE IF EXISTS agent_runs;
DROP TABLE IF EXISTS approvals;
DROP TRIGGER IF EXISTS trg_agent_tasks_updated_at ON agent_tasks;
DROP FUNCTION IF EXISTS update_agent_tasks_updated_at();
DROP TABLE IF EXISTS agent_tasks;
COMMIT;
NOTIFY pgrst, 'reload schema';
