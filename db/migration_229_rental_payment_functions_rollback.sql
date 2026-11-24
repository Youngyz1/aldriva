-- Migration 229 Rollback: Rental Payment Functions Rollback
-- Workstream: Vehicle Rentals (Branch: feat/rental-overview)
-- Specification: docs/design/rental/payments.md
-- Part 2 of 2 Rollback Twin

BEGIN;

-- =============================================================================
-- SAFETY CHECK & OPERATOR INSTRUCTION (Minor M1 & Blocker B7)
-- =============================================================================
-- In accordance with the Owner Pre-Apply Checklist, live function definitions
-- must be captured before applying Migration 229 using:
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_rental_booking';
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'check_rental_booking_block_overlap';
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'check_rental_block_booking_overlap';
--
-- This rollback file provides the verified historical baseline functions from
-- Migration 226. To execute this rollback, confirm the definitions match your
-- captured staging definitions and comment out or remove the DO block below.
-- =============================================================================

DO $$
BEGIN
  RAISE EXCEPTION 'MIGRATION_229_ROLLBACK_HALTED: Verify and restore saved function definitions captured pre-apply (via pg_get_functiondef) before proceeding.';
END;
$$;

-- ── 1. Drop Migration 229 New Signatures & Functions ─────────────────────────
DROP FUNCTION IF EXISTS public.create_rental_booking(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric,
  uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric,
  text, timestamptz, text, text
);

DROP FUNCTION IF EXISTS public.confirm_rental_booking(uuid, uuid, uuid);

DROP FUNCTION IF EXISTS public.record_rental_payment(
  uuid, uuid, text, text, numeric, text, text, text, text, text, uuid, text
);

DROP FUNCTION IF EXISTS public.record_rental_balance_and_pickup(
  uuid, uuid, text, numeric, text, uuid, text, text
);

DROP FUNCTION IF EXISTS public.prepare_rental_checkout_session(uuid, uuid);

DROP FUNCTION IF EXISTS public.commit_rental_checkout_session(
  uuid, text, text, numeric, timestamptz
);

-- ── 2. Restore Historical Overlap Trigger Functions (Migration 226) ───────────
CREATE OR REPLACE FUNCTION public.check_rental_booking_block_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NEW.status IN ('pending', 'confirmed', 'active') THEN
    -- Consistent lock order: Category first, then Vehicle
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || NEW.category_id::text));
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
      WHERE b.vehicle_id = NEW.vehicle_id
        AND b.block_period && NEW.booking_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', NEW.vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.check_rental_block_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
BEGIN
  -- Look up category to ensure consistent lock order: Category first, then Vehicle
  SELECT category_id INTO v_category_id FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v_category_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

  IF EXISTS (
    SELECT 1 FROM public.rental_bookings rb
    WHERE rb.vehicle_id = NEW.vehicle_id
      AND rb.status IN ('pending', 'confirmed', 'active')
      AND rb.booking_period && NEW.block_period
  ) THEN
    RAISE EXCEPTION 'VEHICLE_BOOKING_EXISTS: vehicle % already has an active booking during the requested block period', NEW.vehicle_id
      USING ERRCODE = 'RB003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;

-- ── 3. Restore Historical create_rental_booking (Migration 226) ───────────────
CREATE OR REPLACE FUNCTION public.create_rental_booking(
  p_organizer_id            uuid,
  p_business_id             uuid,
  p_category_id             uuid,
  p_starts_at               timestamptz,
  p_ends_at                 timestamptz,
  p_customer_name           text,
  p_customer_email          text,
  p_snapshot_daily_rate     numeric,
  p_rental_amount           numeric,
  p_vehicle_id              uuid DEFAULT NULL,
  p_source                  text DEFAULT 'office',
  p_pickup_branch_id        uuid DEFAULT NULL,
  p_return_branch_id        uuid DEFAULT NULL,
  p_customer_phone          text DEFAULT NULL,
  p_driver_license_number   text DEFAULT NULL,
  p_driver_license_country  text DEFAULT NULL,
  p_driver_dob              date DEFAULT NULL,
  p_snapshot_weekly_rate    numeric DEFAULT NULL,
  p_snapshot_currency       text DEFAULT 'USD',
  p_deposit_required_amount numeric DEFAULT 0.00,
  p_notes                   text DEFAULT NULL,
  p_expires_at              timestamptz DEFAULT NULL,
  p_booking_number          text DEFAULT NULL
)
RETURNS public.rental_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requested_period   tstzrange;
  v_available_capacity integer;
  v_booking_number     text;
  v_new_booking        public.rental_bookings;
