-- migration_175_rollback.sql
-- Non-destructive status rollback for migration 175.
--
-- This rollback intentionally retains delivery_fee, rider_name, rider_phone,
-- and their checks. delivery_fee predates migration 175, and the rider fields
-- may contain data after deployment. No column or row data is dropped or
-- rewritten here.
--
-- If any current order uses out_for_delivery or delivered, the guard aborts
-- before changing the constraint. Review/export those orders, resolve each
-- status through an approved operational decision, then retry. Do not silently
-- map delivered to completed or out_for_delivery to ready: that loses the
-- delivery-specific state.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE status IN ('out_for_delivery', 'delivered')
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_175_ROLLBACK_BLOCKED: orders still use out_for_delivery or delivered; review and resolve them before retrying';
  END IF;
END;
$$;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'preparing',
    'ready',
    'completed',
    'cancelled'
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';
