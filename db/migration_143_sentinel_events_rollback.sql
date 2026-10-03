-- migration_143_sentinel_events_rollback.sql
BEGIN;
-- Remove Sentinel 4-tool ACL + definitions
DELETE FROM agent_tools WHERE tool_name IN ('get_recent_events','get_active_incidents','get_guard_rejections','get_recent_webhook_failures');
DELETE FROM tool_definitions WHERE name IN ('get_recent_events','get_active_incidents','get_guard_rejections','get_recent_webhook_failures');

-- Drop observability tables (leaf first)
DROP TABLE IF EXISTS incident_events;
DROP TABLE IF EXISTS incidents;
DROP TABLE IF EXISTS system_events;

-- Revert ai_guard_rejections.tenant_id (and its RLS) — restore admin-only policy
DROP POLICY IF EXISTS "Tenant members and admins can read guard rejections" ON ai_guard_rejections;
DROP INDEX IF EXISTS idx_ai_guard_rejections_context;
DROP INDEX IF EXISTS idx_ai_guard_rejections_tenant_id;
ALTER TABLE ai_guard_rejections DROP COLUMN IF EXISTS tenant_id;

-- Restore original admin-only SELECT (migration_89 shape)
DROP POLICY IF EXISTS "Admins can view ai_guard_rejections" ON ai_guard_rejections;
CREATE POLICY "Admins can view ai_guard_rejections" ON ai_guard_rejections
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active'));

-- Keep insert policy as was (admin+service_role). service_role bypasses RLS anyway.
COMMIT;
NOTIFY pgrst, 'reload schema';
