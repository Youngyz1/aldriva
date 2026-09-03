-- migration_79d_fix_check_in_ticket_rpc_rollback.sql
-- Rollback for migration_79d: restore the check_in_ticket audit INSERT conflict handler.

BEGIN;

DROP FUNCTION IF EXISTS check_in_ticket(UUID, UUID);

CREATE OR REPLACE FUNCTION check_in_ticket(
  p_ticket_instance_id UUID,
  p_scanned_by_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_event_id   UUID;
  v_order_id   UUID;
  v_current_status TEXT;
BEGIN
  UPDATE ticket_instances
  SET status       = 'used',
      checked_in_at = NOW(),
      updated_at   = NOW()
  WHERE id     = p_ticket_instance_id
    AND status = 'valid'
  RETURNING id, event_id, order_id INTO v_updated_id, v_event_id, v_order_id;

  IF v_updated_id IS NOT NULL THEN
    INSERT INTO ticket_checkins (ticket_instance_id, ticket_order_id, event_id, scanned_by_user_id, checked_in_at)
    VALUES (v_updated_id, v_order_id, v_event_id, p_scanned_by_user_id, NOW())
    ON CONFLICT (ticket_instance_id) DO NOTHING;

    RETURN v_updated_id;
  END IF;

  SELECT status INTO v_current_status
  FROM ticket_instances
  WHERE id = p_ticket_instance_id;

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

REVOKE EXECUTE ON FUNCTION check_in_ticket(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_in_ticket(UUID, UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
