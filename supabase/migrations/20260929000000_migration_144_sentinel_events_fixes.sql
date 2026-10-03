-- migration_144_sentinel_events_fixes.sql
-- Follow-up to 143: Fix system_events.source CHECK and incident_events RLS

BEGIN;

-- Fix 1: source format check (not value-locked)
ALTER TABLE system_events DROP CONSTRAINT IF EXISTS system_events_source_check;
ALTER TABLE system_events ADD CONSTRAINT system_events_source_check
  CHECK (source ~ '^[a-z][a-z0-9_]{1,30}$');

-- Fix 2: incident_events tenant-scoped RLS
DROP POLICY IF EXISTS "Authenticated can read incident events" ON incident_events;
DROP POLICY IF EXISTS "Tenant members and admins can read incident events" ON incident_events;
CREATE POLICY "Tenant members and admins can read incident events"
  ON incident_events FOR SELECT
  USING (
    incident_id IN (
      SELECT id FROM incidents
      WHERE (tenant_id IS NULL AND EXISTS (
               SELECT 1 FROM profiles
               WHERE profiles.id = auth.uid()
                 AND profiles.role='admin' AND profiles.status='active'))
         OR (tenant_id IS NOT NULL AND is_entity_member(
               tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    )
  );

COMMIT;
NOTIFY pgrst, 'reload schema';
