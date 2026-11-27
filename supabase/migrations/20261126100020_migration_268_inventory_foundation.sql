-- Migration 268: inventory foundation (items, locations, balances, movement ledger)
-- Industry-independent. Every row is scoped to a business; stock sits in locations (optionally tied to a branch).
-- Write path: ONLY public.inventory_apply_movement() changes balances and movements. authenticated has SELECT only on both.
-- Catalog and locations: INSERT/UPDATE only (no DELETE). Items are deactivated, never deleted.
-- Apply statement by statement. No BEGIN/COMMIT. Every statement is idempotent.

-- STATEMENT 0: PREFLIGHT (read-only). Expect ok = true on every row except the last (info).
SELECT 'business_branches unique (id, business_id)' AS check_name, EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.business_branches'::regclass AND contype='u' AND conname='business_branches_id_business_id_key') AS ok
UNION ALL SELECT 'businesses exists', to_regclass('public.businesses') IS NOT NULL
UNION ALL SELECT 'staff_has_permission exists', to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NOT NULL
UNION ALL SELECT 'is_staff_branch_manager exists', to_regprocedure('public.is_staff_branch_manager(uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'is_entity_member exists', to_regprocedure('public.is_entity_member(uuid,text[])') IS NOT NULL
UNION ALL SELECT 'staff_resolve_business_organizer exists', to_regprocedure('public.staff_resolve_business_organizer(uuid)') IS NOT NULL
UNION ALL SELECT 'staff_touch_updated_at exists', to_regprocedure('public.staff_touch_updated_at()') IS NOT NULL
UNION ALL SELECT 'inventory.view and inventory.manage keys exist', (SELECT count(*) FROM public.staff_permissions WHERE key IN ('inventory.view','inventory.manage')) = 2
UNION ALL SELECT 'info: inventory_items already exists (false on first run)', to_regclass('public.inventory_items') IS NOT NULL;

-- STATEMENT 1: tables
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  barcode text,
  category text,
  description text,
  item_type text NOT NULL DEFAULT 'supply',
  unit text NOT NULL DEFAULT 'piece',
  cost_price numeric(14,4),
  selling_price numeric(14,4),
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  reorder_quantity numeric(14,3),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_id_business_key UNIQUE (id, business_id),
  CONSTRAINT inventory_items_name_check CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT inventory_items_sku_check CHECK (sku IS NULL OR char_length(sku) BETWEEN 1 AND 64),
  CONSTRAINT inventory_items_barcode_check CHECK (barcode IS NULL OR char_length(barcode) BETWEEN 1 AND 64),
  CONSTRAINT inventory_items_category_check CHECK (category IS NULL OR char_length(category) <= 100),
  CONSTRAINT inventory_items_description_check CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT inventory_items_type_check CHECK (item_type IN ('product','raw_material','supply','packaging','asset','spare_part','internal')),
  CONSTRAINT inventory_items_unit_check CHECK (char_length(unit) BETWEEN 1 AND 30),
  CONSTRAINT inventory_items_cost_check CHECK (cost_price IS NULL OR cost_price >= 0),
  CONSTRAINT inventory_items_price_check CHECK (selling_price IS NULL OR selling_price >= 0),
  CONSTRAINT inventory_items_min_check CHECK (min_stock >= 0),
  CONSTRAINT inventory_items_reorder_check CHECK (reorder_quantity IS NULL OR reorder_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_locations_id_business_key UNIQUE (id, business_id),
  CONSTRAINT inventory_locations_name_check CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT inventory_locations_status_check CHECK (status IN ('active','archived')),
  CONSTRAINT inventory_locations_branch_fk FOREIGN KEY (branch_id, business_id) REFERENCES public.business_branches (id, business_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_balances (
  item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  business_id uuid NOT NULL,
  on_hand numeric(14,3) NOT NULL DEFAULT 0,
  reserved numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, location_id),
  CONSTRAINT inventory_balances_on_hand_check CHECK (on_hand >= 0),
  CONSTRAINT inventory_balances_reserved_check CHECK (reserved >= 0),
  CONSTRAINT inventory_balances_item_fk FOREIGN KEY (item_id, business_id) REFERENCES public.inventory_items (id, business_id) ON DELETE CASCADE,
  CONSTRAINT inventory_balances_location_fk FOREIGN KEY (location_id, business_id) REFERENCES public.inventory_locations (id, business_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  balance_after numeric(14,3) NOT NULL,
  unit_cost numeric(14,4),
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_type_sign_check CHECK (
    (movement_type IN ('opening','received','returned_in','transfer_in') AND quantity > 0)
    OR (movement_type IN ('sold','consumed','transfer_out','returned_out','damaged','expired','lost') AND quantity < 0)
    OR (movement_type = 'adjustment' AND quantity <> 0)
  ),
  CONSTRAINT inventory_movements_balance_check CHECK (balance_after >= 0),
  CONSTRAINT inventory_movements_cost_check CHECK (unit_cost IS NULL OR unit_cost >= 0),
  CONSTRAINT inventory_movements_reason_check CHECK (reason IS NULL OR char_length(reason) <= 500),
  CONSTRAINT inventory_movements_item_fk FOREIGN KEY (item_id, business_id) REFERENCES public.inventory_items (id, business_id) ON DELETE CASCADE,
  CONSTRAINT inventory_movements_location_fk FOREIGN KEY (location_id, business_id) REFERENCES public.inventory_locations (id, business_id) ON DELETE CASCADE
);

-- STATEMENT 2: indexes
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_business_sku_uidx ON public.inventory_items (business_id, lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_business_active_idx ON public.inventory_items (business_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_business_name_uidx ON public.inventory_locations (business_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_one_default_uidx ON public.inventory_locations (business_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS inventory_balances_business_location_idx ON public.inventory_balances (business_id, location_id);
CREATE INDEX IF NOT EXISTS inventory_movements_business_created_idx ON public.inventory_movements (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_item_created_idx ON public.inventory_movements (item_id, created_at DESC);

-- STATEMENT 3: access helper functions (invoker; branch-aware; same pattern as the 266 policies)
CREATE OR REPLACE FUNCTION public.inventory_can_manage(p_business_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
  SELECT public.is_entity_member(public.staff_resolve_business_organizer(p_business_id), ARRAY['owner','admin','manager'])
      OR public.is_staff_branch_manager(p_business_id, p_branch_id)
      OR public.staff_has_permission(p_business_id, 'inventory.manage', p_branch_id);
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_can_view(p_business_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
  SELECT public.inventory_can_manage(p_business_id, p_branch_id)
      OR public.staff_has_permission(p_business_id, 'inventory.view', p_branch_id);
$fn$;

-- The catalog is business-wide: readable by anyone who can view stock business-wide or at any location.
CREATE OR REPLACE FUNCTION public.inventory_can_view_catalog(p_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
  SELECT public.inventory_can_view(p_business_id, NULL)
      OR EXISTS (SELECT 1 FROM public.inventory_locations l
                  WHERE l.business_id = p_business_id
                    AND public.inventory_can_view(l.business_id, l.branch_id));
$fn$;

-- STATEMENT 4: guard and updated_at triggers
CREATE OR REPLACE FUNCTION public.inventory_guard_owner()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'A record cannot be moved to another business'
      USING ERRCODE = '23514', HINT = 'inventory_immutable_owner';
  END IF;
  RETURN NEW;
END
$fn$;

DO $trg$
BEGIN
  DROP TRIGGER IF EXISTS trg_inventory_items_guard ON public.inventory_items;
  CREATE TRIGGER trg_inventory_items_guard BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_owner();
  DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
  CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.staff_touch_updated_at();
  DROP TRIGGER IF EXISTS trg_inventory_locations_guard ON public.inventory_locations;
  CREATE TRIGGER trg_inventory_locations_guard BEFORE UPDATE ON public.inventory_locations
    FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_owner();
  DROP TRIGGER IF EXISTS trg_inventory_locations_updated_at ON public.inventory_locations;
  CREATE TRIGGER trg_inventory_locations_updated_at BEFORE UPDATE ON public.inventory_locations
    FOR EACH ROW EXECUTE FUNCTION public.staff_touch_updated_at();
END
$trg$;

-- STATEMENT 5: the stock function (the ONLY writer of balances and movements)
CREATE OR REPLACE FUNCTION public.inventory_apply_movement(
  p_business_id uuid, p_item_id uuid, p_location_id uuid,
  p_type text, p_quantity numeric,
  p_reason text DEFAULT NULL, p_unit_cost numeric DEFAULT NULL)
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
   WHERE l.id = p_location_id AND l.business_id = p_business_id;
  IF NOT FOUND THEN
    -- same error as a permission failure, so ids cannot be probed
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

-- Creates the business's default storage location on first use (idempotent, race-safe).
CREATE OR REPLACE FUNCTION public.inventory_ensure_default_location(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL AND public.inventory_can_manage(p_business_id, NULL)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501', HINT = 'inventory_forbidden';
  END IF;
  SELECT id INTO v_id FROM public.inventory_locations WHERE business_id = p_business_id AND is_default;
  IF v_id IS NULL THEN
    INSERT INTO public.inventory_locations (business_id, name, is_default)
    VALUES (p_business_id, 'Main storage', true)
    ON CONFLICT DO NOTHING;
    SELECT id INTO v_id FROM public.inventory_locations WHERE business_id = p_business_id AND is_default;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Could not create the default location (a location named Main storage already exists)' USING ERRCODE = '23514', HINT = 'inventory_default_location_conflict';
    END IF;
  END IF;
  RETURN v_id;
END
$fn$;

-- STATEMENT 6: RLS and privileges (anon nothing; authenticated cannot write balances or movements)
DO $priv$
BEGIN
  ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON public.inventory_items, public.inventory_locations, public.inventory_balances, public.inventory_movements FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.inventory_items TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.inventory_locations TO authenticated;
  GRANT SELECT ON public.inventory_balances TO authenticated;
  GRANT SELECT ON public.inventory_movements TO authenticated;
  GRANT ALL ON public.inventory_items, public.inventory_locations, public.inventory_balances, public.inventory_movements TO service_role;

  REVOKE ALL ON FUNCTION public.inventory_can_manage(uuid, uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.inventory_can_view(uuid, uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.inventory_can_view_catalog(uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.inventory_ensure_default_location(uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.inventory_guard_owner() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.inventory_can_manage(uuid, uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.inventory_can_view(uuid, uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.inventory_can_view_catalog(uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.inventory_ensure_default_location(uuid) TO authenticated, service_role;
END
$priv$;

-- STATEMENT 7: policies
DO $pol$
BEGIN
  DROP POLICY IF EXISTS inventory_items_select ON public.inventory_items;
  CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated
    USING (public.inventory_can_view_catalog(business_id));
  DROP POLICY IF EXISTS inventory_items_insert ON public.inventory_items;
  CREATE POLICY inventory_items_insert ON public.inventory_items FOR INSERT TO authenticated
    WITH CHECK (public.inventory_can_manage(business_id, NULL));
  DROP POLICY IF EXISTS inventory_items_update ON public.inventory_items;
  CREATE POLICY inventory_items_update ON public.inventory_items FOR UPDATE TO authenticated
    USING (public.inventory_can_manage(business_id, NULL))
    WITH CHECK (public.inventory_can_manage(business_id, NULL));

  DROP POLICY IF EXISTS inventory_locations_select ON public.inventory_locations;
  CREATE POLICY inventory_locations_select ON public.inventory_locations FOR SELECT TO authenticated
    USING (public.inventory_can_view(business_id, branch_id));
  DROP POLICY IF EXISTS inventory_locations_insert ON public.inventory_locations;
  CREATE POLICY inventory_locations_insert ON public.inventory_locations FOR INSERT TO authenticated
    WITH CHECK (public.inventory_can_manage(business_id, branch_id)
                AND (NOT is_default OR public.inventory_can_manage(business_id, NULL)));
  DROP POLICY IF EXISTS inventory_locations_update ON public.inventory_locations;
  CREATE POLICY inventory_locations_update ON public.inventory_locations FOR UPDATE TO authenticated
    USING (public.inventory_can_manage(business_id, branch_id))
    WITH CHECK (public.inventory_can_manage(business_id, branch_id)
                AND (NOT is_default OR public.inventory_can_manage(business_id, NULL)));

  DROP POLICY IF EXISTS inventory_balances_select ON public.inventory_balances;
  CREATE POLICY inventory_balances_select ON public.inventory_balances FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.inventory_locations l
                    WHERE l.id = inventory_balances.location_id
                      AND l.business_id = inventory_balances.business_id
                      AND public.inventory_can_view(l.business_id, l.branch_id)));

  DROP POLICY IF EXISTS inventory_movements_select ON public.inventory_movements;
  CREATE POLICY inventory_movements_select ON public.inventory_movements FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.inventory_locations l
                    WHERE l.id = inventory_movements.location_id
                      AND l.business_id = inventory_movements.business_id
                      AND public.inventory_can_view(l.business_id, l.branch_id)));
END
$pol$;
