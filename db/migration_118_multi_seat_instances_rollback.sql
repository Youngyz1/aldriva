-- migration_118_multi_seat_instances_rollback.sql
-- Restores 13-parameter record_ticket_and_credit RPC from migration 80c and drops the 14-parameter variant.

BEGIN;

DROP FUNCTION IF EXISTS record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
);

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
  p_qr_code TEXT DEFAULT NULL,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL,
  p_items_json JSONB DEFAULT NULL
) RETURNS TABLE (
  ticket_order_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_ticket_order_id UUID;
  v_event_organizer_id UUID;
  v_event_user_id UUID;
  v_recipient_id UUID;
  v_total_qty INTEGER := 0;
  v_item JSONB;
  v_item_ticket_id UUID;
  v_item_qty INTEGER;
  i INTEGER;
BEGIN
  -- Idempotency check: if payment_intent_id already exists, return existing order_id and false
  IF p_stripe_payment_intent_id IS NOT NULL THEN
    SELECT id INTO v_ticket_order_id
    FROM ticket_orders
    WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;

    IF v_ticket_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_ticket_order_id, false;
      RETURN;
    END IF;
  END IF;

  -- Calculate total quantity
  IF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
      v_total_qty := v_total_qty + COALESCE((v_item->>'quantity')::INTEGER, 1);
    END LOOP;
  ELSE
    v_total_qty := GREATEST(1, COALESCE(p_quantity, 1));
  END IF;

  -- Insert 1 summary ticket_orders row (qr_code = NULL for post-cutover orders)
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
    v_total_qty,
    p_total_amount,
    p_currency,
    NULL,
    'valid',
    p_stripe_payment_intent_id,
    p_stripe_session_id
  )
  RETURNING id INTO v_ticket_order_id;

  -- Insert N ticket_instances with tier ticket_id and fresh unique QR codes
  IF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
      v_item_ticket_id := (v_item->>'ticket_id')::UUID;
      v_item_qty := COALESCE((v_item->>'quantity')::INTEGER, 1);

      FOR i IN 1..v_item_qty LOOP
        INSERT INTO ticket_instances (
          order_id,
          event_id,
          ticket_id,
          seat_id,
          seat_label,
          qr_code,
          status
        ) VALUES (
          v_ticket_order_id,
          p_event_id,
          v_item_ticket_id,
          p_seat_id,
          p_seat_label,
          UPPER(REPLACE(GEN_RANDOM_UUID()::text, '-', '')),
          'valid'
        );
      END LOOP;
    END LOOP;
  ELSE
    FOR i IN 1..v_total_qty LOOP
      INSERT INTO ticket_instances (
        order_id,
        event_id,
        ticket_id,
        seat_id,
        seat_label,
        qr_code,
        status
      ) VALUES (
        v_ticket_order_id,
        p_event_id,
        p_ticket_id,
        p_seat_id,
        p_seat_label,
        UPPER(REPLACE(GEN_RANDOM_UUID()::text, '-', '')),
        'valid'
      );
    END LOOP;
  END IF;

  -- Recipient resolution & single ledger credit
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
$func$;

REVOKE EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
