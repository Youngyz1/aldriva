-- migration_281_pos_prerequisites.sql
-- DRAFT ONLY. DO NOT APPLY TO ANY DATABASE WITHOUT OWNER APPROVAL.
--
-- Purpose (POS/supply shared prerequisite, per docs/handoff/pos-design.md §4):
-- 1) Expand staff_permissions.domain CHECK to add supply, pos, loyalty (additive).
-- 2) Replace inventory_apply_movement 7-arg with 9-arg wrapper + internal core.
--
-- Current live sources (VERIFIED, read-only):
-- - staff_permissions_domain_check: db/migration_235_permission_catalogue.sql:159-164
--   17 values: business, workforce, customers, reservations, products, inventory,
--   orders, finance, reports, analytics, communications, rental, delivery,
--   services, events, hospitality, restaurant.
-- - inventory_apply_movement 7-arg: db/migration_269_inventory_transfers.sql:143-221
--   SECURITY DEFINER, SET search_path TO 'pg_catalog','public','pg_temp', FOR SHARE
--   on location row, balance FOR UPDATE, insufficient-stock refusal.
-- - 268 grants: REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role.
-- - 269 used CREATE OR REPLACE on same signature, so 268 ACL remains effective.
--
-- One transaction: partial state is not left behind.
-- Rollback: migration_281_pos_prerequisites_rollback.sql (fail-closed).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Preconditions / ACL assertion (must run before any DROP)
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE
  v_proc regprocedure := 'public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)'::regprocedure;
  v_proacl aclitem[];
  v_owner name;
  v_has_auth boolean;
  v_has_service boolean;
  v_has_anon boolean;
  v_has_public boolean;
  v_domain_def text;
  v_has_supply boolean;
  v_has_pos boolean;
  v_has_loyalty boolean;
BEGIN
  SELECT p.proacl, pg_get_userbyid(p.proowner), pg_get_constraintdef(c.oid)
    INTO v_proacl, v_owner, v_domain_def
    FROM pg_proc p
    LEFT JOIN pg_constraint c
      ON c.conrelid = 'public.staff_permissions'::regclass
     AND c.conname = 'staff_permissions_domain_check'
   WHERE p.oid = v_proc;

  IF v_proacl IS NULL AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc) THEN
    RAISE EXCEPTION 'MIGRATION_281_PRECONDITION: inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric) not found';
  END IF;

  -- Owner assertion (spec states owner postgres). Raise if different to avoid
  -- silently changing ownership assumptions in the core/wrapper chain.
  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'MIGRATION_281_PRECONDITION: expected owner postgres for inventory_apply_movement 7-arg, got %', v_owner;
  END IF;

  -- ACL assertion: authenticated+service_role EXECUTE; no anon, no PUBLIC.
  v_has_auth := has_function_privilege('authenticated', v_proc, 'EXECUTE');
  v_has_service := has_function_privilege('service_role', v_proc, 'EXECUTE');
  v_has_anon := has_function_privilege('anon', v_proc, 'EXECUTE');
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc px, aclexplode(COALESCE(px.proacl, acldefault('f', px.proowner))) a
    WHERE px.oid = v_proc AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) INTO v_has_public;
  IF NOT (v_has_auth AND v_has_service AND NOT v_has_anon AND NOT v_has_public) THEN
    RAISE EXCEPTION 'MIGRATION_281_PRECONDITION: unexpected ACL for inventory_apply_movement 7-arg (auth=%, service_role=%, anon=%, public_exec_via_aclexplode=%, proacl=%)',
      v_has_auth, v_has_service, v_has_anon, v_has_public, v_proacl::text;
  END IF;

  -- Domain CHECK must exist and be the known 17-value shape (additive expansion only).
  IF v_domain_def IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_281_PRECONDITION: staff_permissions_domain_check not found';
  END IF;
  v_has_supply := position('''supply''' in v_domain_def) > 0;
  v_has_pos := position('''pos''' in v_domain_def) > 0;
  v_has_loyalty := position('''loyalty''' in v_domain_def) > 0;
  IF v_has_supply OR v_has_pos OR v_has_loyalty THEN
    RAISE EXCEPTION 'MIGRATION_281_PRECONDITION: staff_permissions_domain_check already contains supply/pos/loyalty: %', v_domain_def;
  END IF;
  -- Guard against replacing a smaller/unknown CHECK: require all 17 known values.
  IF NOT (
    v_domain_def LIKE '%''business''%' AND v_domain_def LIKE '%''workforce''%' AND v_domain_def LIKE '%''customers''%' AND
    v_domain_def LIKE '%''reservations''%' AND v_domain_def LIKE '%''products''%' AND v_domain_def LIKE '%''inventory''%' AND
    v_domain_def LIKE '%''orders''%' AND v_domain_def LIKE '%''finance''%' AND v_domain_def LIKE '%''reports''%' AND
    v_domain_def LIKE '%''analytics''%' AND v_domain_def LIKE '%''communications''%' AND v_domain_def LIKE '%''rental''%' AND
    v_domain_def LIKE '%''delivery''%' AND v_domain_def LIKE '%''services''%' AND v_domain_def LIKE '%''events''%' AND
    v_domain_def LIKE '%''hospitality''%' AND v_domain_def LIKE '%''restaurant''%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_281_PRECONDITION: staff_permissions_domain_check is not the expected 17-value set: %', v_domain_def;
  END IF;
END
$pre$;

-- ---------------------------------------------------------------------------
-- 1) Domain CHECK expansion (17 -> 20, additive, no smaller replacement)
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_domain_check;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_domain_check
  CHECK (domain IN (
    'business','workforce','customers','reservations','products','inventory',
    'orders','finance','reports','analytics','communications',
    'rental','delivery','services','events','hospitality','restaurant',
    'supply','pos','loyalty'
  ));

