-- NEVER run on production.
-- Staging-only cleanup for migration 186. This clears every courier offer,
-- registered-courier assignment, and availability toggle so rollback can run.
--
-- Before executing, independently confirm the connected project is staging,
-- then execute this script as one unit. SET LOCAL is scoped to this transaction.
-- Existing migration-175 rider_name/rider_phone snapshots are preserved.

BEGIN;
SET LOCAL aldriva.target_environment = 'staging';

DO $staging_guard$
BEGIN
  IF current_setting('aldriva.target_environment', true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'STAGING_CLEANUP_BLOCKED: set aldriva.target_environment=staging only after confirming the staging project';
  END IF;
END;
$staging_guard$;

UPDATE public.business_courier_offers
   SET status = CASE WHEN status = 'offered' THEN 'cancelled' ELSE status END,
       resolved_at = COALESCE(resolved_at, clock_timestamp()),
       updated_at = clock_timestamp();

UPDATE public.orders
   SET courier_worker_id = NULL,
       updated_at = clock_timestamp()
 WHERE courier_worker_id IS NOT NULL;

UPDATE public.business_workers
   SET is_available = false,
       updated_at = clock_timestamp()
 WHERE is_available = true;

DELETE FROM public.business_courier_offers;

COMMIT;

-- Expected after cleanup: 0 assigned orders, 0 available workers, 0 offers.
SELECT
  (SELECT count(*) FROM public.orders WHERE courier_worker_id IS NOT NULL) AS assigned_orders,
  (SELECT count(*) FROM public.business_workers WHERE is_available = true) AS available_workers,
  (SELECT count(*) FROM public.business_courier_offers) AS offers;
