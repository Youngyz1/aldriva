-- migration_216_reservation_booking_schema.sql
-- Stage: Shared reservation booking schema for Reserve, Service, General Booking templates.
--
-- Adds:
--   public.reservation_staff, reservation_resources, reservation_service_catalog
--   public.reservation_staff_services, reservation_resource_services
--   public.reservation_staff_schedules, reservation_staff_breaks, reservation_staff_exceptions
--   public.reservation_resource_schedules, reservation_resource_exceptions
--   public.reservation_deposits
-- Extends public.reservations with staff_id, resource_id, service_id, hold_expires_at
-- Extends public.reservations.status CHECK with 'pending_hold'
-- Reconciles advisory-lock strategy between migration 204/206 RPCs and new two-argument locks
--
-- Convention: forward migration here; rollback twin in _rollback file.

BEGIN;

-- ── 1. Verify migration 204 prerequisites ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'seat_capacity'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: businesses.seat_capacity is required. Apply migration 204 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'booking_model'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: businesses.booking_model is required. Apply migration 204 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'duration_minutes'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: reservations.duration_minutes is required. Apply migration 204 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'ends_at'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: reservations.ends_at is required. Apply migration 204 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'deposit_amount'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: reservations.deposit_amount is required. Apply migration 204 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'deposit_currency'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: reservations.deposit_currency is required. Apply migration 204 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'payment_status'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_216_PREREQ_MISSING: reservations.payment_status is required. Apply migration 204 first.';
  END IF;
END $$;

-- ── 2. reservation_staff ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_staff (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    uuid        NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  email           text        NULL,
  phone           text        NULL,
  role            text        NOT NULL DEFAULT 'staff',
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_staff_id_organizer_key UNIQUE (id, organizer_id)
);

-- ── 3. reservation_resources ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_resources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    uuid        NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  type            text        NOT NULL CHECK (type IN ('table', 'room', 'chair', 'equipment', 'facility')),
  capacity        integer     NOT NULL CHECK (capacity >= 1),
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_resources_id_organizer_key UNIQUE (id, organizer_id)
);

-- ── 4. reservation_service_catalog ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_service_catalog (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id     uuid        NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  name             text        NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description      text        NULL,
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 15 AND 720),
  buffer_minutes   integer     NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  price            numeric(12,2) NULL CHECK (price IS NULL OR price >= 0),
  currency         text        NULL CHECK (currency IS NULL OR char_length(currency) = 3),
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_service_catalog_id_organizer_key UNIQUE (id, organizer_id)
);

-- ── 5. assignment tables with composite FKs for tenant integrity ─────────

CREATE TABLE IF NOT EXISTS public.reservation_staff_services (
  staff_id   uuid NOT NULL,
  service_id uuid NOT NULL,
  organizer_id uuid NOT NULL,
  PRIMARY KEY (staff_id, service_id),
  FOREIGN KEY (staff_id, organizer_id)
    REFERENCES public.reservation_staff(id, organizer_id),
  FOREIGN KEY (service_id, organizer_id)
    REFERENCES public.reservation_service_catalog(id, organizer_id)
);

CREATE TABLE IF NOT EXISTS public.reservation_resource_services (
  resource_id uuid NOT NULL,
  service_id  uuid NOT NULL,
  organizer_id uuid NOT NULL,
  PRIMARY KEY (resource_id, service_id),
  FOREIGN KEY (resource_id, organizer_id)
    REFERENCES public.reservation_resources(id, organizer_id),
  FOREIGN KEY (service_id, organizer_id)
    REFERENCES public.reservation_service_catalog(id, organizer_id)
);

-- ── 6. staff schedules, breaks, exceptions ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_staff_schedules (
  staff_id   uuid      NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  weekday    int       NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open       time      NOT NULL,
  close      time      NOT NULL CHECK (close > open),
  closed     boolean   NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, weekday)
);

CREATE TABLE IF NOT EXISTS public.reservation_staff_breaks (
  id            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid      NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  break_date    date      NOT NULL,
  start_time    time      NOT NULL,
  end_time      time      NOT NULL CHECK (end_time > start_time),
  reason        text      NULL CHECK (reason IS NULL OR length(reason) <= 200)
);

