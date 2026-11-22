-- migration_216_reservation_booking_schema_rollback.sql
-- Fail-closed rollback for migration 216.
--
-- SAFETY: Raises an exception (and rolls back) if any new table has data,
-- or if any reservation_deposits row records a payment, or if any of the
-- extended reservations columns contain data.
-- Operators must drain/archive data before running this rollback.
-- Uses to_regclass so it does not error if the table was never created.
--
-- Restores migration 204's confirm_reservation_with_capacity and migration 206's
-- approve_reservation_change_with_capacity to their exact pre-216 definitions,
-- including original single-argument advisory-lock strategy.

BEGIN;

-- ── 1. Fail-closed: data-protection checks ───────────────────────────────

DO $$
DECLARE
  v_deposit_payment_count integer := 0;
  v_staff_col_count integer := 0;
  v_resource_col_count integer := 0;
  v_service_col_count integer := 0;
  v_hold_col_count integer := 0;
BEGIN
  -- 1a. Refuse to roll back if reservation_deposits has recorded payments
  IF to_regclass('public.reservation_deposits') IS NOT NULL THEN
    SELECT count(*) INTO v_deposit_payment_count
    FROM public.reservation_deposits
    WHERE status IN ('paid', 'failed', 'refunded', 'late_payment');

    IF v_deposit_payment_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_216_ROLLBACK_BLOCKED: % reservation_deposits row(s) hold recorded payment states. Manual financial audit required.',
        v_deposit_payment_count;
    END IF;

    IF EXISTS (SELECT 1 FROM public.reservation_deposits WHERE status = 'pending' LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_deposits table has pending rows.';
    END IF;
  END IF;

  -- 1b. Refuse to roll back if extended reservations columns contain data
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'staff_id'
  ) THEN
    SELECT count(*) INTO v_staff_col_count
    FROM public.reservations
    WHERE staff_id IS NOT NULL;
    IF v_staff_col_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_216_ROLLBACK_BLOCKED: % reservation(s) have staff_id set. Clear assignments before rollback.',
        v_staff_col_count;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'resource_id'
  ) THEN
    SELECT count(*) INTO v_resource_col_count
    FROM public.reservations
    WHERE resource_id IS NOT NULL;
    IF v_resource_col_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_216_ROLLBACK_BLOCKED: % reservation(s) have resource_id set. Clear assignments before rollback.',
        v_resource_col_count;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'service_id'
  ) THEN
    SELECT count(*) INTO v_service_col_count
    FROM public.reservations
    WHERE service_id IS NOT NULL;
    IF v_service_col_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_216_ROLLBACK_BLOCKED: % reservation(s) have service_id set. Clear assignments before rollback.',
        v_service_col_count;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'hold_expires_at'
  ) THEN
    SELECT count(*) INTO v_hold_col_count
    FROM public.reservations
    WHERE hold_expires_at IS NOT NULL;
    IF v_hold_col_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_216_ROLLBACK_BLOCKED: % reservation(s) have hold_expires_at set. Clear holds before rollback.',
        v_hold_col_count;
    END IF;
  END IF;

  -- 1c. Refuse to roll back if any new table has data
  IF to_regclass('public.reservation_staff') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_staff LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_staff table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_resources') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_resources LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_resources table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_service_catalog') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_service_catalog LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_service_catalog table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_staff_services') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_staff_services LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_staff_services table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_resource_services') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_resource_services LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_resource_services table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_staff_schedules') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_staff_schedules LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_staff_schedules table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_staff_breaks') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_staff_breaks LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_staff_breaks table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_staff_exceptions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_staff_exceptions LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_staff_exceptions table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_resource_schedules') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_resource_schedules LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_resource_schedules table has data.';
    END IF;
  END IF;
  IF to_regclass('public.reservation_resource_exceptions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_resource_exceptions LIMIT 1) THEN
      RAISE EXCEPTION 'Rollback aborted: public.reservation_resource_exceptions table has data.';
    END IF;
  END IF;
END $$;

-- ── 2. Drop new lock function ────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.acquire_booking_scope_locks(uuid, uuid, uuid[], uuid[]);

-- ── 3. Restore migration 204's confirm_reservation_with_capacity ─────────

-- Exact reproduction of migration 204's definition (single-argument advisory lock).
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

-- ── 4. Restore migration 206's approve_reservation_change_with_capacity ──
-- Only if migration 206's table exists; otherwise drop the function since
-- migration 216 created it via CREATE OR REPLACE on a possibly-absent prior.

DO $$
BEGIN
  IF to_regclass('public.reservation_change_requests') IS NOT NULL THEN
    -- Migration 206 is applied: restore its exact function definition.
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
  ELSE
    -- Migration 206 is not applied: migration 216 created this function via
    -- CREATE OR REPLACE on a possibly-absent prior. Drop it to restore pre-216 state.
    DROP FUNCTION IF EXISTS public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text);
  END IF;
