-- migration_150_memory_hardening_rollback.sql
-- Stage 13 rollback: removes everything migration_150 added, dependency-safe
-- order (kind CHECK restore → trigger/function → RPC + grants → indexes).
-- Caveat (migration_145 class): purge 'memory_retrieval' agent_steps rows
-- before restoring the kind CHECK; forward-fix only once real runs exist.
-- Memory tables/rows from migration_149 are untouched.

BEGIN;

-- F-5: restore the kind CHECK (purge memory_retrieval steps first).
-- DELETE FROM agent_steps WHERE kind = 'memory_retrieval';
ALTER TABLE agent_steps DROP CONSTRAINT IF EXISTS agent_steps_kind_check;
ALTER TABLE agent_steps ADD CONSTRAINT agent_steps_kind_check CHECK (kind IN (
  'thought','tool_call','tool_result','model_output','guard_verdict',
  'approval_request','knowledge_retrieval','error'));

-- F-4: drop the append-only guard.
DROP TRIGGER IF EXISTS trg_agent_memory_versions_no_mutation ON agent_memory_versions;
DROP FUNCTION IF EXISTS reject_agent_memory_versions_mutation();

-- F-2: drop the atomic apply RPC (grants die with the function).
DROP FUNCTION IF EXISTS apply_agent_memory(uuid,boolean,text,uuid,uuid,text,text,text,timestamptz,text,uuid,uuid,uuid,uuid,timestamptz,integer);

-- F-1: drop the partial unique indexes (base UNIQUE from 149 stays).
DROP INDEX IF EXISTS uq_agent_memory_platform;
DROP INDEX IF EXISTS uq_agent_memory_tenant;
DROP INDEX IF EXISTS uq_agent_memory_agent_platform;

COMMIT;

NOTIFY pgrst, 'reload schema';