CREATE TABLE IF NOT EXISTS public.reservation_staff_exceptions (
  id             uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid      NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  exception_date date      NOT NULL,
  closed         boolean   NOT NULL DEFAULT false,
  open           time      NULL,
  close          time      NULL,
  reason         text      NULL CHECK (reason IS NULL OR length(reason) <= 200)
);

-- ── 7. resource schedules and exceptions ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_resource_schedules (
  resource_id uuid      NOT NULL REFERENCES public.reservation_resources(id) ON DELETE CASCADE,
  weekday     int       NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open        time      NOT NULL,
  close       time      NOT NULL CHECK (close > open),
  closed      boolean   NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, weekday)
);

CREATE TABLE IF NOT EXISTS public.reservation_resource_exceptions (
  id             uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id    uuid      NOT NULL REFERENCES public.reservation_resources(id) ON DELETE CASCADE,
  exception_date date      NOT NULL,
  closed         boolean   NOT NULL DEFAULT false,
  open           time      NULL,
  close          time      NULL,
  reason         text      NULL CHECK (reason IS NULL OR length(reason) <= 200)
);

-- ── 8. reservation_deposits ──────────────────────────────────────────────

-- Ensure reservations(id, organizer_id) is unique so it can be referenced
-- by a composite foreign key from reservation_deposits.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_id_organizer_key'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    -- Constraint with this name exists; verify it matches our definition exactly.
    IF NOT EXISTS (
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
    ) THEN
      RAISE EXCEPTION
        'MIGRATION_216_CONSTRAINT_CONFLICT: reservations_id_organizer_key exists on public.reservations with an unexpected definition. Manual review required before applying migration 216.';
    END IF;
    -- Constraint already exists with matching definition; do not mark it as
    -- migration-created. Rollback will preserve it.
  ELSE
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_id_organizer_key UNIQUE (id, organizer_id);
    -- Record that migration 216 created this constraint so rollback can
    -- distinguish it from a pre-existing constraint with the same name.
    COMMENT ON CONSTRAINT reservations_id_organizer_key ON public.reservations
      IS 'migration_216_created';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.reservation_deposits (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id    uuid        NOT NULL,
  organizer_id      uuid        NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  provider          text        NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  provider_reference text       NOT NULL UNIQUE,
  stripe_event_id   text        NULL UNIQUE,
  amount            numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency          text        NOT NULL CHECK (char_length(currency) = 3),
  status            text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'expired', 'late_payment')),
  failure_reason    text        NULL CHECK (failure_reason IS NULL OR length(failure_reason) <= 500),
  paid_at           timestamptz NULL,
  refunded_at       timestamptz NULL,
  payment_deadline  timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_deposits_reservation_organizer_fkey
    FOREIGN KEY (reservation_id, organizer_id)
    REFERENCES public.reservations(id, organizer_id) ON DELETE CASCADE
);

-- ── 9. Extend public.reservations ────────────────────────────────────────

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS staff_id uuid NULL,
  ADD COLUMN IF NOT EXISTS resource_id uuid NULL,
  ADD COLUMN IF NOT EXISTS service_id uuid NULL,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz NULL;

-- Composite FKs for tenant-safe assignments
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_staff_id_fkey,
  ADD CONSTRAINT reservations_staff_id_fkey
    FOREIGN KEY (staff_id, organizer_id)
    REFERENCES public.reservation_staff(id, organizer_id);

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_resource_id_fkey,
  ADD CONSTRAINT reservations_resource_id_fkey
    FOREIGN KEY (resource_id, organizer_id)
    REFERENCES public.reservation_resources(id, organizer_id);

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_service_id_fkey,
  ADD CONSTRAINT reservations_service_id_fkey
    FOREIGN KEY (service_id, organizer_id)
    REFERENCES public.reservation_service_catalog(id, organizer_id);

-- Extend status CHECK to include pending_hold
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('pending', 'confirmed', 'declined', 'seated', 'completed', 'no_show', 'cancelled', 'pending_hold'));

-- ── 10. Indexes (no now() in predicates) ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reservation_staff_organizer
  ON public.reservation_staff(organizer_id);

