-- Migration 269: inventory transfers and location archive guard (builds on 268)
-- Also replaces inventory_apply_movement() with a version that share-locks the location row (rollback leaves that stricter version in place).
-- Adds: inventory_transfer_stock() (atomic, two ledger rows sharing a reference_id) and a trigger that
-- refuses archiving the default location or a location that still holds stock.
-- Apply statement by statement. No BEGIN/COMMIT. Every statement is idempotent.

-- STATEMENT 0: PREFLIGHT (read-only). Expect ok = true on every row except the last (info).
SELECT 'inventory tables exist' AS check_name, (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('inventory_items','inventory_locations','inventory_balances','inventory_movements')) = 4 AS ok
UNION ALL SELECT 'inventory_can_manage exists', to_regprocedure('public.inventory_can_manage(uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'inventory_apply_movement exists', to_regprocedure('public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)') IS NOT NULL
UNION ALL SELECT 'movements have reference_type and reference_id', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_movements' AND column_name IN ('reference_type','reference_id')) = 2
UNION ALL SELECT 'info: inventory_transfer_stock already exists (false on first run)', to_regprocedure('public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)') IS NOT NULL;

-- STATEMENT 1: archive guard (default location and locations holding stock cannot be archived)
CREATE OR REPLACE FUNCTION public.inventory_guard_location_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
    IF OLD.is_default THEN
      RAISE EXCEPTION 'The default location cannot be archived'
        USING ERRCODE = '23514', HINT = 'inventory_default_location_archive';
    END IF;
    PERFORM 1 FROM public.inventory_balances WHERE location_id = OLD.id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.inventory_balances b
                WHERE b.location_id = OLD.id AND (b.on_hand <> 0 OR b.reserved <> 0)) THEN
      RAISE EXCEPTION 'The location still holds stock'
        USING ERRCODE = '23514', HINT = 'inventory_location_has_stock';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DO $trg$
BEGIN
  DROP TRIGGER IF EXISTS trg_inventory_locations_archive_guard ON public.inventory_locations;
  CREATE TRIGGER trg_inventory_locations_archive_guard BEFORE UPDATE ON public.inventory_locations
    FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_location_archive();
END
$trg$;

-- STATEMENT 2: the transfer function (atomic; permission needed at BOTH locations)
CREATE OR REPLACE FUNCTION public.inventory_transfer_stock(
  p_business_id uuid, p_item_id uuid, p_from_location_id uuid, p_to_location_id uuid,
  p_quantity numeric, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_from_branch uuid; v_from_status text;
  v_to_branch uuid; v_to_status text;
  v_item_active boolean;
  v_first uuid; v_second uuid;
  v_from_old numeric; v_to_old numeric;
  v_from_new numeric; v_to_new numeric;
  v_ref uuid := gen_random_uuid();
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'Quantity must be above zero with at most 3 decimals' USING ERRCODE = '23514', HINT = 'inventory_bad_quantity';
  END IF;
  IF p_from_location_id = p_to_location_id THEN
    RAISE EXCEPTION 'Choose two different locations' USING ERRCODE = '23514', HINT = 'inventory_transfer_same_location';
  END IF;

  SELECT l.branch_id, l.status INTO v_from_branch, v_from_status
    FROM public.inventory_locations l WHERE l.id = p_from_location_id AND l.business_id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;
  SELECT l.branch_id, l.status INTO v_to_branch, v_to_status
    FROM public.inventory_locations l WHERE l.id = p_to_location_id AND l.business_id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL
              AND public.inventory_can_manage(p_business_id, v_from_branch)
              AND public.inventory_can_manage(p_business_id, v_to_branch)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF v_from_status <> 'active' OR v_to_status <> 'active' THEN
    RAISE EXCEPTION 'Location is archived' USING ERRCODE = '23514', HINT = 'inventory_location_archived';
  END IF;

  SELECT i.is_active INTO v_item_active FROM public.inventory_items i
   WHERE i.id = p_item_id AND i.business_id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = '23514', HINT = 'inventory_item_not_found';
  END IF;
  IF NOT v_item_active THEN
    RAISE EXCEPTION 'Item is inactive' USING ERRCODE = '23514', HINT = 'inventory_item_inactive';
  END IF;


  -- Lock both balance rows in a fixed order so opposite transfers cannot deadlock.
  IF p_from_location_id < p_to_location_id THEN
    v_first := p_from_location_id; v_second := p_to_location_id;
  ELSE
    v_first := p_to_location_id; v_second := p_from_location_id;
  END IF;
  -- Lock order is always: location rows (share), then balance rows. Archive does the same (row, then trigger locks balances).
  PERFORM 1 FROM public.inventory_locations WHERE id IN (p_from_location_id, p_to_location_id) ORDER BY id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.inventory_locations WHERE id IN (p_from_location_id, p_to_location_id) AND status <> 'active') THEN
    RAISE EXCEPTION 'Location is archived' USING ERRCODE = '23514', HINT = 'inventory_location_archived';
  END IF;
  INSERT INTO public.inventory_balances (item_id, location_id, business_id) VALUES (p_item_id, v_first, p_business_id) ON CONFLICT (item_id, location_id) DO NOTHING;
  INSERT INTO public.inventory_balances (item_id, location_id, business_id) VALUES (p_item_id, v_second, p_business_id) ON CONFLICT (item_id, location_id) DO NOTHING;
  PERFORM 1 FROM public.inventory_balances WHERE item_id = p_item_id AND location_id = v_first FOR UPDATE;
  PERFORM 1 FROM public.inventory_balances WHERE item_id = p_item_id AND location_id = v_second FOR UPDATE;

  SELECT on_hand INTO v_from_old FROM public.inventory_balances WHERE item_id = p_item_id AND location_id = p_from_location_id;
  SELECT on_hand INTO v_to_old FROM public.inventory_balances WHERE item_id = p_item_id AND location_id = p_to_location_id;

  v_from_new := v_from_old - p_quantity;
  IF v_from_new < 0 THEN
    RAISE EXCEPTION 'Not enough stock' USING ERRCODE = '23514', HINT = 'inventory_insufficient_stock';
  END IF;
  v_to_new := v_to_old + p_quantity;

  UPDATE public.inventory_balances SET on_hand = v_from_new, updated_at = now()
   WHERE item_id = p_item_id AND location_id = p_from_location_id;
  UPDATE public.inventory_balances SET on_hand = v_to_new, updated_at = now()
   WHERE item_id = p_item_id AND location_id = p_to_location_id;

  INSERT INTO public.inventory_movements
    (business_id, item_id, location_id, movement_type, quantity, balance_after, reason, reference_type, reference_id, created_by)
  VALUES
    (p_business_id, p_item_id, p_from_location_id, 'transfer_out', -p_quantity, v_from_new, p_reason, 'transfer', v_ref, auth.uid()),
    (p_business_id, p_item_id, p_to_location_id, 'transfer_in', p_quantity, v_to_new, p_reason, 'transfer', v_ref, auth.uid());

  RETURN v_ref;
