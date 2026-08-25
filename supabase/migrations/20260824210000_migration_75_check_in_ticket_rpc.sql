-- 20260824210000_migration_75_check_in_ticket_rpc.sql
-- Standalone Concurrency Hotfix: Atomic Ticket Check-In

BEGIN;

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