-- ---------------------------------------------------------------------------
-- 2) Replace inventory_apply_movement 7-arg with core + 9-arg wrapper
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric);

-- 2a) Internal core. No permission check inside core except basic argument/
-- location/item existence and stock invariants. Core verifies location and item
-- belong to p_business_id. Only same-owner SECURITY DEFINER callers should call
-- core; no grants are issued. Explicit REVOKE required due Supabase default
-- privileges granting EXECUTE on new public functions to anon/authenticated/service_role.
CREATE OR REPLACE FUNCTION public.inventory_apply_movement_core(
  p_business_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text DEFAULT NULL::text,
  p_unit_cost numeric DEFAULT NULL::numeric,
  p_reference_type text DEFAULT NULL::text,
  p_reference_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_loc_status text;
  v_loc_business uuid;
  v_item_active boolean;
  v_old numeric;
  v_new numeric;
  v_id uuid;
  v_actor uuid;
BEGIN
  IF p_business_id IS NULL OR p_item_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF p_type IS NULL OR p_type NOT IN (
    'opening','received','returned_in','transfer_in','sold','consumed',
    'transfer_out','returned_out','damaged','expired','lost','adjustment'
  ) THEN
    RAISE EXCEPTION 'Unknown movement type' USING ERRCODE = '23514', HINT = 'inventory_bad_type';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 OR p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'Quantity must be non-zero with at most 3 decimals' USING ERRCODE = '23514', HINT = 'inventory_bad_quantity';
  END IF;
  IF (p_type IN ('opening','received','returned_in','transfer_in') AND p_quantity < 0)
     OR (p_type IN ('sold','consumed','transfer_out','returned_out','damaged','expired','lost') AND p_quantity > 0) THEN
    RAISE EXCEPTION 'Quantity sign does not match the movement type' USING ERRCODE = '23514', HINT = 'inventory_bad_sign';
  END IF;

  -- Actor: always recorded from auth.uid() inside this SECURITY DEFINER function.
  v_actor := auth.uid();

  -- Location must belong to p_business_id (explicit check).
  SELECT l.status, l.business_id INTO v_loc_status, v_loc_business
    FROM public.inventory_locations l
   WHERE l.id = p_location_id
   FOR SHARE;
  IF NOT FOUND OR v_loc_business IS DISTINCT FROM p_business_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF v_loc_status <> 'active' THEN
    RAISE EXCEPTION 'Location is archived' USING ERRCODE = '23514', HINT = 'inventory_location_archived';
  END IF;

  -- Item must belong to p_business_id (269 behaviour): missing or other-business => item_not_found.
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
    (business_id, item_id, location_id, movement_type, quantity, balance_after, unit_cost, reason, reference_type, reference_id, created_by)
  VALUES
    (p_business_id, p_item_id, p_location_id, p_type, p_quantity, v_new, p_unit_cost, p_reason, p_reference_type, p_reference_id, v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

ALTER FUNCTION public.inventory_apply_movement_core(
  uuid, uuid, uuid, text, numeric, text, numeric, text, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.inventory_apply_movement_core(
  uuid, uuid, uuid, text, numeric, text, numeric, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- 2b) Public wrapper. Preserves existing permission gate and 7-arg call shape
-- via defaults. Only allow-listed reference types; POS/supply reserved refs are core-only.
CREATE OR REPLACE FUNCTION public.inventory_apply_movement(
  p_business_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text DEFAULT NULL::text,
  p_unit_cost numeric DEFAULT NULL::numeric,
  p_reference_type text DEFAULT NULL::text,
  p_reference_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_branch uuid;
  v_allowed text[] := ARRAY['manual','adjustment','count','correction','damage','expiry','return','opening','legacy'];
BEGIN
  IF p_reference_type IS NOT NULL AND NOT (p_reference_type = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Reference type not allowed on public inventory_apply_movement wrapper'
      USING ERRCODE = '42501', HINT = 'inventory_reference_forbidden';
  END IF;

  SELECT l.branch_id INTO v_branch
    FROM public.inventory_locations l
   WHERE l.id = p_location_id AND l.business_id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL AND public.inventory_can_manage(p_business_id, v_branch)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;

  RETURN public.inventory_apply_movement_core(
    p_business_id, p_item_id, p_location_id, p_type, p_quantity, p_reason, p_unit_cost,
    p_reference_type, p_reference_id
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.inventory_apply_movement(
  uuid, uuid, uuid, text, numeric, text, numeric, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.inventory_apply_movement(
  uuid, uuid, uuid, text, numeric, text, numeric, text, uuid
) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.inventory_apply_movement(
  uuid, uuid, uuid, text, numeric, text, numeric, text, uuid
) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
