-- 20261014043000_migration_175_owner_managed_delivery.sql
-- Mirror of db/migration_175_owner_managed_delivery.sql
-- Additive delivery fee, rider details, and extended order status CHECK constraint.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS rider_name text NULL CHECK (rider_name IS NULL OR length(trim(rider_name)) <= 80),
  ADD COLUMN IF NOT EXISTS rider_phone text NULL CHECK (rider_phone IS NULL OR length(trim(rider_phone)) <= 32);

COMMENT ON COLUMN public.orders.delivery_fee IS
  'Owner-configured or free-delivery calculated fee snapshot for delivery orders (0 for pickup).';
COMMENT ON COLUMN public.orders.rider_name IS
  'Name of the assigned courier/rider when out for delivery.';
COMMENT ON COLUMN public.orders.rider_phone IS
  'Direct phone number for the assigned courier/rider.';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled'
  ));