CREATE INDEX IF NOT EXISTS idx_reservation_staff_active
  ON public.reservation_staff(organizer_id, active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_reservation_resources_organizer
  ON public.reservation_resources(organizer_id);

CREATE INDEX IF NOT EXISTS idx_reservation_resources_active
  ON public.reservation_resources(organizer_id, active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_reservation_service_catalog_organizer
  ON public.reservation_service_catalog(organizer_id);

CREATE INDEX IF NOT EXISTS idx_reservation_service_catalog_active
  ON public.reservation_service_catalog(organizer_id, active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_reservation_staff_services_staff
  ON public.reservation_staff_services(staff_id);

CREATE INDEX IF NOT EXISTS idx_reservation_staff_services_service
  ON public.reservation_staff_services(service_id);

CREATE INDEX IF NOT EXISTS idx_reservation_staff_services_organizer
  ON public.reservation_staff_services(organizer_id);

CREATE INDEX IF NOT EXISTS idx_reservation_resource_services_resource
  ON public.reservation_resource_services(resource_id);

CREATE INDEX IF NOT EXISTS idx_reservation_resource_services_service
  ON public.reservation_resource_services(service_id);

CREATE INDEX IF NOT EXISTS idx_reservation_resource_services_organizer
  ON public.reservation_resource_services(organizer_id);

CREATE INDEX IF NOT EXISTS idx_reservation_staff_schedules_staff_weekday
  ON public.reservation_staff_schedules(staff_id, weekday);

CREATE INDEX IF NOT EXISTS idx_reservation_staff_breaks_staff_date
  ON public.reservation_staff_breaks(staff_id, break_date);

CREATE INDEX IF NOT EXISTS idx_reservation_staff_exceptions_staff_date
  ON public.reservation_staff_exceptions(staff_id, exception_date);

CREATE INDEX IF NOT EXISTS idx_reservation_resource_schedules_resource_weekday
  ON public.reservation_resource_schedules(resource_id, weekday);

CREATE INDEX IF NOT EXISTS idx_reservation_resource_exceptions_resource_date
  ON public.reservation_resource_exceptions(resource_id, exception_date);

CREATE INDEX IF NOT EXISTS idx_reservation_deposits_reservation
  ON public.reservation_deposits(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservation_deposits_status
  ON public.reservation_deposits(organizer_id, status, created_at DESC);

-- Reservations indexes: include pending_hold, no now() predicates
CREATE INDEX IF NOT EXISTS idx_reservations_staff_window
  ON public.reservations(staff_id, status, starts_at, ends_at)
  WHERE staff_id IS NOT NULL AND status IN ('confirmed', 'seated', 'pending_hold');

CREATE INDEX IF NOT EXISTS idx_reservations_resource_window
  ON public.reservations(resource_id, status, starts_at, ends_at)
  WHERE resource_id IS NOT NULL AND status IN ('confirmed', 'seated', 'pending_hold');

-- ── 11. Advisory lock reconciliation ─────────────────────────────────────

-- New shared lock function using two-argument advisory locks, deterministic order.
-- Migration 204 fallback: when business_id is NULL, lock on organizer_id instead
-- so legacy reservations without a business still serialize on the same scope.
CREATE OR REPLACE FUNCTION public.acquire_booking_scope_locks(
  p_business_id  uuid,
  p_organizer_id uuid,
  p_staff_ids    uuid[] DEFAULT NULL,
  p_resource_ids uuid[] DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_scope_id uuid;
  v_lock_keys text[];
  v_scope_id text;
  v_scope_type int;
BEGIN
  -- Preserve migration 204 organizer fallback when business_id is NULL.
  -- Both IDs cannot be NULL: at least one scope anchor is required.
  IF p_business_id IS NULL AND p_organizer_id IS NULL THEN
    RAISE EXCEPTION 'business_id and organizer_id cannot both be NULL for booking scope locks';
  END IF;

  v_lock_scope_id := COALESCE(p_business_id, p_organizer_id);
  v_lock_keys := ARRAY['0:' || v_lock_scope_id::text];

  IF p_staff_ids IS NOT NULL THEN
    FOREACH v_scope_id IN ARRAY p_staff_ids LOOP
      v_lock_keys := v_lock_keys || ARRAY['1:' || v_scope_id];
    END LOOP;
  END IF;

  IF p_resource_ids IS NOT NULL THEN
    FOREACH v_scope_id IN ARRAY p_resource_ids LOOP
      v_lock_keys := v_lock_keys || ARRAY['2:' || v_scope_id];
    END LOOP;
  END IF;

  -- Deduplicate and sort deterministically by type then id
  v_lock_keys := ARRAY(
    SELECT k
    FROM (
      SELECT DISTINCT unnest(v_lock_keys) AS k
    ) AS distinct_keys
    ORDER BY
      split_part(k, ':', 1)::int,
      split_part(k, ':', 2)
  );

  FOREACH v_scope_id IN ARRAY v_lock_keys LOOP
    v_scope_type := split_part(v_scope_id, ':', 1)::int;
    v_scope_id := split_part(v_scope_id, ':', 2);
    PERFORM pg_advisory_xact_lock(v_scope_type, (hashtext(v_scope_id))::int);
  END LOOP;
END;
$$;

-- Reconcile migration 204's confirm_reservation_with_capacity to use new lock domain
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
  v_staff_id uuid;
  v_resource_id uuid;
  v_staff_ids uuid[] := ARRAY[]::uuid[];
  v_resource_ids uuid[] := ARRAY[]::uuid[];
  v_seat_capacity integer;
  v_current_covers integer := 0;
  v_new_history jsonb;
  v_now timestamptz := clock_timestamp();
  v_event jsonb;
BEGIN
  -- 1. Fetch the target reservation into a single record target.
  SELECT id, organizer_id, business_id, party_size, starts_at, ends_at, status, status_history,
         staff_id, resource_id
  INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Reservation not found.');
  END IF;

  -- Extract scalar fields from the record for lock scope assembly.
  -- NOTE: business_id, staff_id, and resource_id are NOT modified by this RPC
  -- (only starts_at, party_size, duration_minutes, ends_at, status, etc. are).
  -- Any concurrent transaction that would change these columns on the same
  -- reservation must first acquire the same advisory lock on the affected
  -- scope, which it cannot do while we hold it. Therefore reading scope IDs
  -- before locking is safe: the IDs cannot change under us.
  v_staff_id := v_res.staff_id;
  v_resource_id := v_res.resource_id;

  IF v_res.status <> p_expected_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_UPDATED',
      'message', 'This reservation was already updated by another team member.',
      'current_status', v_res.status
    );
  END IF;

  -- 2. Collect scope IDs for locking
  IF v_staff_id IS NOT NULL THEN
    v_staff_ids := ARRAY[v_staff_id];
  END IF;
  IF v_resource_id IS NOT NULL THEN
    v_resource_ids := ARRAY[v_resource_id];
  END IF;

  -- 3. Concurrency control: use shared lock function (replaces migration 204 single-arg lock).
  -- Preserves migration 204 organizer fallback: when business_id is NULL, locks on organizer_id.
  PERFORM public.acquire_booking_scope_locks(
    COALESCE(v_res.business_id, v_res.organizer_id),
    v_res.organizer_id,
    v_staff_ids,
    v_resource_ids
  );

  -- Re-fetch after lock to ensure consistency
  SELECT id, organizer_id, business_id, party_size, starts_at, ends_at, status, status_history,
         staff_id, resource_id
  INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF v_res.status <> p_expected_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_UPDATED',
      'message', 'This reservation was already updated by another team member.',
      'current_status', v_res.status
    );
  END IF;

  -- 4. Check capacity per scope
  IF v_res.business_id IS NOT NULL THEN
    SELECT seat_capacity INTO v_seat_capacity
    FROM public.businesses
    WHERE id = v_res.business_id;
  ELSE
    v_seat_capacity := NULL;
  END IF;

  -- Business-wide capacity (legacy restaurants, no staff/resource)
  IF v_seat_capacity IS NOT NULL AND v_res.resource_id IS NULL AND v_res.staff_id IS NULL THEN
    SELECT COALESCE(SUM(party_size), 0)
    INTO v_current_covers
    FROM public.reservations
    WHERE business_id = v_res.business_id
      AND status IN ('confirmed', 'seated', 'pending_hold')
      AND (status <> 'pending_hold' OR (hold_expires_at IS NOT NULL AND hold_expires_at > now()))
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

  -- Staff capacity (Service template): 1 concurrent booking per staff slot
  IF v_res.staff_id IS NOT NULL THEN
    SELECT COALESCE(SUM(party_size), 0)
    INTO v_current_covers
    FROM public.reservations
    WHERE staff_id = v_res.staff_id
      AND status IN ('confirmed', 'seated', 'pending_hold')
      AND (status <> 'pending_hold' OR hold_expires_at > now())
      AND starts_at < v_res.ends_at
      AND ends_at > v_res.starts_at
      AND id <> v_res.id;

    IF v_current_covers >= 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAPACITY_EXCEEDED',
        'message', 'Staff member is already booked for this time slot.',
        'staff_id', v_res.staff_id
      );
    END IF;
  END IF;

  -- Resource capacity (General Booking template)
  IF v_res.resource_id IS NOT NULL THEN
    SELECT capacity INTO v_seat_capacity
    FROM public.reservation_resources
    WHERE id = v_res.resource_id;

    IF v_seat_capacity IS NOT NULL THEN
      SELECT COALESCE(SUM(party_size), 0)
      INTO v_current_covers
      FROM public.reservations
      WHERE resource_id = v_res.resource_id
        AND status IN ('confirmed', 'seated', 'pending_hold')
        AND (status <> 'pending_hold' OR hold_expires_at > now())
        AND starts_at < v_res.ends_at
        AND ends_at > v_res.starts_at
        AND id <> v_res.id;

      IF (v_current_covers + v_res.party_size) > v_seat_capacity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'CAPACITY_EXCEEDED',
          'message', format('Resource capacity exceeded: confirming %s guests would bring active usage to %s (max %s).',
                            v_res.party_size, v_current_covers + v_res.party_size, v_seat_capacity),
          'seat_capacity', v_seat_capacity,
          'current_covers', v_current_covers,
          'requested_party_size', v_res.party_size
        );
      END IF;
    END IF;
  END IF;

  -- 5. Build status history event
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

  -- 6. Update reservation to confirmed
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

-- Reconcile migration 206's approve_reservation_change_with_capacity to use new lock domain
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
  v_staff_id              uuid;
  v_resource_id           uuid;
  v_staff_ids             uuid[] := ARRAY[]::uuid[];
  v_resource_ids          uuid[] := ARRAY[]::uuid[];
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
  -- NOTE: business_id, staff_id, and resource_id are NOT modified by this RPC
  -- (only starts_at, party_size, duration_minutes, ends_at, status are).
  -- Any concurrent transaction that would change these columns on the same
  -- reservation must first acquire the same advisory lock on the affected
  -- scope, which it cannot do while we hold it. Therefore reading scope IDs
  -- before locking is safe: the IDs cannot change under us.
  SELECT r.business_id, r.staff_id, r.resource_id, r.organizer_id
  INTO   v_business_id, v_staff_id, v_resource_id, v_organizer_id
  FROM   public.reservation_change_requests c
  JOIN   public.reservations r ON r.id = c.reservation_id
  WHERE  c.id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Build scope arrays
  IF v_staff_id IS NOT NULL THEN
    v_staff_ids := ARRAY[v_staff_id];
  END IF;
  IF v_resource_id IS NOT NULL THEN
    v_resource_ids := ARRAY[v_resource_id];
  END IF;

  -- Step 2: Take advisory transaction lock using shared lock function.
  -- Preserves migration 204 organizer fallback: when business_id is NULL, locks on organizer_id.
  PERFORM public.acquire_booking_scope_locks(
    COALESCE(v_business_id, v_organizer_id),
    v_organizer_id,
    v_staff_ids,
    v_resource_ids
  );

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
  IF v_reservation.status IN ('confirmed', 'seated')
     AND v_business_id IS NOT NULL
     AND v_seat_capacity IS NOT NULL
     AND v_reservation.resource_id IS NULL
     AND v_reservation.staff_id IS NULL THEN
    SELECT COALESCE(SUM(r.party_size), 0) INTO v_overlapping_covers
    FROM public.reservations r
    WHERE r.business_id = v_business_id
      AND r.status IN ('confirmed', 'seated', 'pending_hold')
      AND (r.status <> 'pending_hold' OR (r.hold_expires_at IS NOT NULL AND r.hold_expires_at > now()))
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

  -- Staff capacity (Service template): 1 concurrent booking per staff slot.
  IF v_reservation.staff_id IS NOT NULL THEN
    SELECT COALESCE(SUM(r.party_size), 0)
    INTO v_current_covers
    FROM public.reservations r
    WHERE r.staff_id = v_reservation.staff_id
      AND r.status IN ('confirmed', 'seated', 'pending_hold')
      AND (r.status <> 'pending_hold' OR (r.hold_expires_at IS NOT NULL AND r.hold_expires_at > now()))
      AND r.starts_at < v_new_ends_at
      AND r.ends_at   > v_new_starts_at
      AND r.id <> v_reservation.id;

    IF v_current_covers >= 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAPACITY_EXCEEDED',
        'message', 'Staff member is already booked for this time slot.',
        'staff_id', v_reservation.staff_id
      );
    END IF;
  END IF;

  -- Resource capacity (General Booking template).
  IF v_reservation.resource_id IS NOT NULL THEN
    SELECT capacity INTO v_seat_capacity
    FROM public.reservation_resources
    WHERE id = v_reservation.resource_id;

    IF v_seat_capacity IS NOT NULL THEN
      SELECT COALESCE(SUM(r.party_size), 0)
      INTO v_current_covers
      FROM public.reservations r
      WHERE r.resource_id = v_reservation.resource_id
        AND r.status IN ('confirmed', 'seated', 'pending_hold')
        AND (r.status <> 'pending_hold' OR (r.hold_expires_at IS NOT NULL AND r.hold_expires_at > now()))
        AND r.starts_at < v_new_ends_at
        AND r.ends_at   > v_new_starts_at
        AND r.id <> v_reservation.id;

      IF v_current_covers + v_new_party_size > v_seat_capacity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'CAPACITY_EXCEEDED',
          'message', format('Resource capacity exceeded: approving %s guests would bring active usage to %s (max %s).',
                            v_new_party_size, v_current_covers + v_new_party_size, v_seat_capacity),
          'seat_capacity', v_seat_capacity,
          'current_covers', v_current_covers,
          'requested_party_size', v_new_party_size
        );
      END IF;
    END IF;
  END IF;

  -- Step 8: Build the status history event
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

  -- Step 9: Mark the request approved FIRST (guarded by status = 'pending').
  -- This is the gatekeeper: if the request was already decided, we return an
  -- error before touching the reservation, so nothing is changed.
  UPDATE public.reservation_change_requests
  SET
    status        = 'approved',
    decided_by    = p_actor,
    decided_at    = v_now,
    decision_note = p_decision_note,
    updated_at    = v_now
  WHERE id = p_request_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUEST_NOT_PENDING',
      'message', 'This change request was already decided by another team member.'
    );
  END IF;

  -- Step 10: Update the reservation (ends_at synced explicitly; trigger also covers it).
  -- Guarded by id; under the advisory lock this should always affect exactly 1 row.
  UPDATE public.reservations
  SET
    starts_at        = v_new_starts_at,
    party_size       = v_new_party_size,
    duration_minutes = v_new_duration,
    ends_at          = v_new_ends_at,
    status_history   = v_new_history,
    updated_at       = v_now
  WHERE id = v_reservation.id;

  IF NOT FOUND THEN
    -- Should be unreachable under the advisory lock (the reservation cannot
    -- change while we hold the lock). Roll back everything including the
    -- request approval above to preserve atomicity.
    RAISE EXCEPTION
      'MIGRATION_216_ATOMICITY_FAILURE: reservation % was not found after acquiring lock. Transaction rolled back.',
      v_reservation.id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 12. Row Level Security ───────────────────────────────────────────────

