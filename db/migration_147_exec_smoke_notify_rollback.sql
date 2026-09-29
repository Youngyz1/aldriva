-- migration_147_exec_smoke_notify_rollback.sql
-- Rollback twin for db/migration_147_exec_smoke_notify.sql (Stage 10.9).
-- Removes the dylan grant first, then the tool definition (explicit order;
-- the agent_tools FK would cascade, but explicit is auditable). Notification
-- rows written by smoke runs are NOT deleted here — remove them by title
-- prefix first (see runbook): DELETE FROM notifications WHERE title LIKE
-- '[Stage 10.9 smoke test]%'. Mirrors live in supabase/migrations/ — never
-- place this rollback there.

BEGIN;

DELETE FROM agent_tools
WHERE tool_name = 'execSmokeNotify'
  AND agent_id IN (SELECT id FROM agents WHERE name = 'dylan');

DELETE FROM tool_definitions WHERE name = 'execSmokeNotify';

COMMIT;

NOTIFY pgrst, 'reload schema';
