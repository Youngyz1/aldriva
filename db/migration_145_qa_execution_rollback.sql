-- migration_145_qa_execution_rollback.sql
-- Rollback twin for db/migration_145_qa_execution.sql (Stage 7).
--
-- CAVEATS (read before running):
--  1. The kind-CHECK restore FAILS if any system_events rows with kind =
--     'qa_failure' exist. Purge (or reclassify) those rows first.
--  2. This rollback is sanctioned ONLY before real QA runs accumulate.
--     After production data exists, forward-fix instead of rolling back.
--  3. Dropping qa_runs cascades to qa_test_results (all run history lost).

BEGIN;

DROP TABLE IF EXISTS qa_test_results;
DROP TABLE IF EXISTS qa_runs;

ALTER TABLE system_events DROP CONSTRAINT IF EXISTS system_events_kind_check;
ALTER TABLE system_events ADD CONSTRAINT system_events_kind_check CHECK (kind IN (
  'api_error','job_error','webhook_error','payment_reconciliation','auth_failure',
  'storage_error','guard_rejection','approval_block','agent_tool_error'));

COMMIT;

NOTIFY pgrst, 'reload schema';
