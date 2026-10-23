-- migration_190_delivery_live_gps_rollback.sql
-- Rollback for Phase 3: Delivery live GPS ingestion and location breadcrumbs.

BEGIN;

DROP TRIGGER IF EXISTS trg_cleanup_delivery_locations ON public.orders;
DROP FUNCTION IF EXISTS public.cleanup_delivery_locations_on_terminal();

DROP INDEX IF EXISTS public.idx_order_delivery_locations_courier;
DROP INDEX IF EXISTS public.idx_order_delivery_locations_order_recorded;

DROP TABLE IF EXISTS public.order_delivery_locations CASCADE;

COMMIT;
