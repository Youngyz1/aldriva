-- Migration 225: rental_bookings + rental_blocks schema
-- Part of Slice 2 of the Aldriva Vehicle Rental Engine.
-- Documentation: docs/design/rental/architecture.md
-- DO NOT apply manually — the user applies migrations.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Sequence: concurrency-safe booking number generation
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.rental_booking_number_seq START WITH 1;

-- ---------------------------------------------------------------------------
-- Table: rental_bookings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lookup_token uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_number text NOT NULL,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.vehicle_categories(id) ON DELETE RESTRICT,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  assigned_by text,
  assigned_at timestamptz,
  source text NOT NULL DEFAULT 'office' CHECK (source IN ('online','office')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz,
  booking_period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  pickup_branch_id uuid REFERENCES public.business_branches(id) ON DELETE SET NULL,
  return_branch_id uuid REFERENCES public.business_branches(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  driver_license_number text,
  driver_license_country text,
  driver_dob date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','active','completed','cancelled','expired','no_show')),
  rental_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  snapshot_daily_rate numeric(12,2) NOT NULL,
  snapshot_weekly_rate numeric(12,2),
  snapshot_currency text NOT NULL DEFAULT 'USD',
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  deposit_required_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  deposit_collected_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  deposit_retained_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  deposit_status text NOT NULL DEFAULT 'none' CHECK (deposit_status IN ('none','pending_collection','collected_offline','returned_full','partially_retained','retained_full')),
  deposit_retention_reason text,
  deposit_retention_authorized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deposit_notes text,
  late_fee_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  late_fee_status text NOT NULL DEFAULT 'none' CHECK (late_fee_status IN ('none','pending','collected','waived')),
  late_fee_notes text,
  picked_up_at timestamptz,
  returned_at timestamptz,
  start_mileage int,
  end_mileage int,
  is_overdue boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rental_bookings_dates CHECK (ends_at > starts_at),
  CONSTRAINT uq_rental_bookings_lookup_token UNIQUE (lookup_token),
  CONSTRAINT uq_rental_bookings_number UNIQUE (booking_number)
);

COMMENT ON TABLE public.rental_bookings IS 'Rental bookings across online and office channels with snapshot rates and segregated deposit liabilities.';
COMMENT ON COLUMN public.rental_bookings.is_overdue IS 'Flag set when active booking exceeds ends_at + 60 min grace period. Maintained by reconcile_rental_overdue() worker or query-time evaluation.';

-- GiST exclusion constraint (requires btree_gist):
-- Prevents double-booking the same vehicle for overlapping periods
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS uq_rental_bookings_no_overlap;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT uq_rental_bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    booking_period WITH &&
  )
  WHERE (vehicle_id IS NOT NULL AND status IN ('pending','confirmed','active'));

-- ---------------------------------------------------------------------------
-- Table: rental_blocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  block_period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  reason text NOT NULL DEFAULT 'maintenance' CHECK (reason IN ('maintenance','inspection','repair','owner_use')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rental_blocks_dates CHECK (ends_at > starts_at)
);

ALTER TABLE public.rental_blocks
  DROP CONSTRAINT IF EXISTS uq_rental_blocks_no_overlap;

ALTER TABLE public.rental_blocks
  ADD CONSTRAINT uq_rental_blocks_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    block_period WITH &&
  );

-- ---------------------------------------------------------------------------
-- Cross-Table Triggers: Prevent overlapping blocks & bookings
-- Adheres to strict hierarchical lock order: Category first, then Vehicle
-- ---------------------------------------------------------------------------

-- Trigger 1: Prevent assigning a vehicle with an active maintenance block in the period
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_rental_booking_block_overlap ON public.rental_bookings;
CREATE TRIGGER trg_check_rental_booking_block_overlap
  BEFORE INSERT OR UPDATE OF vehicle_id, starts_at, ends_at, status ON public.rental_bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_rental_booking_block_overlap();

-- Trigger 2: Prevent creating a maintenance block over a vehicle with an active booking in the period
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_rental_block_booking_overlap ON public.rental_blocks;
CREATE TRIGGER trg_check_rental_block_booking_overlap
  BEFORE INSERT OR UPDATE OF vehicle_id, starts_at, ends_at ON public.rental_blocks
  FOR EACH ROW EXECUTE FUNCTION public.check_rental_block_booking_overlap();

-- ---------------------------------------------------------------------------
-- Updated_at triggers (reuses update_rental_updated_at from migration 224)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_rental_bookings_updated_at ON public.rental_bookings;
CREATE TRIGGER trg_rental_bookings_updated_at
  BEFORE UPDATE ON public.rental_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_rental_updated_at();

