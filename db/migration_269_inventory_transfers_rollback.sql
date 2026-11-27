-- Rollback for migration 269. Removes the transfer function and the archive guard. Existing transfer ledger rows stay.
DROP TRIGGER IF EXISTS trg_inventory_locations_archive_guard ON public.inventory_locations;
DROP FUNCTION IF EXISTS public.inventory_guard_location_archive();
DROP FUNCTION IF EXISTS public.inventory_transfer_stock(uuid, uuid, uuid, uuid, numeric, text);