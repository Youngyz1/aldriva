-- migration_100_event_operations_and_audit.sql
-- Phase 7: Event Operations, Append-Only Operational Audit Trail, and Scoped Lifecycle Controls.

BEGIN;

-- 1. Table: event_audit_logs (Append-Only Event Operational Audit Trail)
CREATE TABLE IF NOT EXISTS event_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_audit_logs_event_created ON event_audit_logs(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_audit_logs_event_action ON event_audit_logs(event_id, action);
CREATE INDEX IF NOT EXISTS idx_event_audit_logs_actor ON event_audit_logs(actor_user_id);

-- Enable RLS
ALTER TABLE event_audit_logs ENABLE ROW LEVEL SECURITY;

-- Append-only trigger: Prevent UPDATE and DELETE by ordinary application flows
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'event_audit_logs is append-only. UPDATE and DELETE are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_audit_logs_mod ON event_audit_logs;
CREATE TRIGGER trg_prevent_event_audit_logs_mod
  BEFORE UPDATE OR DELETE ON event_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- RLS Policy: Organizers and Event Managers can view audit logs for their events
DROP POLICY IF EXISTS "Organizers can view audit logs for their events" ON event_audit_logs;
CREATE POLICY "Organizers can view audit logs for their events" ON event_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_audit_logs.event_id
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

-- 2. Add operational control fields to events table (additive only)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS checkin_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_window_end TIMESTAMPTZ;

-- 3. Add operational lifecycle fields to event_invitations table (additive only)
ALTER TABLE event_invitations
  ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS personal_message TEXT,
  ADD COLUMN IF NOT EXISTS operational_notes TEXT;

COMMIT;
