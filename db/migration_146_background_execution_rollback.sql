-- migration_146_background_execution_rollback.sql
-- Rollback twin for db/migration_146_background_execution.sql (Stage 10.1).
--
-- Drops (reverse order): approved-poll index, attempt unique index, attempt
-- column, lease/claim indexes, idempotency constraint, execution columns.
-- Base agent_tasks/agent_runs rows are untouched; only the new columns'
-- data is discarded. RLS was never changed, so nothing is restored.
-- Mirrors live in supabase/migrations/ — never place this rollback there.

BEGIN;

DROP INDEX IF EXISTS idx_approvals_approved_poll;
DROP INDEX IF EXISTS uq_agent_runs_task_attempt;
ALTER TABLE agent_runs DROP COLUMN IF EXISTS attempt_no;

DROP INDEX IF EXISTS idx_agent_tasks_lease;
DROP INDEX IF EXISTS idx_agent_tasks_claim;
ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS uq_agent_tasks_idempotency;
ALTER TABLE agent_tasks
  DROP COLUMN IF EXISTS result_ref,
  DROP COLUMN IF EXISTS run_after,
  DROP COLUMN IF EXISTS max_attempts,
  DROP COLUMN IF EXISTS attempt_count,
  DROP COLUMN IF EXISTS claim_token_hash,
  DROP COLUMN IF EXISTS last_heartbeat_at,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS lease_owner,
  DROP COLUMN IF EXISTS idempotency_key;

COMMIT;

NOTIFY pgrst, 'reload schema';
