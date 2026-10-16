-- migration_175_owner_managed_delivery_rollback.sql
-- Rollback for Phase 6: Owner-managed delivery.
--
-- 1. Remap active rows in new delivery statuses before restoring the old CHECK constraint:
--    'delivered' -> 'completed'
--    'out_for_delivery' -> 'ready'
--    This prevents the constraint recreation from failing if rows exist in new statuses.
-- 2. Restore the original 6-status CHECK constraint from migration 171.
-- 3. Drop newly added rider columns (delivery_fee was originally created in 171 and remains).

UPDATE public.orders
  SET status = 'completed'
  WHERE status = 'delivered';

UPDATE public.orders
  SET status = 'ready'
  WHERE status = 'out_for_delivery';

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

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS rider_name,
  DROP COLUMN IF EXISTS rider_phone;
