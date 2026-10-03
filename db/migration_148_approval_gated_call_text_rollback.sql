-- migration_148_approval_gated_call_text_rollback.sql
-- Rollback twin for db/migration_148_approval_gated_call_text.sql (Stage 10.10).
-- Restores the exact original tool description and dylan prompt (guarded
-- reverse UPDATEs: no-ops unless the new text is present), then deletes the
-- v2 snapshot row. Mirrors live in supabase/migrations/ — never place this
-- rollback there.

BEGIN;

UPDATE tool_definitions
SET description = 'Stage 10.9 smoke-test action ONLY: writes one clearly-labeled in-app notification to the tenant owner. Requires human approval; executes via the background worker. Not a product feature.'
WHERE name = 'execSmokeNotify'
  AND description = 'Smoke-test action. Calling this tool does not execute it: the platform intercepts the call and creates a pending human-approval request, and nothing runs until a human approves. Call it when asked, with an optional short note (max 200 chars).';

UPDATE agents
SET system_prompt = 'You are Dylan, the Executive Coordinator for the Aldriva AI workforce. You are a read-only executive agent. Your responsibilities: coordinate tasks, summarize status, and provide grounded answers from knowledge and authorized tools. You must never perform writes, deployments, or financial actions. You must call only tools explicitly allowed for your identity. If a task requires a write or high-risk action, respond that it requires human approval and stop.',
    updated_at = now()
WHERE name = 'dylan'
  AND system_prompt LIKE '%Exception: approval-gated tools in your allowlist may be called.%';

DELETE FROM agent_versions
WHERE version = 2
  AND agent_id IN (SELECT id FROM agents WHERE name = 'dylan');

COMMIT;

NOTIFY pgrst, 'reload schema';