END $$;

-- ── 5. Drop indexes ─────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_reservations_staff_window;
DROP INDEX IF EXISTS public.idx_reservations_resource_window;
DROP INDEX IF EXISTS public.idx_reservation_deposits_status;
DROP INDEX IF EXISTS public.idx_reservation_deposits_reservation;
DROP INDEX IF EXISTS public.idx_reservation_resource_exceptions_resource_date;
DROP INDEX IF EXISTS public.idx_reservation_resource_schedules_resource_weekday;
DROP INDEX IF EXISTS public.idx_reservation_staff_exceptions_staff_date;
DROP INDEX IF EXISTS public.idx_reservation_staff_breaks_staff_date;
DROP INDEX IF EXISTS public.idx_reservation_staff_schedules_staff_weekday;
DROP INDEX IF EXISTS public.idx_reservation_resource_services_organizer;
DROP INDEX IF EXISTS public.idx_reservation_resource_services_service;
DROP INDEX IF EXISTS public.idx_reservation_resource_services_resource;
DROP INDEX IF EXISTS public.idx_reservation_staff_services_organizer;
DROP INDEX IF EXISTS public.idx_reservation_staff_services_service;
DROP INDEX IF EXISTS public.idx_reservation_staff_services_staff;
DROP INDEX IF EXISTS public.idx_reservation_service_catalog_active;
DROP INDEX IF EXISTS public.idx_reservation_service_catalog_organizer;
DROP INDEX IF EXISTS public.idx_reservation_resources_active;
DROP INDEX IF EXISTS public.idx_reservation_resources_organizer;
DROP INDEX IF EXISTS public.idx_reservation_staff_active;
DROP INDEX IF EXISTS public.idx_reservation_staff_organizer;

-- ── 6. Restore reservations status CHECK (remove pending_hold) ───────────

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('pending', 'confirmed', 'declined', 'seated', 'completed', 'no_show', 'cancelled'));

-- ── 7. Drop composite FKs and extended columns from reservations ─────────

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_staff_id_fkey,
  DROP CONSTRAINT IF EXISTS reservations_resource_id_fkey,
  DROP CONSTRAINT IF EXISTS reservations_service_id_fkey,
  DROP COLUMN IF EXISTS staff_id,
  DROP COLUMN IF EXISTS resource_id,
  DROP COLUMN IF EXISTS service_id,
  DROP COLUMN IF EXISTS hold_expires_at;

-- ── 7b. Drop reservation_deposits composite FK and reservations unique key ─

-- Drop the composite FK on reservation_deposits. The constraint name is
-- specific to migration 216, so if it exists we created it.
ALTER TABLE public.reservation_deposits
  DROP CONSTRAINT IF EXISTS reservation_deposits_reservation_organizer_fkey;

-- Only drop reservations_id_organizer_key if migration 216 created it
-- (i.e., its definition matches (id, organizer_id) AND it carries the
-- migration_216_created comment marker). Do not remove a pre-existing
-- constraint with the same name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_id_organizer_key'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
       AND tc.table_name = kcu.table_name
      WHERE tc.constraint_schema = 'public'
        AND tc.table_name = 'reservations'
        AND tc.constraint_name = 'reservations_id_organizer_key'
        AND tc.constraint_type = 'UNIQUE'
      GROUP BY tc.constraint_name
      HAVING count(*) = 2
         AND min(kcu.column_name) = 'id'
         AND max(kcu.column_name) = 'organizer_id'
    ) AND EXISTS (
      SELECT 1 FROM pg_description d
      JOIN pg_constraint c ON d.objoid = c.oid
      WHERE c.conname = 'reservations_id_organizer_key'
        AND c.conrelid = 'public.reservations'::regclass
        AND d.description = 'migration_216_created'
    ) THEN
      ALTER TABLE public.reservations
        DROP CONSTRAINT reservations_id_organizer_key;
    END IF;
  END IF;
END $$;

-- ── 8. Drop new tables ──────────────────────────────────────────────────

DROP TABLE IF EXISTS public.reservation_deposits;
DROP TABLE IF EXISTS public.reservation_resource_exceptions;
DROP TABLE IF EXISTS public.reservation_resource_schedules;
DROP TABLE IF EXISTS public.reservation_staff_exceptions;
DROP TABLE IF EXISTS public.reservation_staff_breaks;
DROP TABLE IF EXISTS public.reservation_staff_schedules;
DROP TABLE IF EXISTS public.reservation_resource_services;
DROP TABLE IF EXISTS public.reservation_staff_services;
DROP TABLE IF EXISTS public.reservation_service_catalog;
DROP TABLE IF EXISTS public.reservation_resources;
DROP TABLE IF EXISTS public.reservation_staff;

COMMIT;
