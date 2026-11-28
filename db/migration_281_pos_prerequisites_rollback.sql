-- migration_281_pos_prerequisites_rollback.sql
-- DRAFT ONLY. DO NOT APPLY WITHOUT OWNER APPROVAL.
--
-- Fail-closed rollback for migration_281_pos_prerequisites.sql.
-- Restores 269 7-arg inventory_apply_movement (FOR SHARE) and 17-value domain CHECK.
--
-- IMPORTANT: Before approval, diff the recreated 7-arg function body below against
--   SELECT pg_get_functiondef('public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)'::regprocedure);
-- from staging to confirm it matches the live 269 body exactly.
--
-- Preconditions (all must pass or RAISE):
-- - No supply.*, pos.*, loyalty.* permission keys exist in staff_permissions
-- - No 282+/287+ POS-supply migration markers detected (fail-closed heuristics; supply 282-286, POS 287+, pending owner confirmation)
-- - No other function depends on inventory_apply_movement_core (pg_depend/prosrc)

BEGIN;

DO $pre$
DECLARE
  v_bad_keys bigint;
  v_dep_count bigint;
  v_dep_names text;
  v_pos_tables bigint;
  v_supply_tables bigint;
BEGIN
  -- Any supply/pos/loyalty keys => refuse (domain CHECK restore would be invalid).
  SELECT count(*) INTO v_bad_keys
  FROM public.staff_permissions
  WHERE domain IN ('supply','pos','loyalty') OR key LIKE 'supply.%' OR key LIKE 'pos.%' OR key LIKE 'loyalty.%';
  IF v_bad_keys > 0 THEN
    RAISE EXCEPTION 'MIGRATION_281_ROLLBACK_BLOCKED: % supply/pos/loyalty permission keys exist', v_bad_keys;
  END IF;

  -- Heuristic 275+/281+ markers: pos_* or supply_* tables (excluding none expected pre-274).
  SELECT count(*) INTO v_pos_tables
  FROM information_schema.tables
  WHERE table_schema='public' AND table_name LIKE 'pos\_%';
  SELECT count(*) INTO v_supply_tables
  FROM information_schema.tables
  WHERE table_schema='public' AND table_name LIKE 'supply\_%';
  IF v_pos_tables > 0 OR v_supply_tables > 0 THEN
    RAISE EXCEPTION 'MIGRATION_281_ROLLBACK_BLOCKED: pos_* tables=% supply_* tables=% (275+/281+ markers)', v_pos_tables, v_supply_tables;
  END IF;

  -- No other function depends on core (pg_depend + prosrc safety net).
  SELECT count(*), string_agg(DISTINCT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', ', ')
    INTO v_dep_count, v_dep_names
  FROM pg_depend d
  JOIN pg_proc p ON p.oid = d.objid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE d.refobjid = 'public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
    AND d.deptype IN ('n','a')
    AND p.oid <> 'public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure;
  IF v_dep_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_281_ROLLBACK_BLOCKED: functions depend on inventory_apply_movement_core: %', v_dep_names;
  END IF;

  -- prosrc safety net (catches dynamic/sql-string references not in pg_depend)
  SELECT count(*), string_agg(DISTINCT n.nspname||'.'||p.proname, ', ')
    INTO v_dep_count, v_dep_names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname <> 'inventory_apply_movement_core'
    AND p.proname <> 'inventory_apply_movement'
    AND prosrc ILIKE '%inventory_apply_movement_core%';
  IF v_dep_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_281_ROLLBACK_BLOCKED: prosrc references inventory_apply_movement_core: %', v_dep_names;
  END IF;
END
$pre$;

-- Drop 274 wrapper and core.
DROP FUNCTION IF EXISTS public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.inventory_apply_movement_core(uuid, uuid, uuid, text, numeric, text, numeric, text, uuid);

-- Recreate 269 7-arg function (FOR SHARE version) exactly as live.
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

-- Re-assert ACL to match 268/269 expected state.
REVOKE ALL ON FUNCTION public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric) FROM PUBLIC, anon;
ALTER FUNCTION public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric) TO authenticated, service_role;

-- Restore previous 17-value domain CHECK (safe: fail-closed check above guarantees no supply/pos/loyalty keys).
ALTER TABLE public.staff_permissions DROP CONSTRAINT IF EXISTS staff_permissions_domain_check;
ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_domain_check
  CHECK (domain IN (
    'business','workforce','customers','reservations','products','inventory',
    'orders','finance','reports','analytics','communications',
    'rental','delivery','services','events','hospitality','restaurant'
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';
