-- Migration 226: rental hardening and grants
-- Part of Slice 3 of the Aldriva Vehicle Rental Engine.
-- Documentation: docs/design/rental/architecture.md
-- DO NOT apply manually — the user applies migrations.
--
-- Changes vs migration_225:
--  1. Re-assert REVOKE/GRANT for all rental functions (Supabase re-grants on deploy).
--  2. Add SET search_path = public, pg_temp to both cross-table trigger functions.
--  3. Add CREATE OR REPLACE FUNCTION create_rental_booking with:
--       - vehicles.status NOT IN ('out_of_service','maintenance') in both
--         the vehicle validation step and the eligible_vehicles CTE.
--     All other logic (lock order, error codes, expiry, capacity count) unchanged.
--  4. Add entity hierarchy validation triggers (RB004/RB005/RB006) with search_path.
--  5. Drop authenticated INSERT, UPDATE, and DELETE policies on rental_bookings and
--     rental_blocks.  All writes go through server actions using the admin client
--     (createSupabaseAdmin), which bypasses RLS entirely.  Keeping authenticated
--     SELECT so dashboard queries via the user client still work.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Function Privileges Hardening
-- Re-assert after Supabase potentially re-grants on deploy.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental_booking TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_rental_overdue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_rental_overdue() TO service_role;

-- Trigger functions are INTERNAL — never callable from PostgREST
REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_rental_updated_at() FROM PUBLIC, anon, authenticated;

-- Public token lookup: anon + authenticated can call it
REVOKE ALL ON FUNCTION public.get_public_rental_booking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_rental_booking(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Add SET search_path to cross-table trigger functions
-- (The trigger body is identical to migration_225; only search_path is added.)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 3. CREATE OR REPLACE create_rental_booking with 'maintenance' exclusion
-- Identical to migration_225 version EXCEPT:
--   - Vehicle validation: status NOT IN ('out_of_service', 'maintenance')
--   - eligible_vehicles CTE:  status NOT IN ('out_of_service', 'maintenance')
-- Lock order, error codes, expiry logic, and capacity count are unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_rental_booking(
  p_organizer_id uuid,
  p_business_id uuid,
  p_category_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_snapshot_daily_rate numeric,
  p_rental_amount numeric,
  p_vehicle_id uuid DEFAULT NULL,
  p_source text DEFAULT 'office',
  p_pickup_branch_id uuid DEFAULT NULL,
  p_return_branch_id uuid DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_driver_license_number text DEFAULT NULL,
  p_driver_license_country text DEFAULT NULL,
  p_driver_dob date DEFAULT NULL,
  p_snapshot_weekly_rate numeric DEFAULT NULL,
  p_snapshot_currency text DEFAULT 'USD',
  p_deposit_required_amount numeric DEFAULT 0.00,
  p_notes text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_booking_number text DEFAULT NULL
)
RETURNS public.rental_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requested_period tstzrange;
  v_available_capacity integer;
  v_booking_number text;
  v_new_booking public.rental_bookings;
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
  --    (migration_226 adds the 'maintenance' exclusion on top of migration_225.)
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
  -- Category lock first:
  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || p_category_id::text));

  -- Vehicle lock second (if vehicle_id specified):
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
  -- Step A: Eligible vehicles: active, not out_of_service or maintenance,
  --         and NO overlapping maintenance blocks.
  --         (migration_226 adds 'maintenance' status to exclusion list.)
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
  -- Step B: Conflicting bookings ONLY on vehicles within the eligible set (no double subtraction)
  conflicting_assigned AS (
    SELECT count(DISTINCT rb.vehicle_id) AS cnt
    FROM public.rental_bookings rb
    WHERE rb.vehicle_id IN (SELECT id FROM eligible_vehicles)
      AND rb.booking_period && v_requested_period
      AND rb.status IN ('pending', 'confirmed', 'active')
  ),
  -- Step C: Conflicting unassigned category bookings
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

