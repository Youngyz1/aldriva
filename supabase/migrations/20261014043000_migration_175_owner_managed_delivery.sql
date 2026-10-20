-- migration_175_owner_managed_delivery.sql
-- Owner-managed delivery (delivery fee, delivery statuses, rider details).
-- Files only; review and approve before applying to staging.
--
-- ── A. orders delivery fee and rider columns (additive only) ────────────────
--
-- delivery_fee was introduced by migration 171. IF NOT EXISTS below preserves
-- an existing definition; it does not validate or repair a differently-defined
-- pre-existing column.
-- rider_name and rider_phone are optional order-level snapshots, not a courier
-- roster. Their values are preserved by the rollback.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS rider_name text NULL,
  ADD COLUMN IF NOT EXISTS rider_phone text NULL;

-- Named constraints let a repeated run safely recognize these checks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_rider_name_length_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_rider_name_length_check
      CHECK (rider_name IS NULL OR length(trim(rider_name)) <= 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_rider_phone_length_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_rider_phone_length_check
      CHECK (rider_phone IS NULL OR length(trim(rider_phone)) <= 32);
  END IF;
END;
$$;

COMMENT ON COLUMN public.orders.delivery_fee IS
  'Owner-configured or free-delivery calculated fee snapshot for delivery orders (0 for pickup).';
COMMENT ON COLUMN public.orders.rider_name IS
  'Name of the assigned courier/rider when out for delivery.';
COMMENT ON COLUMN public.orders.rider_phone IS
  'Direct phone number for the assigned courier/rider.';

-- ── B. Extend orders status CHECK constraint ────────────────────────────────
-- Migration 171 defined: pending, accepted, preparing, ready, completed,
-- cancelled. Postgres names that inline constraint orders_status_check.

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

COMMIT;

NOTIFY pgrst, 'reload schema';