ALTER TABLE public.reservation_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_resource_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_staff_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_staff_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_resource_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_resource_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_deposits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reservation_staff FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_resources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_service_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_staff_services FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_resource_services FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_staff_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_staff_breaks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_staff_exceptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_resource_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_resource_exceptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_deposits FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.reservation_staff TO service_role;
GRANT ALL ON TABLE public.reservation_resources TO service_role;
GRANT ALL ON TABLE public.reservation_service_catalog TO service_role;
GRANT ALL ON TABLE public.reservation_staff_services TO service_role;
GRANT ALL ON TABLE public.reservation_resource_services TO service_role;
GRANT ALL ON TABLE public.reservation_staff_schedules TO service_role;
GRANT ALL ON TABLE public.reservation_staff_breaks TO service_role;
GRANT ALL ON TABLE public.reservation_staff_exceptions TO service_role;
GRANT ALL ON TABLE public.reservation_resource_schedules TO service_role;
GRANT ALL ON TABLE public.reservation_resource_exceptions TO service_role;
GRANT ALL ON TABLE public.reservation_deposits TO service_role;

-- Lock down RPCs
REVOKE ALL ON FUNCTION public.acquire_booking_scope_locks(uuid, uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_booking_scope_locks(uuid, uuid, uuid[], uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_reservation_with_capacity(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation_with_capacity(uuid, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
