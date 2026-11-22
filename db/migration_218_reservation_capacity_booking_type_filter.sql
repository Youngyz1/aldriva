-- migration_218_reservation_capacity_booking_type_filter.sql
-- Stage: Fix table capacity so appointment rows never consume table seats.
--
-- Problem: confirm_reservation_with_capacity (migration 204) and
-- approve_reservation_change_with_capacity (migration 206) sum covers inline
-- without filtering booking_type. Appointment rows are therefore capacity-checked
-- and consume table seats they should not occupy.
--
-- Fix:
--   confirm_reservation_with_capacity: add booking_type to the initial SELECT;
--     skip the capacity check entirely when v_res.booking_type <> 'table';
--     the covers SUM adds AND booking_type = 'table'.
--   approve_reservation_change_with_capacity: the overlapping covers SUM adds
--     AND r.booking_type = 'table'; skip the capacity check when
--     v_reservation.booking_type <> 'table'.
--
-- MUST be applied AFTER or merged into any revision of migration 216, since
-- migration 216 redefines both functions and would otherwise undo this fix.
--
-- Convention: forward migration here; rollback twin in _rollback file.
-- Restores the pre-218 function definitions from migrations 204 and 206.

BEGIN;

-- ── 1. confirm_reservation_with_capacity (from migration 204) ───────────────

CREATE OR REPLACE FUNCTION public.confirm_reservation_with_capacity(
  p_reservation_id uuid,
  p_expected_status text,
  p_actor uuid,
  p_owner_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res record;
  v_seat_capacity integer;
  v_current_covers integer := 0;
  v_new_history jsonb;
  v_now timestamptz := clock_timestamp();
  v_event jsonb;
BEGIN
  -- 1. Fetch the target reservation
  SELECT id, organizer_id, business_id, party_size, starts_at, ends_at, status, status_history, booking_type
  INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Reservation not found.');
  END IF;

  IF v_res.status <> p_expected_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_UPDATED',
      'message', 'This reservation was already updated by another team member.',
      'current_status', v_res.status
    );
  END IF;

  -- 2. Concurrency control: take an advisory transaction lock on the business
  -- (or organizer fallback if business_id is NULL)
  IF v_res.business_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_res.business_id::text));
    SELECT seat_capacity INTO v_seat_capacity
    FROM public.businesses
    WHERE id = v_res.business_id;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext(v_res.organizer_id::text));
    v_seat_capacity := NULL;
  END IF;

  -- 3. Check capacity if business has seat_capacity configured and this is a
  -- table booking. Appointment rows never consume table seats.
  IF v_seat_capacity IS NOT NULL AND v_res.booking_type = 'table' THEN
    SELECT COALESCE(SUM(party_size), 0)
    INTO v_current_covers
    FROM public.reservations
    WHERE business_id = v_res.business_id
      AND status IN ('confirmed', 'seated')
      AND starts_at < v_res.ends_at
      AND ends_at > v_res.starts_at
      AND id <> v_res.id
      AND booking_type = 'table';

    IF (v_current_covers + v_res.party_size) > v_seat_capacity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAPACITY_EXCEEDED',
        'message', format('Capacity exceeded: confirming %s guests would bring active covers to %s (max %s).',
                          v_res.party_size, v_current_covers + v_res.party_size, v_seat_capacity),
        'seat_capacity', v_seat_capacity,
        'current_covers', v_current_covers,
        'requested_party_size', v_res.party_size
      );
    END IF;
  END IF;

  -- 4. Build status history event
  v_event := jsonb_build_object(
    'status', 'confirmed',
    'at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'by_user_id', p_actor,
    'reason', NULL,
    'note', p_owner_note
  );

  v_new_history := CASE
    WHEN jsonb_typeof(v_res.status_history) = 'array' THEN v_res.status_history || v_event
    ELSE jsonb_build_array(v_event)
  END;

  -- 5. Update reservation to confirmed
  UPDATE public.reservations
  SET status = 'confirmed',
      owner_note = COALESCE(p_owner_note, owner_note),
      status_history = v_new_history,
      updated_at = v_now
  WHERE id = v_res.id
    AND status = p_expected_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_UPDATED',
      'message', 'This reservation was already updated by another team member.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'active_covers', v_current_covers + v_res.party_size,
    'seat_capacity', v_seat_capacity
  );
END;
$$;

-- ── 2. approve_reservation_change_with_capacity (from migration 206) ────────

