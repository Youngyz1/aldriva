-- migration_175_owner_managed_delivery.sql
-- Phase 6: Owner-managed delivery (delivery fee, delivery statuses, rider details).
-- Files only; NOT yet applied.
--
-- ── A. orders delivery fee and rider columns (additive only) ────────────────
--
-- delivery_fee: Stored on public.orders since migration 171 as numeric(12,2) DEFAULT 0.00.
--   Re-verified via ADD COLUMN IF NOT EXISTS to guarantee presence on any partial instance.
-- rider_name: Optional text (max 80 chars) recording the assigned courier/rider.
-- rider_phone: Optional text (max 32 chars) recording the rider contact number.
--
-- Note: delivered_at / out_for_delivery_at columns are NOT added because
-- status_history already records exact transition timestamps and user IDs.

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

-- ── B. Extend orders status CHECK constraint ────────────────────────────────
--
-- Migration 171 defined the column inline:
--   status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'))
-- Postgres automatically generates the constraint name "orders_status_check".
-- Here we drop and recreate the named constraint to add 'out_for_delivery' and 'delivered'.
-- Safe to re-run.

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
