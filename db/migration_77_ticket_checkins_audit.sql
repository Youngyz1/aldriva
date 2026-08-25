-- migration_77_ticket_checkins_audit.sql
-- Phase 3: Ticket Check-In Audit Table & Scanner Identity Attribution.

BEGIN;

-- 1. Table: ticket_checkins
CREATE TABLE IF NOT EXISTS ticket_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_order_id UUID NOT NULL REFERENCES ticket_orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_checkins_event_id ON ticket_checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_scanned_by ON ticket_checkins(scanned_by_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_checkins_order_id ON ticket_checkins(ticket_order_id);

-- Enable RLS
ALTER TABLE ticket_checkins ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizers and Event Managers can view check-ins for their events
DROP POLICY IF EXISTS "Users can view checkins for their events" ON ticket_checkins;
CREATE POLICY "Users can view checkins for their events" ON ticket_checkins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_checkins.event_id
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

-- Drop legacy single-parameter signature to prevent PostgREST function overloading ambiguity (PGRST203)
DROP FUNCTION IF EXISTS check_in_ticket(UUID);

-- 2. Update check_in_ticket RPC signature to accept optional p_scanned_by_user_id
CREATE OR REPLACE FUNCTION check_in_ticket(
  p_ticket_order_id UUID,
  p_scanned_by_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_event_id UUID;
  v_current_status TEXT;
BEGIN
  -- Perform single atomic state check and update
  UPDATE ticket_orders
  SET status = 'used',
      checked_in_at = NOW()
  WHERE id = p_ticket_order_id
    AND status = 'valid'
  RETURNING id, event_id INTO v_updated_id, v_event_id;

  -- If a row was updated, record in ticket_checkins audit table and return id
  IF v_updated_id IS NOT NULL THEN
    INSERT INTO ticket_checkins (ticket_order_id, event_id, scanned_by_user_id, checked_in_at)
    VALUES (v_updated_id, v_event_id, p_scanned_by_user_id, NOW())
    ON CONFLICT (ticket_order_id) DO NOTHING;

    RETURN v_updated_id;
  END IF;

  -- If no row was updated, inspect ticket status to throw a specific exception
  SELECT status INTO v_current_status
  FROM ticket_orders
  WHERE id = p_ticket_order_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  ELSIF v_current_status = 'used' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN';
  ELSIF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  ELSIF v_current_status = 'refunded' THEN
    RAISE EXCEPTION 'TICKET_REFUNDED';
  ELSE
    RAISE EXCEPTION 'TICKET_NOT_VALID';
  END IF;
END;
$$;

-- Grants for RPC
REVOKE EXECUTE ON FUNCTION check_in_ticket(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_in_ticket(UUID, UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
