-- migration_147_exec_smoke_notify.sql
-- Stage 10.9: ONE test-scoped approval-gated tool (smoke-test enabler).
--
-- Context: request_qa_run is the only tool with approval_required=true and
-- is excluded from generic materialization, so the generic Stage 10 path has
-- no legitimate live input. This migration adds a single narrowly scoped
-- write — execSmokeNotify, granted to the dylan agent ONLY — so an approved
-- execution can be exercised end to end through the real orchestrator block
-- path. It is a smoke-test enabler, not a feature.
--
-- Blast radius (deliberately minimal):
--  * No existing tool row touched; no existing grant touched. No agent
--    behavior changes except dylan being OFFERED one additional tool.
--  * Executor writes exactly one in-app notifications row (fixed type
--    'like', fixed '[Stage 10.9 smoke test] ' title prefix) to the FIRST
--    tenant owner; no email ever (the shared createNotification() sends via
--    Resend only when an email param is supplied — never passed here).
--  * Undo: delete the notification row(s) by title prefix, then apply the
--    rollback twin (removes grant + definition cleanly).
--
-- Rollback: db/migration_147_exec_smoke_notify_rollback.sql.

BEGIN;

INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('execSmokeNotify','Stage 10.9 smoke-test action ONLY: writes one clearly-labeled in-app notification to the tenant owner. Requires human approval; executes via the background worker. Not a product feature.','{"type":"object","properties":{"note":{"type":"string","description":"Short note appended after the fixed smoke-test title prefix (max 200 chars)."}},"required":[]}'::jsonb,'{}'::jsonb,'transactional','medium',true,'lib/ai/tools/tenant/tenant-notifications:execSmokeNotify')
ON CONFLICT (name) DO NOTHING;

INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true
FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'dylan' AND t.name IN ('execSmokeNotify')
ON CONFLICT (agent_id, tool_name) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
