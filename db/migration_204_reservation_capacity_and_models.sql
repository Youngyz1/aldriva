-- migration_204_reservation_capacity_and_models.sql
-- Stage B: Capacity-based reservations (restaurants first), booking models, and duration tracking.
--
-- 1. businesses: booking_model, seat_capacity, default_stay_minutes, max_stay_minutes.
-- 2. Backfill booking_model based on existing verified category/industry values.
-- 3. reservations: duration_minutes, ends_at, deposit_amount, deposit_currency, payment_status.
-- 4. BEFORE INSERT OR UPDATE trigger on reservations to maintain ends_at = starts_at + duration_minutes.
-- 5. Indexes for interval overlap queries and payment status.
-- 6. RPC confirm_reservation_with_capacity with pg_advisory_xact_lock concurrency protection.

BEGIN;

-- ── 1. businesses table extensions ──────────────────────────────────────────

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS booking_model text NOT NULL DEFAULT 'capacity'
    CHECK (booking_model IN ('capacity', 'appointment', 'resource', 'service_window')),
  ADD COLUMN IF NOT EXISTS seat_capacity integer NULL
    CHECK (seat_capacity IS NULL OR (seat_capacity >= 1 AND seat_capacity <= 5000)),
  ADD COLUMN IF NOT EXISTS default_stay_minutes integer NOT NULL DEFAULT 90
    CHECK (default_stay_minutes >= 15 AND default_stay_minutes <= 480),
  ADD COLUMN IF NOT EXISTS max_stay_minutes integer NOT NULL DEFAULT 120
    CHECK (max_stay_minutes >= default_stay_minutes AND max_stay_minutes <= 720);

-- Backfill booking_model by category & industry
UPDATE public.businesses
SET booking_model = CASE
  WHEN category IN ('Salon & Barbershop', 'Spa & Massage', 'Clinic', 'Dental', 'Pharmacy', 'Wellness Center', 'Tutoring')
    OR industry IN ('Beauty & Wellness', 'Health & Medical') THEN 'appointment'
  WHEN category IN ('Vehicle Rental', 'Rental Property', 'Hotel', 'Guest House', 'Resort', 'Venue')
    OR industry IN ('Accommodation & Hospitality') THEN 'resource'
  WHEN category IN ('Catering', 'Cleaning', 'Maintenance & Repair', 'Transport & Logistics') THEN 'service_window'
  ELSE 'capacity'
END
WHERE booking_model = 'capacity';

-- ── 2. reservations table extensions ────────────────────────────────────────

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 90
    CHECK (duration_minutes >= 15 AND duration_minutes <= 720),
  ADD COLUMN IF NOT EXISTS ends_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) NULL
    CHECK (deposit_amount IS NULL OR deposit_amount >= 0),
  ADD COLUMN IF NOT EXISTS deposit_currency text NULL
    CHECK (deposit_currency IS NULL OR char_length(deposit_currency) = 3),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'deposit_pending', 'deposit_paid', 'paid', 'refunded', 'waived'));

-- Backfill ends_at for existing reservations
UPDATE public.reservations
SET ends_at = starts_at + make_interval(mins => duration_minutes)
WHERE ends_at IS NULL;

-- Enforce NOT NULL on ends_at after backfill
ALTER TABLE public.reservations
  ALTER COLUMN ends_at SET NOT NULL;

-- ── 3. ends_at synchronization trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_reservation_ends_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ends_at := NEW.starts_at + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reservation_ends_at ON public.reservations;
CREATE TRIGGER trg_sync_reservation_ends_at
  BEFORE INSERT OR UPDATE OF starts_at, duration_minutes
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reservation_ends_at();

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

-- Filtered index for overlap queries on active reservations
CREATE INDEX IF NOT EXISTS idx_reservations_capacity_active_window
  ON public.reservations(business_id, status, starts_at, ends_at)
  WHERE status IN ('confirmed', 'seated');

CREATE INDEX IF NOT EXISTS idx_reservations_organizer_capacity_window
  ON public.reservations(organizer_id, status, starts_at, ends_at)
  WHERE status IN ('confirmed', 'seated');

CREATE INDEX IF NOT EXISTS idx_reservations_organizer_payment_status
  ON public.reservations(organizer_id, payment_status);

-- ── 5. RPC confirm_reservation_with_capacity ────────────────────────────────

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
  SELECT id, organizer_id, business_id, party_size, starts_at, ends_at, status, status_history
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

  -- 3. Check capacity if business has seat_capacity configured (NULL means advisory/no enforcement)
  IF v_seat_capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(party_size), 0)
    INTO v_current_covers
    FROM public.reservations
    WHERE business_id = v_res.business_id
      AND status IN ('confirmed', 'seated')
      AND starts_at < v_res.ends_at
      AND ends_at > v_res.starts_at
      AND id <> v_res.id;

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

-- Authorization is enforced in the server action (lib/actions/reservations.ts),
-- which verifies tenant RBAC before calling this RPC using the admin/service-role client.
-- Public, anon, and authenticated roles must not call this function directly.
REVOKE ALL ON FUNCTION public.confirm_reservation_with_capacity(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation_with_capacity(uuid, text, uuid, text) TO service_role;

COMMIT;