REVOKE ALL ON FUNCTION public.create_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental_booking TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Entity Hierarchy Validation Triggers (with search_path)
-- Enforces that vehicle_id, category_id, business_id belong to organizer_id
-- and to each other on both rental_bookings and rental_blocks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_rental_booking_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- 4a. Validate business belongs to organizer (RB004)
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = NEW.business_id AND organizer_id = NEW.organizer_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: business % does not belong to organizer %', NEW.business_id, NEW.organizer_id
      USING ERRCODE = 'RB004';
  END IF;

  -- 4b. Validate category belongs to business and organizer (RB005)
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_categories
    WHERE id = NEW.category_id AND business_id = NEW.business_id AND organizer_id = NEW.organizer_id
  ) THEN
    RAISE EXCEPTION 'CATEGORY_MISMATCH: category % does not belong to business/organizer', NEW.category_id
      USING ERRCODE = 'RB005';
  END IF;

  -- 4c. If vehicle assigned, validate vehicle belongs to category, business, organizer (RB006)
  IF NEW.vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE id = NEW.vehicle_id
        AND category_id = NEW.category_id
        AND business_id = NEW.business_id
        AND organizer_id = NEW.organizer_id
    ) THEN
      RAISE EXCEPTION 'VEHICLE_INVALID: vehicle % does not belong to category/business/organizer', NEW.vehicle_id
        USING ERRCODE = 'RB006';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_rental_bookings_hierarchy ON public.rental_bookings;
CREATE TRIGGER trg_rental_bookings_hierarchy
  BEFORE INSERT OR UPDATE OF organizer_id, business_id, category_id, vehicle_id
  ON public.rental_bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_rental_booking_hierarchy();

CREATE OR REPLACE FUNCTION public.check_rental_block_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate business belongs to organizer (RB004)
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = NEW.business_id AND organizer_id = NEW.organizer_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: business % does not belong to organizer %', NEW.business_id, NEW.organizer_id
      USING ERRCODE = 'RB004';
  END IF;

  -- Validate vehicle belongs to business and organizer (RB006)
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = NEW.vehicle_id AND business_id = NEW.business_id AND organizer_id = NEW.organizer_id
  ) THEN
    RAISE EXCEPTION 'VEHICLE_INVALID: vehicle % does not belong to business/organizer', NEW.vehicle_id
      USING ERRCODE = 'RB006';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_rental_blocks_hierarchy ON public.rental_blocks;
CREATE TRIGGER trg_rental_blocks_hierarchy
  BEFORE INSERT OR UPDATE OF organizer_id, business_id, vehicle_id
  ON public.rental_blocks
  FOR EACH ROW EXECUTE FUNCTION public.check_rental_block_hierarchy();

REVOKE ALL ON FUNCTION public.check_rental_booking_hierarchy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_hierarchy() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS Policy Hardening
-- Remove authenticated INSERT, UPDATE, and DELETE on rental_bookings and
-- rental_blocks.  Rationale: every write goes through a server action that
-- calls createSupabaseAdmin(), which uses the service_role key and bypasses
-- RLS entirely.  Authenticated direct REST writes would skip the advisory
-- locks and hierarchy checks inside create_rental_booking, so we remove them.
-- SELECT policies are retained so dashboard queries via the user client work.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS rental_bookings_staff_insert ON public.rental_bookings;
DROP POLICY IF EXISTS rental_bookings_staff_update ON public.rental_bookings;
DROP POLICY IF EXISTS rental_bookings_staff_delete ON public.rental_bookings;

DROP POLICY IF EXISTS rental_blocks_staff_insert ON public.rental_blocks;
DROP POLICY IF EXISTS rental_blocks_staff_update ON public.rental_blocks;
DROP POLICY IF EXISTS rental_blocks_staff_delete ON public.rental_blocks;

COMMIT;

NOTIFY pgrst, 'reload schema';
