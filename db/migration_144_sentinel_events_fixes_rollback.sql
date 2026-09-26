-- migration_144_sentinel_events_fixes_rollback.sql
BEGIN;
DROP POLICY IF EXISTS "Tenant members and admins can read incident events" ON incident_events;
CREATE POLICY "Authenticated can read incident events"
  ON incident_events FOR SELECT
  USING (auth.role() = 'authenticated');
ALTER TABLE system_events DROP CONSTRAINT IF EXISTS system_events_source_check;
ALTER TABLE system_events ADD CONSTRAINT system_events_source_check
  CHECK (source = 'aldriva');
COMMIT;
NOTIFY pgrst, 'reload schema';