-- Drop the old 3-argument signature if it exists (from a previous draft of migration 206).
DROP FUNCTION IF EXISTS public.approve_reservation_change_with_capacity(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.approve_reservation_change_with_capacity(
  p_request_id    uuid,
  p_organizer_id  uuid,
  p_actor         uuid,
  p_decision_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id           uuid;
  v_organizer_id          uuid;
  v_request               record;
  v_reservation           record;
  v_seat_capacity         integer;
  v_new_starts_at         timestamptz;
  v_new_party_size        integer;
  v_new_duration          integer;
  v_new_ends_at           timestamptz;
  v_overlapping_covers    integer;
  v_now                   timestamptz;
  v_event                 jsonb;
  v_new_history           jsonb;
BEGIN
  -- Step 1: Read only the IDs needed for the lock, without deciding anything.
  SELECT r.business_id, r.organizer_id
  INTO   v_business_id, v_organizer_id
  FROM   public.reservation_change_requests c
  JOIN   public.reservations r ON r.id = c.reservation_id
  WHERE  c.id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Step 2: Take advisory transaction lock BEFORE loading or checking anything else.
  -- Same lock strategy as confirm_reservation_with_capacity (migration 204):
  -- lock on business_id when present, fall back to organizer_id and skip capacity check.
  IF v_business_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_business_id::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext(v_organizer_id::text));
  END IF;

  -- Step 3: After the lock, re-load the request with full checks.
  SELECT * INTO v_request
  FROM public.reservation_change_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Organizer guard: the request must belong to the calling organizer.
  IF v_request.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_PENDING');
  END IF;

  -- Step 4: Load the reservation.
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = v_request.reservation_id;

  IF NOT FOUND OR v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'RESERVATION_NOT_CHANGEABLE');
  END IF;

  -- Step 5: Load seat_capacity from businesses WHERE id = reservation.business_id.
  IF v_business_id IS NOT NULL THEN
    SELECT seat_capacity INTO v_seat_capacity
    FROM public.businesses
    WHERE id = v_business_id;
  ELSE
    v_seat_capacity := NULL;
  END IF;

  -- Step 6: Resolve new values, falling back to current reservation values for NULLs.
  v_new_starts_at  := COALESCE(v_request.requested_starts_at,       v_reservation.starts_at);
  v_new_party_size := COALESCE(v_request.requested_party_size,      v_reservation.party_size);
  v_new_duration   := COALESCE(v_request.requested_duration_minutes, v_reservation.duration_minutes);
  v_new_ends_at    := v_new_starts_at + make_interval(mins => v_new_duration);

  -- Step 7: Capacity check only for confirmed (or seated) table reservations.
  -- Pending reservations do not hold seats; the later confirm RPC will check capacity.
  -- Skip when business_id is NULL (no business context → no capacity enforcement).
  -- Skip when the reservation is not a table booking (appointments never consume table seats).
  IF v_reservation.status IN ('confirmed', 'seated')
     AND v_reservation.booking_type = 'table'
     AND v_business_id IS NOT NULL
     AND v_seat_capacity IS NOT NULL
  THEN
    -- Sum overlapping confirmed/seated table parties for this business, excluding this reservation.
    SELECT COALESCE(SUM(r.party_size), 0) INTO v_overlapping_covers
    FROM public.reservations r
    WHERE r.business_id = v_business_id
      AND r.status IN ('confirmed', 'seated')
      AND r.id <> v_reservation.id
      AND r.starts_at < v_new_ends_at
      AND r.ends_at   > v_new_starts_at
      AND r.booking_type = 'table';

    IF v_overlapping_covers + v_new_party_size > v_seat_capacity THEN
      RETURN jsonb_build_object(
        'success',              false,
        'error',                'CAPACITY_EXCEEDED',
        'current_covers',       v_overlapping_covers,
        'seat_capacity',        v_seat_capacity,
        'requested_party_size', v_new_party_size
      );
    END IF;
  END IF;

  -- Step 8: Build the status history event (same format as migration 204).
  v_now   := clock_timestamp();
  v_event := jsonb_build_object(
    'at',         to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'by_user_id', p_actor,
    'note',       'Change approved',
    'status',     v_reservation.status
  );
  v_new_history := CASE
    WHEN jsonb_typeof(v_reservation.status_history) = 'array'
      THEN v_reservation.status_history || v_event
    ELSE jsonb_build_array(v_event)
  END;

  -- Step 9: Update the reservation (guarded implicitly — we hold the lock).
  UPDATE public.reservations
  SET
    starts_at        = v_new_starts_at,
    party_size       = v_new_party_size,
    duration_minutes = v_new_duration,
    -- ends_at is synced by the existing trigger on reservations
    status_history   = v_new_history,
    updated_at       = v_now
  WHERE id = v_reservation.id;

  -- Step 10: Mark the request approved, guarded by status = 'pending'.
  UPDATE public.reservation_change_requests
  SET
    status        = 'approved',
    decided_by    = p_actor,
    decided_at    = v_now,
    decision_note = p_decision_note,
    updated_at    = v_now
  WHERE id = p_request_id
    AND status = 'pending';

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Authorization is enforced in the server action (lib/actions/reservations.ts),
-- which verifies tenant RBAC before calling this RPC using the admin/service-role client.
-- Public, anon, and authenticated roles must not call these functions directly.
REVOKE ALL ON FUNCTION public.confirm_reservation_with_capacity(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation_with_capacity(uuid, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
