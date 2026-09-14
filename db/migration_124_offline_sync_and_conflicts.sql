-- migration_124_offline_sync_and_conflicts.sql
-- Phase C: Offline Write Queue, Sync Endpoint & Conflict Resolution Schema

BEGIN;

-- 1. Extend ticket_checkins table with delegating user attribution and offline scan timestamp
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS delegating_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS offline_scanned_at TIMESTAMPTZ;

-- Ensure scan_source check constraint allows 'offline_sync'
ALTER TABLE ticket_checkins DROP CONSTRAINT IF EXISTS ticket_checkins_scan_source_check;
ALTER TABLE ticket_checkins ADD CONSTRAINT ticket_checkins_scan_source_check CHECK (scan_source IN ('online', 'offline', 'offline_sync'));

-- Indexes for delegating user and offline scan timestamp
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_delegating_user ON ticket_checkins(delegating_user_id) WHERE delegating_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_offline_scanned_at ON ticket_checkins(offline_scanned_at) WHERE offline_scanned_at IS NOT NULL;

-- 2. Create offline_scan_conflicts table for logging conflicting duplicate scans
CREATE TABLE IF NOT EXISTS offline_scan_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_instance_id UUID REFERENCES ticket_instances(id) ON DELETE CASCADE,
  ticket_order_id UUID REFERENCES ticket_orders(id) ON DELETE CASCADE,
  offline_scan_id UUID NOT NULL,
  device_id TEXT,
  entrance_id UUID,
  delegating_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  offline_scanned_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conflict_reason TEXT NOT NULL,
  winning_checkin_id UUID REFERENCES ticket_checkins(id) ON DELETE SET NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_conflicts_event_id ON offline_scan_conflicts(event_id);
CREATE INDEX IF NOT EXISTS idx_offline_conflicts_instance_id ON offline_scan_conflicts(ticket_instance_id);
CREATE INDEX IF NOT EXISTS idx_offline_conflicts_scan_id ON offline_scan_conflicts(offline_scan_id);

-- 3. Enable RLS and define select policy
ALTER TABLE offline_scan_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conflicts for their events" ON offline_scan_conflicts;
CREATE POLICY "Users can view conflicts for their events" ON offline_scan_conflicts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = offline_scan_conflicts.event_id
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
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