BEGIN
  -- 1. Validate duration
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be strictly after starts_at' USING ERRCODE = '22000';
  END IF;

  -- 2. Validate tenant & business hierarchy
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: business % does not belong to organizer %', p_business_id, p_organizer_id
      USING ERRCODE = 'RB004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_categories
    WHERE id = p_category_id AND business_id = p_business_id AND organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'CATEGORY_MISMATCH: category % does not belong to business/organizer', p_category_id
      USING ERRCODE = 'RB005';
  END IF;

  -- 3. If specific vehicle requested, validate vehicle belongs to category, business,
  --    is_active, not out_of_service, and not in maintenance status.
  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE id = p_vehicle_id
        AND category_id = p_category_id
        AND business_id = p_business_id
        AND organizer_id = p_organizer_id
        AND is_active = true
        AND status NOT IN ('out_of_service', 'maintenance')
    ) THEN
      RAISE EXCEPTION 'VEHICLE_INVALID: vehicle % does not belong to category/business or is inactive/out_of_service/maintenance', p_vehicle_id
        USING ERRCODE = 'RB006';
    END IF;
  END IF;

  v_requested_period := tstzrange(p_starts_at, p_ends_at, '[)');

  -- 4. ACQUIRE EXCLUSIVE ADVISORY TRANSACTION LOCKS IN STRICT HIERARCHICAL ORDER
  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || p_category_id::text));

  IF p_vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || p_vehicle_id::text));
  END IF;

  -- 5. Expire stale pending holds immediately inside the lock to free capacity
  UPDATE public.rental_bookings
  SET status = 'expired',
      updated_at = now()
  WHERE category_id = p_category_id
    AND status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- 6. If specific vehicle requested, verify not blocked by a maintenance block
  IF p_vehicle_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
      WHERE b.vehicle_id = p_vehicle_id
        AND b.block_period && v_requested_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', p_vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;

  -- 7. Calculate available category capacity in requested period
  WITH eligible_vehicles AS (
    SELECT v.id
    FROM public.vehicles v
    WHERE v.category_id = p_category_id
      AND v.business_id = p_business_id
      AND v.is_active = true
      AND v.status NOT IN ('out_of_service', 'maintenance')
      AND NOT EXISTS (
        SELECT 1 FROM public.rental_blocks b
        WHERE b.vehicle_id = v.id
          AND b.block_period && v_requested_period
      )
  ),
  conflicting_assigned AS (
    SELECT count(DISTINCT rb.vehicle_id) AS cnt
    FROM public.rental_bookings rb
    WHERE rb.vehicle_id IN (SELECT id FROM eligible_vehicles)
      AND rb.booking_period && v_requested_period
      AND rb.status IN ('pending', 'confirmed', 'active')
  ),
  conflicting_unassigned AS (
    SELECT count(*) AS cnt
    FROM public.rental_bookings rb
    WHERE rb.category_id = p_category_id
      AND rb.business_id = p_business_id
      AND rb.vehicle_id IS NULL
      AND rb.booking_period && v_requested_period
      AND rb.status IN ('pending', 'confirmed', 'active')
  )
  SELECT
    (SELECT count(*) FROM eligible_vehicles) -
    (SELECT cnt FROM conflicting_assigned) -
    (SELECT cnt FROM conflicting_unassigned)
  INTO v_available_capacity;

  IF v_available_capacity <= 0 THEN
    RAISE EXCEPTION 'CATEGORY_CAPACITY_EXCEEDED: No available capacity in this category for requested period'
      USING ERRCODE = 'RB001';
  END IF;

  -- 8. Generate concurrency-safe booking number using sequence if not provided
  IF p_booking_number IS NOT NULL AND p_booking_number <> '' THEN
    v_booking_number := p_booking_number;
  ELSE
    v_booking_number := 'RBK-' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-' || lpad(nextval('public.rental_booking_number_seq')::text, 4, '0');
  END IF;

  -- 9. Insert booking row
  INSERT INTO public.rental_bookings (
    organizer_id,
    business_id,
    category_id,
    vehicle_id,
    source,
    booking_number,
    starts_at,
    ends_at,
    expires_at,
    pickup_branch_id,
    return_branch_id,
    customer_name,
    customer_email,
    customer_phone,
    driver_license_number,
    driver_license_country,
    driver_dob,
    status,
    rental_amount,
    snapshot_daily_rate,
    snapshot_weekly_rate,
    snapshot_currency,
    deposit_required_amount,
    notes,
    created_at,
    updated_at
  ) VALUES (
    p_organizer_id,
    p_business_id,
    p_category_id,
    p_vehicle_id,
    p_source,
    v_booking_number,
    p_starts_at,
    p_ends_at,
    p_expires_at,
    p_pickup_branch_id,
    p_return_branch_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_driver_license_number,
    p_driver_license_country,
    p_driver_dob,
    'pending',
    p_rental_amount,
    p_snapshot_daily_rate,
    p_snapshot_weekly_rate,
    p_snapshot_currency,
    p_deposit_required_amount,
    p_notes,
    now(),
    now()
  )
  RETURNING * INTO v_new_booking;

  RETURN v_new_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_rental_booking(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric,
  uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric,
  text, timestamptz, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_rental_booking(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric,
  uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric,
  text, timestamptz, text
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
