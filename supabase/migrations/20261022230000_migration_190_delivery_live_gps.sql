-- migration_190_delivery_live_gps.sql
-- Phase 3: Delivery live GPS ingestion, location breadcrumbs, and real-time transit state.
--
-- 1. Create public.order_delivery_locations table
-- 2. Performance indexes for order-scoped and courier-scoped lookups
-- 3. Row-Level Security: service_role only (enforced via server routes)
-- 4. Automatic pruning trigger: retain only latest location upon terminal order status

BEGIN;

-- ── 1. Create order_delivery_locations table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_delivery_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_worker_id uuid NOT NULL REFERENCES public.business_workers(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
  longitude double precision NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
  accuracy double precision NULL CHECK (accuracy IS NULL OR accuracy >= 0),
  heading double precision NULL CHECK (heading IS NULL OR (heading >= 0.0 AND heading <= 360.0)),
  speed double precision NULL CHECK (speed IS NULL OR speed >= 0),
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.order_delivery_locations IS
  'High-frequency delivery breadcrumb coordinates for active courier deliveries.';

COMMENT ON COLUMN public.order_delivery_locations.accuracy IS
  'Horizontal accuracy radius in meters, as reported by device geolocation.';

COMMENT ON COLUMN public.order_delivery_locations.heading IS
  'Direction of travel in degrees (0 = North, 90 = East, 180 = South, 270 = West).';

COMMENT ON COLUMN public.order_delivery_locations.speed IS
  'Ground speed in meters per second, when available.';

-- ── 2. Performance indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_delivery_locations_order_recorded
  ON public.order_delivery_locations(order_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_delivery_locations_courier
  ON public.order_delivery_locations(courier_worker_id, recorded_at DESC);

-- ── 3. Row-Level Security ───────────────────────────────────────────────────
ALTER TABLE public.order_delivery_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_delivery_locations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_delivery_locations TO service_role;

-- ── 4. Automatic Pruning Trigger on Order Completion ────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_delivery_locations_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.status IN ('delivered', 'completed', 'cancelled')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Retain only the final recorded location for delivery verification/audit
    WITH latest_loc AS (
      SELECT id FROM public.order_delivery_locations
      WHERE order_id = NEW.id
      ORDER BY recorded_at DESC
      LIMIT 1
    )
    DELETE FROM public.order_delivery_locations
    WHERE order_id = NEW.id
      AND id NOT IN (SELECT id FROM latest_loc);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cleanup_delivery_locations ON public.orders;
CREATE TRIGGER trg_cleanup_delivery_locations
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status IN ('delivered', 'completed', 'cancelled'))
EXECUTE FUNCTION public.cleanup_delivery_locations_on_terminal();

COMMIT;
