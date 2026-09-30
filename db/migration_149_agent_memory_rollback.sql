-- migration_149_agent_memory_rollback.sql
-- Stage 12 rollback: removes everything migration_149 added, dependency-safe
-- order (policies → indexes → history table → memory table → trigger
-- function → seed rows). Base registry/runtime rows untouched. Data in the
-- new tables is discarded.

BEGIN;

DELETE FROM agent_tools WHERE tool_name = 'memory_propose';
DELETE FROM tool_definitions WHERE name = 'memory_propose';

DROP POLICY IF EXISTS "Members and admins can read memory history" ON agent_memory_versions;
DROP POLICY IF EXISTS "Members and admins can read scoped memory" ON agent_memory;

DROP TRIGGER IF EXISTS trg_agent_memory_updated_at ON agent_memory;

DROP INDEX IF EXISTS idx_agent_memory_versions_fact;
DROP INDEX IF EXISTS idx_agent_memory_expiry;
DROP INDEX IF EXISTS idx_agent_memory_scope;

DROP TABLE IF EXISTS agent_memory_versions;
DROP TABLE IF EXISTS agent_memory;

DROP FUNCTION IF EXISTS update_agent_memory_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
