-- migration_148_approval_gated_call_text.sql
-- Stage 10.10: let an approval-gated CALL reach the gate (text only).
--
-- Live dylan runs refused to call execSmokeNotify: three model-facing texts
-- (dylan prompt, orchestrator suffix, tool description) each tell the model
-- to state approval is required INSTEAD of calling, so toolCalls stays empty
-- and the code gate (which runs only after a call) never fires. This
-- migration changes model-facing TEXT ONLY: the approval requirement stays
-- fully enforced in code (lib/ai/approvals.ts + orchestrator gate untouched).
--
-- Contents (all guarded exact-match so re-runs are no-ops):
--  1. tool_definitions.description for execSmokeNotify (old 147 text -> new
--     mechanism text). Code definition edited in parallel; both carry the
--     identical new sentence (asserted hermetically).
--  2. agents.system_prompt for dylan (old text -> old + exception sentence).
--     Code fallback edited in parallel; verified verbatim-identical.
--  3. agent_versions v2 snapshot for dylan (table comment prescribes a
--     snapshot on each config change; no code reads this table).
--
-- Sentinel/qa prompts untouched. No other tool description touched.
-- Rollback: db/migration_148_approval_gated_call_text_rollback.sql restores
-- the exact originals and deletes the v2 row.

BEGIN;

-- 1. Tool description: mechanism language (call creates the approval request).
UPDATE tool_definitions
SET description = 'Smoke-test action. Calling this tool does not execute it: the platform intercepts the call and creates a pending human-approval request, and nothing runs until a human approves. Call it when asked, with an optional short note (max 200 chars).'
WHERE name = 'execSmokeNotify'
  AND description = 'Stage 10.9 smoke-test action ONLY: writes one clearly-labeled in-app notification to the tenant owner. Requires human approval; executes via the background worker. Not a product feature.';

-- 2. Dylan prompt: append the approval-gated-call exception sentence.
UPDATE agents
SET system_prompt = 'You are Dylan, the Executive Coordinator for the Aldriva AI workforce. You are a read-only executive agent. Your responsibilities: coordinate tasks, summarize status, and provide grounded answers from knowledge and authorized tools. You must never perform writes, deployments, or financial actions. You must call only tools explicitly allowed for your identity. If a task requires a write or high-risk action, respond that it requires human approval and stop. Exception: approval-gated tools in your allowlist may be called. Calling one does not perform the write; the platform intercepts the call and routes it to human approval. Never try to bypass or pre-empt the approval step.',
    updated_at = now()
WHERE name = 'dylan'
  AND system_prompt = 'You are Dylan, the Executive Coordinator for the Aldriva AI workforce. You are a read-only executive agent. Your responsibilities: coordinate tasks, summarize status, and provide grounded answers from knowledge and authorized tools. You must never perform writes, deployments, or financial actions. You must call only tools explicitly allowed for your identity. If a task requires a write or high-risk action, respond that it requires human approval and stop.';

-- 3. Version snapshot (only when the prompt now carries the new text).
INSERT INTO agent_versions (agent_id, version, system_prompt, model_selection, autonomy_level)
SELECT id, 2, system_prompt, model_selection, autonomy_level FROM agents WHERE name = 'dylan'
  AND system_prompt LIKE '%Exception: approval-gated tools in your allowlist may be called.%'
ON CONFLICT (agent_id, version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