END
$fn$;

-- STATEMENT 2b: adjust path takes a share lock on the location row, so an archive cannot slip between
-- the status check and the balance write. Same body as 268 apart from FOR SHARE on the location read.
CREATE OR REPLACE FUNCTION public.inventory_apply_movement(p_business_id uuid, p_item_id uuid, p_location_id uuid, p_type text, p_quantity numeric, p_reason text DEFAULT NULL::text, p_unit_cost numeric DEFAULT NULL::numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_branch uuid;
  v_loc_status text;
  v_item_active boolean;
  v_old numeric;
  v_new numeric;
  v_id uuid;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('opening','received','returned_in','transfer_in','sold','consumed','transfer_out','returned_out','damaged','expired','lost','adjustment') THEN
    RAISE EXCEPTION 'Unknown movement type' USING ERRCODE = '23514', HINT = 'inventory_bad_type';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 OR p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'Quantity must be non-zero with at most 3 decimals' USING ERRCODE = '23514', HINT = 'inventory_bad_quantity';
  END IF;
  IF (p_type IN ('opening','received','returned_in','transfer_in') AND p_quantity < 0)
     OR (p_type IN ('sold','consumed','transfer_out','returned_out','damaged','expired','lost') AND p_quantity > 0) THEN
    RAISE EXCEPTION 'Quantity sign does not match the movement type' USING ERRCODE = '23514', HINT = 'inventory_bad_sign';
  END IF;

  SELECT l.branch_id, l.status INTO v_branch, v_loc_status
    FROM public.inventory_locations l
   WHERE l.id = p_location_id AND l.business_id = p_business_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL AND public.inventory_can_manage(p_business_id, v_branch)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF v_loc_status <> 'active' THEN
    RAISE EXCEPTION 'Location is archived' USING ERRCODE = '23514', HINT = 'inventory_location_archived';
  END IF;

  SELECT i.is_active INTO v_item_active
    FROM public.inventory_items i
   WHERE i.id = p_item_id AND i.business_id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = '23514', HINT = 'inventory_item_not_found';
  END IF;
  IF NOT v_item_active THEN
    RAISE EXCEPTION 'Item is inactive' USING ERRCODE = '23514', HINT = 'inventory_item_inactive';
  END IF;

  INSERT INTO public.inventory_balances (item_id, location_id, business_id)
  VALUES (p_item_id, p_location_id, p_business_id)
  ON CONFLICT (item_id, location_id) DO NOTHING;

  SELECT b.on_hand INTO v_old
    FROM public.inventory_balances b
   WHERE b.item_id = p_item_id AND b.location_id = p_location_id
   FOR UPDATE;

  v_new := v_old + p_quantity;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Not enough stock' USING ERRCODE = '23514', HINT = 'inventory_insufficient_stock';
  END IF;

  UPDATE public.inventory_balances
     SET on_hand = v_new, updated_at = now()
   WHERE item_id = p_item_id AND location_id = p_location_id;

  INSERT INTO public.inventory_movements
    (business_id, item_id, location_id, movement_type, quantity, balance_after, unit_cost, reason, created_by)
  VALUES
    (p_business_id, p_item_id, p_location_id, p_type, p_quantity, v_new, p_unit_cost, p_reason, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

-- STATEMENT 3: grants (authenticated and service_role only)
DO $priv$
BEGIN
  REVOKE ALL ON FUNCTION public.inventory_transfer_stock(uuid, uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.inventory_guard_location_archive() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.inventory_transfer_stock(uuid, uuid, uuid, uuid, numeric, text) TO authenticated, service_role;
END
$priv$;