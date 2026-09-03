-- migration_80b_multi_ticket_instances_rollback.sql
-- Rollback for migration_80b: restores single-instance record_ticket_and_credit definition.

BEGIN;

CREATE OR REPLACE FUNCTION record_ticket_and_credit(
  p_event_id UUID,
  p_ticket_id UUID,
  p_seat_id UUID,
  p_seat_label TEXT,
  p_buyer_email TEXT,
  p_buyer_name TEXT,
  p_quantity INTEGER,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_qr_code TEXT,
  p_stripe_payment_intent_id TEXT,
  p_stripe_session_id TEXT
) RETURNS TABLE (
  ticket_order_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_order_id UUID;
  v_event_organizer_id UUID;
  v_event_user_id UUID;
  v_recipient_id UUID;
BEGIN
  INSERT INTO ticket_orders (
    event_id,
    ticket_id,
    seat_id,
    seat_label,
    buyer_email,
    buyer_name,
    quantity,
    total_amount,
    currency,
    qr_code,
    status,
    stripe_payment_intent_id,
    stripe_session_id
  ) VALUES (
    p_event_id,
    p_ticket_id,
    p_seat_id,
    p_seat_label,
    p_buyer_email,
    p_buyer_name,
    p_quantity,
    p_total_amount,
    p_currency,
    p_qr_code,
    'valid',
    p_stripe_payment_intent_id,
    p_stripe_session_id
  )
  ON CONFLICT (qr_code) DO NOTHING
  RETURNING id INTO v_ticket_order_id;

  IF v_ticket_order_id IS NULL THEN
    SELECT id INTO v_ticket_order_id
    FROM ticket_orders
    WHERE qr_code = p_qr_code;

    RETURN QUERY SELECT v_ticket_order_id, false;
    RETURN;
  END IF;

  SELECT organizer_id, user_id
  INTO v_event_organizer_id, v_event_user_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_organizer_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('organizer', NULL, v_event_organizer_id, NULL);
  ELSIF v_event_user_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('user', v_event_user_id, NULL, NULL);
  ELSE
    RAISE EXCEPTION
      'record_ticket_and_credit: event % has no organizer_id or user_id -- cannot resolve recipient',
      p_event_id;
  END IF;

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    p_total_amount,
    lower(p_currency),
    'ticket_order',
    v_ticket_order_id,
    'Ticket order received'
  );

  RETURN QUERY SELECT v_ticket_order_id, true;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
