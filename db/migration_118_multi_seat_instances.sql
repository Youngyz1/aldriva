-- migration_118_multi_seat_instances.sql
-- Extends record_ticket_and_credit RPC to support multi-seat, multi-tier orders with per-seat ticket_instances:
-- 1. Drops old 13-parameter function signature to prevent Postgres RPC resolution ambiguity.
-- 2. Creates new 14-parameter record_ticket_and_credit RPC with p_seats_json JSONB DEFAULT NULL.
-- 3. Inserts 1 summary ticket_orders row per checkout transaction.
-- 4. When p_seats_json is provided: loops over seats and inserts 1 ticket_instances row per seat with its specific ticket_id, seat_id, and seat_label.
-- 5. Updates all purchased seats to status = 'sold', reserved_until = NULL.
-- 6. When p_seats_json is null: retains existing p_items_json and single-tier fallback behavior.
-- 7. Inserts 1 single recipient_ledger_entries credit entry for the total amount.

BEGIN;

-- Drop old 13-parameter overload
DROP FUNCTION IF EXISTS record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB
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
  p_items_json JSONB DEFAULT NULL,
  p_seats_json JSONB DEFAULT NULL
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
  v_seat JSONB;
  v_seat_ticket_id UUID;
  v_seat_id UUID;
  v_seat_label TEXT;
  v_first_seat JSONB;
  v_primary_ticket_id UUID;
  v_primary_seat_id UUID;
  v_primary_seat_label TEXT;
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

  -- Idempotency check: if stripe_session_id already exists
  IF p_stripe_session_id IS NOT NULL THEN
    SELECT id INTO v_ticket_order_id
    FROM ticket_orders
    WHERE stripe_session_id = p_stripe_session_id;

    IF v_ticket_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_ticket_order_id, false;
      RETURN;
    END IF;
  END IF;

  -- Calculate total quantity
  IF p_seats_json IS NOT NULL AND jsonb_array_length(p_seats_json) > 0 THEN
    v_total_qty := jsonb_array_length(p_seats_json);
  ELSIF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
      v_total_qty := v_total_qty + COALESCE((v_item->>'quantity')::INTEGER, 1);
    END LOOP;
  ELSE
    v_total_qty := GREATEST(1, COALESCE(p_quantity, 1));
  END IF;

  -- Derive primary ticket_id, seat_id, seat_label
  IF p_seats_json IS NOT NULL AND jsonb_array_length(p_seats_json) > 0 THEN
    v_first_seat := p_seats_json->0;
    v_primary_ticket_id := COALESCE(
      p_ticket_id,
      NULLIF(v_first_seat->>'ticket_id', '')::UUID,
      NULLIF(v_first_seat->>'t', '')::UUID
    );
    v_primary_seat_id := COALESCE(
      p_seat_id,
      NULLIF(v_first_seat->>'seat_id', '')::UUID,
      NULLIF(v_first_seat->>'id', '')::UUID,
      NULLIF(v_first_seat->>'s', '')::UUID
    );
    v_primary_seat_label := COALESCE(
      p_seat_label,
      v_first_seat->>'seat_label',
      v_first_seat->>'label',
      v_first_seat->>'l'
    );
  ELSE
    v_primary_ticket_id := p_ticket_id;
    v_primary_seat_id := p_seat_id;
    v_primary_seat_label := p_seat_label;
  END IF;

  -- Insert 1 summary ticket_orders row
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
    v_primary_ticket_id,
    v_primary_seat_id,
    v_primary_seat_label,
    p_buyer_email,
    p_buyer_name,
    v_total_qty,
    p_total_amount,
    p_currency,
    p_qr_code,
    'valid',
    p_stripe_payment_intent_id,
    p_stripe_session_id
  )
  RETURNING id INTO v_ticket_order_id;

  -- Insert ticket_instances:
  -- Path A: Multi-seat order (p_seats_json provided)
  IF p_seats_json IS NOT NULL AND jsonb_array_length(p_seats_json) > 0 THEN
    FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats_json) LOOP
      v_seat_ticket_id := COALESCE(
        NULLIF(v_seat->>'ticket_id', '')::UUID,
        NULLIF(v_seat->>'t', '')::UUID,
        p_ticket_id
      );
      v_seat_id := COALESCE(
        NULLIF(v_seat->>'seat_id', '')::UUID,
        NULLIF(v_seat->>'id', '')::UUID,
        NULLIF(v_seat->>'s', '')::UUID
      );
      v_seat_label := COALESCE(
        v_seat->>'seat_label',
        v_seat->>'label',
        v_seat->>'l'
      );

      -- Safety guard: Stale-hold double-sell race condition check.
      -- If another order already holds an active (non-cancelled, non-refunded) instance
      -- for this seat, abort immediately so the webhook reconciliation alert is triggered.
      IF v_seat_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1
          FROM ticket_instances
          WHERE seat_id = v_seat_id
            AND event_id = p_event_id
            AND order_id <> v_ticket_order_id
            AND status NOT IN ('cancelled', 'refunded')
        ) THEN
          RAISE EXCEPTION 'SEAT_ALREADY_ASSIGNED: seat % already sold to a different order', v_seat_id;
        END IF;
      END IF;

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
        v_seat_ticket_id,
        v_seat_id,
        v_seat_label,
        UPPER(REPLACE(GEN_RANDOM_UUID()::text, '-', '')),
        'valid'
      );
    END LOOP;

    -- Update seats to sold
    UPDATE seats
    SET status = 'sold', reserved_until = NULL
    WHERE id IN (
      SELECT COALESCE(
        NULLIF(s->>'seat_id', '')::UUID,
        NULLIF(s->>'id', '')::UUID,
        NULLIF(s->>'s', '')::UUID
      )
      FROM jsonb_array_elements(p_seats_json) s
      WHERE COALESCE(
        NULLIF(s->>'seat_id', '')::UUID,
        NULLIF(s->>'id', '')::UUID,
        NULLIF(s->>'s', '')::UUID
      ) IS NOT NULL
    );

  -- Path B: Non-seat multi-tier order (p_items_json provided)
  ELSIF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
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

    IF p_seat_id IS NOT NULL THEN
      UPDATE seats
      SET status = 'sold', reserved_until = NULL
      WHERE id = p_seat_id;
    END IF;

  -- Path C: Legacy single-tier order
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

    IF p_seat_id IS NOT NULL THEN
      UPDATE seats
      SET status = 'sold', reserved_until = NULL
      WHERE id = p_seat_id;
    END IF;
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
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
