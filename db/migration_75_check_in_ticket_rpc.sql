-- migration_75_check_in_ticket_rpc.sql
-- Standalone Concurrency Hotfix: Atomic Ticket Check-In
-- Fixes TOCTOU race condition where concurrent check-in updates returned 0 modified rows
-- without raising a PostgREST error, leading to false positive check-in confirmations.

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
  -- Perform single atomic state check and update
  UPDATE ticket_orders
  SET status = 'used',
      checked_in_at = NOW()
  WHERE id = p_ticket_order_id
    AND status = 'valid'
  RETURNING id INTO v_updated_id;

  -- If a row was updated, return the ticket_order id successfully
  IF v_updated_id IS NOT NULL THEN
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

-- Restrict execution to service_role only (same pattern as migration 72)
REVOKE EXECUTE ON FUNCTION check_in_ticket(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_in_ticket(UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
