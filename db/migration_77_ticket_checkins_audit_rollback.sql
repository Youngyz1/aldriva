-- migration_77_ticket_checkins_audit_rollback.sql
--
-- Drops the ticket_checkins table and restores check_in_ticket() RPC signature
-- to single parameter.
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- WARNING — PERMANENT DATA LOSS
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- Running this rollback will CASCADE-delete every row in:
--
--   ticket_checkins  — all recorded audit logs attributing check-ins to scanners
--
-- This is NOT a soft delete. Once run, scanner attribution audit data
-- is permanently destroyed.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

BEGIN;

-- 1. Drop RLS Policy
DROP POLICY IF EXISTS "Users can view checkins for their events" ON ticket_checkins;

-- 2. Drop ticket_checkins table
DROP TABLE IF EXISTS ticket_checkins CASCADE;

-- 3. Restore check_in_ticket(UUID) signature
DROP FUNCTION IF EXISTS check_in_ticket(UUID, UUID);

CREATE OR REPLACE FUNCTION check_in_ticket(
  p_ticket_order_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_current_status TEXT;
BEGIN
  UPDATE ticket_orders
  SET status = 'used',
      checked_in_at = NOW()
  WHERE id = p_ticket_order_id
    AND status = 'valid'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NOT NULL THEN
    RETURN v_updated_id;
  END IF;

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

REVOKE EXECUTE ON FUNCTION check_in_ticket(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_in_ticket(UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
