-- migration_206_reservation_change_requests.sql
-- Stage D: Guest change requests + cancellation cutoff (code-side setting, no column)
--
-- Adds:
--   public.reservation_change_requests table (UUID PK, one-pending-per-reservation index)
--   public.approve_reservation_change_with_capacity RPC (SECURITY DEFINER, service_role only)
--
-- The cancellation_cutoff_minutes setting lives entirely in
-- tenant_websites.metadata.storefront.reservations — no DDL change required.
--
-- Convention: forward migration only here; rollback twin in _rollback file.

BEGIN;

-- ── Table: reservation_change_requests ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_change_requests (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id            uuid        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  organizer_id              uuid        NOT NULL,
  requested_starts_at       timestamptz NULL,
  requested_party_size      integer     NULL
    CHECK (requested_party_size IS NULL OR (requested_party_size >= 1 AND requested_party_size <= 50)),
  requested_duration_minutes integer    NULL
    CHECK (requested_duration_minutes IS NULL OR (requested_duration_minutes >= 15 AND requested_duration_minutes <= 720)),
  guest_note                text        NULL
    CHECK (guest_note IS NULL OR length(guest_note) <= 300),
  status                    text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn', 'expired')),
  decided_by                uuid        NULL,
  decided_at                timestamptz NULL,
  decision_note             text        NULL
    CHECK (decision_note IS NULL OR length(decision_note) <= 300),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT at_least_one_change CHECK (
    requested_starts_at       IS NOT NULL OR
    requested_party_size      IS NOT NULL OR
    requested_duration_minutes IS NOT NULL
  )
);

-- One pending request per reservation at a time
CREATE UNIQUE INDEX IF NOT EXISTS reservation_change_requests_one_pending
  ON public.reservation_change_requests (reservation_id)
  WHERE (status = 'pending');

-- Organizer dashboard listing index
CREATE INDEX IF NOT EXISTS reservation_change_requests_organizer_status_created
  ON public.reservation_change_requests (organizer_id, status, created_at DESC);

-- RLS on, no policies: all access via service-role admin client (same pattern as reservations)
ALTER TABLE public.reservation_change_requests ENABLE ROW LEVEL SECURITY;

-- ── RPC: approve_reservation_change_with_capacity ────────────────────────────

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

  -- Step 7: Capacity check only for confirmed (or seated) reservations.
  -- Pending reservations do not hold seats; the later confirm RPC will check capacity.
  -- Skip when business_id is NULL (no business context → no capacity enforcement).
  IF v_reservation.status IN ('confirmed', 'seated')
     AND v_business_id IS NOT NULL
     AND v_seat_capacity IS NOT NULL
  THEN
    -- Sum overlapping confirmed/seated parties for this business, excluding this reservation.
    SELECT COALESCE(SUM(r.party_size), 0) INTO v_overlapping_covers
    FROM public.reservations r
    WHERE r.business_id = v_business_id
      AND r.status IN ('confirmed', 'seated')
      AND r.id <> v_reservation.id
      AND r.starts_at < v_new_ends_at
      AND r.ends_at   > v_new_starts_at;

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

-- Lock down: only service_role may execute this function
REVOKE ALL ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text)
  TO service_role;

COMMIT;
