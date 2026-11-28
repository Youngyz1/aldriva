BEGIN;

DROP FUNCTION IF EXISTS public.transition_rental_booking(uuid, uuid, uuid, text, text);

CREATE FUNCTION public.transition_rental_booking(
  p_booking_id uuid,
  p_organizer_id uuid,
  p_actor_id uuid,
  p_cause text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(out_booking_id uuid, out_status text, out_net_paid numeric, out_open_session_ids text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_booking    public.rental_bookings;
  v_to_status  text;
  v_reason     text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_net_paid   numeric;
  v_sessions   text[] := '{}';
BEGIN
  IF p_cause NOT IN ('cancel', 'decline', 'no_show', 'return') THEN
    RAISE EXCEPTION 'INVALID_CAUSE: %', p_cause USING ERRCODE = 'RB040';
  END IF;

  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_booking.category_id::text));
  IF v_booking.vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_booking.vehicle_id::text));
  END IF;

  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id
     FOR UPDATE;

  IF p_cause = 'cancel' THEN
    v_to_status := 'cancelled';
    IF v_booking.status NOT IN ('pending', 'awaiting_payment', 'confirmed', 'active') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: cannot cancel a booking that is %', v_booking.status USING ERRCODE = 'RB040';
    END IF;
  ELSIF p_cause = 'decline' THEN
    v_to_status := 'cancelled';
    IF v_booking.status <> 'pending' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: only pending requests can be declined (current status: %)', v_booking.status USING ERRCODE = 'RB040';
    END IF;
  ELSIF p_cause = 'no_show' THEN
    v_to_status := 'no_show';
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: only confirmed bookings can be marked no-show (current status: %)', v_booking.status USING ERRCODE = 'RB040';
    END IF;
    IF now() < v_booking.starts_at THEN
      RAISE EXCEPTION 'TOO_EARLY_FOR_NO_SHOW: pickup time is %', v_booking.starts_at USING ERRCODE = 'RB042';
    END IF;
  ELSE
    v_to_status := 'completed';
    IF v_booking.status <> 'active' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: only active rentals can be completed (current status: %)', v_booking.status USING ERRCODE = 'RB040';
    END IF;
  END IF;

  IF p_cause IN ('cancel', 'decline') THEN
    IF v_reason IS NULL OR length(v_reason) < 3 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: a reason of at least 3 characters is required' USING ERRCODE = 'RB041';
    END IF;
    IF v_booking.status = 'active' AND length(v_reason) < 5 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: cancelling an active rental needs a reason of at least 5 characters' USING ERRCODE = 'RB041';
    END IF;
  END IF;

  -- Same net-paid formula as record_rental_payment
  SELECT
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.direction = 'credit' AND rp.applied
                                      AND rp.kind IN ('rental_charge', 'advance', 'balance')), 0)
    - COALESCE(SUM(rp.amount) FILTER (WHERE rp.direction = 'debit' AND rp.applied
                                      AND rp.kind = 'refund'), 0)
    INTO v_net_paid
    FROM public.rental_payments rp
   WHERE rp.booking_id = p_booking_id;

  -- Close open checkout sessions (the app expires them at Stripe afterwards)
  IF p_cause <> 'return' THEN
    WITH closed AS (
      UPDATE public.rental_checkout_sessions cs
         SET status = 'expired'
       WHERE cs.booking_id = p_booking_id AND cs.status = 'open'
      RETURNING cs.stripe_session_id
    )
    SELECT COALESCE(array_agg(c.stripe_session_id), '{}') INTO v_sessions FROM closed c;
  END IF;

  UPDATE public.rental_bookings
     SET status = v_to_status,
         expires_at = NULL,
         payment_due_at = CASE WHEN p_cause = 'return' THEN payment_due_at ELSE NULL END,
         returned_at = CASE WHEN p_cause = 'return' THEN now() ELSE returned_at END,
         is_overdue = false,
         updated_at = now()
   WHERE id = p_booking_id;

  INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
  VALUES (
    p_booking_id, p_organizer_id, 'status_change', p_actor_id,
    jsonb_build_object(
      'from_status', v_booking.status,
      'to_status', v_to_status,
      'cause', p_cause,
      'reason', v_reason,
      'net_paid', v_net_paid,
      'was_active', (v_booking.status = 'active'),
      'closed_sessions', to_jsonb(v_sessions)
    )
  );

  RETURN QUERY SELECT p_booking_id, v_to_status, v_net_paid, v_sessions;
END;
$function$;

REVOKE ALL ON FUNCTION public.transition_rental_booking(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_rental_booking(uuid, uuid, uuid, text, text) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
