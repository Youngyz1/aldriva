-- Rollback for migration 268. WARNING: destroys all inventory data (items, locations, balances, movements).
DROP FUNCTION IF EXISTS public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric);
DROP FUNCTION IF EXISTS public.inventory_ensure_default_location(uuid);
DROP TABLE IF EXISTS public.inventory_movements;
DROP TABLE IF EXISTS public.inventory_balances;
DROP TABLE IF EXISTS public.inventory_locations;
DROP TABLE IF EXISTS public.inventory_items;
DROP FUNCTION IF EXISTS public.inventory_guard_owner();
DROP FUNCTION IF EXISTS public.inventory_can_view_catalog(uuid);
DROP FUNCTION IF EXISTS public.inventory_can_view(uuid, uuid);
DROP FUNCTION IF EXISTS public.inventory_can_manage(uuid, uuid);
