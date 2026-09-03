-- migration_79d_fix_check_in_ticket_rpc.sql
-- Remove the ON CONFLICT clause from check_in_ticket's audit INSERT.
--
-- Design rationale:
--   The atomicity guarantee (UPDATE ... WHERE status = 'valid') means two
--   concurrent callers can never both reach the INSERT INTO ticket_checkins
--   for the same ticket_instance_id. In production the conflict path is
--   unreachable. Silencing a conflict with DO NOTHING would be incorrect
--   for an append-only audit log — a real duplicate insert (e.g. caused by
--   out-of-band status manipulation) should raise an error, not silently
--   produce a check-in with no audit trail.

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
  -- Atomic gate: only one caller can transition status 'valid' → 'used'.
  -- Postgres row-level locking ensures a second concurrent caller blocks here
  -- until the first commits, then sees status = 'used' and falls through to
  -- the ALREADY_CHECKED_IN exception path. The INSERT below is only reached
  -- by the one successful caller.
  UPDATE ticket_instances
  SET status       = 'used',
      checked_in_at = NOW(),
      updated_at   = NOW()
  WHERE id     = p_ticket_instance_id
    AND status = 'valid'
  RETURNING id, event_id, order_id INTO v_updated_id, v_event_id, v_order_id;

  IF v_updated_id IS NOT NULL THEN
    -- Append-only audit insert. No ON CONFLICT: if a duplicate somehow
    -- occurs it should raise, not be silently swallowed.
    INSERT INTO ticket_checkins (ticket_instance_id, ticket_order_id, event_id, scanned_by_user_id, checked_in_at)
    VALUES (v_updated_id, v_order_id, v_event_id, p_scanned_by_user_id, NOW());

    RETURN v_updated_id;
  END IF;

  -- No row updated — check why and throw the specific exception.
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
