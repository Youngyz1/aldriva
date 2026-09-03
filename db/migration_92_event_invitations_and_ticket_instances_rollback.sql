-- migration_92_event_invitations_and_ticket_instances_rollback.sql
-- Rollback migration_92

BEGIN;

-- 1. Restore ticket_instances RLS
DROP POLICY IF EXISTS "Users can view relevant ticket instances" ON ticket_instances;
CREATE POLICY "Users can view relevant ticket instances" ON ticket_instances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ticket_orders
      WHERE ticket_orders.id = ticket_instances.order_id
        AND (
          (auth.jwt()->>'email' IS NOT NULL AND LOWER(ticket_orders.buyer_email) = LOWER(auth.jwt()->>'email'))
          OR ticket_orders.buyer_email IS NULL
        )
    )
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_instances.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager', 'ticket_scanner'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- 2. Remove ticket_instances constraints, indexes, and columns
ALTER TABLE ticket_instances DROP CONSTRAINT IF EXISTS chk_ticket_instances_source_integrity;
DROP INDEX IF EXISTS idx_ticket_instances_invitation_id;
DROP INDEX IF EXISTS idx_ticket_instances_source;

-- Remove non-purchase ticket instances before restoring order_id NOT NULL constraint
DELETE FROM ticket_instances WHERE order_id IS NULL;

ALTER TABLE ticket_instances ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE ticket_instances DROP COLUMN IF EXISTS invitation_id;
ALTER TABLE ticket_instances DROP COLUMN IF EXISTS source;

-- 3. Drop event_invitations table
DROP TABLE IF EXISTS event_invitations CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