DROP TRIGGER IF EXISTS trg_rental_blocks_updated_at ON public.rental_blocks;
CREATE TRIGGER trg_rental_blocks_updated_at
  BEFORE UPDATE ON public.rental_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_rental_updated_at();

-- ---------------------------------------------------------------------------
-- businesses: add rental_allocation_mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS rental_allocation_mode text NOT NULL DEFAULT 'manual'
    CHECK (rental_allocation_mode IN ('manual','auto_on_confirm','auto_on_booking'));

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rental_bookings_org ON public.rental_bookings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_business ON public.rental_bookings(business_id);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_vehicle ON public.rental_bookings(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_bookings_status ON public.rental_bookings(organizer_id, status);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_dates ON public.rental_bookings(organizer_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_period_gist ON public.rental_bookings USING gist(booking_period);
CREATE INDEX IF NOT EXISTS idx_rental_blocks_vehicle ON public.rental_blocks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rental_blocks_period ON public.rental_blocks USING gist(block_period);

-- ---------------------------------------------------------------------------
-- RLS: rental_bookings
-- ---------------------------------------------------------------------------
ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_bookings_staff_select ON public.rental_bookings;
CREATE POLICY rental_bookings_staff_select ON public.rental_bookings
  FOR SELECT USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS rental_bookings_staff_insert ON public.rental_bookings;
CREATE POLICY rental_bookings_staff_insert ON public.rental_bookings
  FOR INSERT WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS rental_bookings_staff_update ON public.rental_bookings;
CREATE POLICY rental_bookings_staff_update ON public.rental_bookings
  FOR UPDATE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS rental_bookings_staff_delete ON public.rental_bookings;
CREATE POLICY rental_bookings_staff_delete ON public.rental_bookings
  FOR DELETE USING (
    is_entity_member(organizer_id, ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: rental_blocks
-- ---------------------------------------------------------------------------
ALTER TABLE public.rental_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_blocks_staff_select ON public.rental_blocks;
CREATE POLICY rental_blocks_staff_select ON public.rental_blocks
  FOR SELECT USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS rental_blocks_staff_insert ON public.rental_blocks;
CREATE POLICY rental_blocks_staff_insert ON public.rental_blocks
  FOR INSERT WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS rental_blocks_staff_update ON public.rental_blocks;
CREATE POLICY rental_blocks_staff_update ON public.rental_blocks
  FOR UPDATE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS rental_blocks_staff_delete ON public.rental_blocks;
CREATE POLICY rental_blocks_staff_delete ON public.rental_blocks
  FOR DELETE USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER function: atomic category booking creation with advisory lock
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

  -- 3. If specific vehicle requested, validate vehicle belongs to category, business, is_active, and not out_of_service
  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE id = p_vehicle_id
        AND category_id = p_category_id
        AND business_id = p_business_id
        AND organizer_id = p_organizer_id
        AND is_active = true
        AND status <> 'out_of_service'
    ) THEN
      RAISE EXCEPTION 'VEHICLE_INVALID: vehicle % does not belong to category/business or is inactive/out_of_service', p_vehicle_id
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

  -- 6. If specific vehicle requested, verify not in maintenance
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
  -- Step A: Eligible vehicles: active, not out_of_service, and NO overlapping maintenance blocks
  WITH eligible_vehicles AS (
    SELECT v.id
    FROM public.vehicles v
    WHERE v.category_id = p_category_id
      AND v.business_id = p_business_id
      AND v.is_active = true
      AND v.status <> 'out_of_service'
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

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER function: public token lookup (no PII exposed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_rental_booking(p_token uuid)
RETURNS TABLE (
  booking_number text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  rental_amount numeric,
  snapshot_currency text,
  payment_status text,
  deposit_required_amount numeric,
  deposit_status text,
  customer_name text,
  pickup_branch_id uuid,
  return_branch_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT
      rb.booking_number,
      rb.status,
      rb.starts_at,
      rb.ends_at,
      rb.rental_amount,
      rb.snapshot_currency,
      rb.payment_status,
      rb.deposit_required_amount,
      rb.deposit_status,
      rb.customer_name,
      rb.pickup_branch_id,
      rb.return_branch_id
    FROM public.rental_bookings rb
    WHERE rb.lookup_token = p_token
    LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: reconcile overdue rentals (maintains is_overdue stored flag)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_rental_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.rental_bookings
  SET is_overdue = true,
      updated_at = now()
  WHERE status = 'active'
    AND is_overdue = false
    AND now() > (ends_at + interval '60 minutes');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: Restricted to service_role (backend server actions only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental_booking TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_rental_overdue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_rental_overdue() TO service_role;

REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_rental_booking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_rental_booking(uuid) TO authenticated, anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
