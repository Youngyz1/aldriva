-- Migration 192: Dispatch delivery offers when a business accepts an order.
-- This keeps the existing order status model and atomic courier-claim flow.
-- Owner applies SQL manually; this file has not been executed by an agent.

BEGIN;

-- One administrative setting controls the acceptance window. The value is
-- bounded to 1–60 minutes; 10 minutes is the default.
CREATE TABLE IF NOT EXISTS public.courier_dispatch_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  offer_timeout_seconds integer NOT NULL DEFAULT 600
    CHECK (offer_timeout_seconds BETWEEN 60 AND 3600),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.courier_dispatch_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.courier_dispatch_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.courier_dispatch_settings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.courier_dispatch_offer_timeout()
RETURNS interval
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT make_interval(secs => COALESCE(
    (SELECT settings.offer_timeout_seconds
       FROM public.courier_dispatch_settings AS settings
      WHERE settings.id = 1),
    600
  )::double precision)
$function$;

REVOKE ALL ON FUNCTION public.courier_dispatch_offer_timeout()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_dispatch_offer_timeout()
  TO service_role;

-- Offer expiry supports staged fanout. The courier offer feed advances expired
-- cohorts; the acceptance transaction still creates the first durable cohort
-- immediately, without relying on a browser tab to remain open.
ALTER TABLE public.business_courier_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + public.courier_dispatch_offer_timeout());

UPDATE public.business_courier_offers
   SET expires_at = offered_at + public.courier_dispatch_offer_timeout()
 WHERE status = 'offered'
   AND expires_at IS NULL;

ALTER TABLE public.business_courier_offers
  DROP CONSTRAINT IF EXISTS business_courier_offers_status_check;
ALTER TABLE public.business_courier_offers
  ADD CONSTRAINT business_courier_offers_status_check
  CHECK (status IN ('offered', 'accepted', 'declined', 'taken', 'cancelled', 'withdrawn', 'expired'));

CREATE INDEX IF NOT EXISTS idx_business_courier_offers_expiry
  ON public.business_courier_offers(status, expires_at)
  WHERE status = 'offered';

-- A courier may be assigned while the order is accepted/preparing/ready, but
-- still may hold only one delivery at a time.
DO $active_courier_guard$
BEGIN
  IF EXISTS (
    SELECT courier_worker_id
      FROM public.orders
     WHERE courier_worker_id IS NOT NULL
       AND status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
     GROUP BY courier_worker_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION_192_BLOCKED: a courier has multiple active deliveries; resolve assignments before extending the uniqueness constraint';
  END IF;
END;
$active_courier_guard$;

DROP INDEX IF EXISTS public.idx_orders_one_active_order_per_courier;
CREATE UNIQUE INDEX idx_orders_one_active_order_per_courier
  ON public.orders(courier_worker_id)
  WHERE courier_worker_id IS NOT NULL
    AND status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery');

-- The candidate feed intentionally omits the customer's exact destination.
-- The exact address is returned only after the courier wins the atomic claim.
CREATE OR REPLACE VIEW public.business_courier_offer_feed
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  offer.id AS offer_id,
  offer.order_id,
  offer.business_id,
  offer.courier_worker_id,
  offer.offered_at,
  business.name AS pickup_name,
  business.address AS pickup_address,
  NULL::text AS delivery_address,
  o.items,
  CASE
    WHEN o.payment_method = 'on_fulfilment' AND o.payment_status = 'unpaid'
      THEN o.total_amount
    ELSE 0::numeric
  END AS amount_to_collect,
  o.currency,
  o.estimated_ready_at
FROM public.business_courier_offers AS offer
JOIN public.orders AS o
  ON o.id = offer.order_id AND o.business_id = offer.business_id
JOIN public.business_workers AS w
  ON w.id = offer.courier_worker_id AND w.business_id = offer.business_id
JOIN public.businesses AS business ON business.id = offer.business_id
WHERE offer.status = 'offered'
  AND offer.expires_at > clock_timestamp()
  AND o.status IN ('accepted', 'preparing', 'ready')
  AND o.estimated_ready_at IS NOT NULL
  AND o.courier_worker_id IS NULL
  AND o.fulfilment_type = 'delivery'
  AND w.role = 'courier'
  AND w.is_active = true
  AND w.deactivated_at IS NULL
  AND w.is_available = true
  AND EXISTS (
    SELECT 1
      FROM public.business_worker_invitations AS accepted_invitation
     WHERE accepted_invitation.worker_id = w.id
       AND accepted_invitation.accepted_at IS NOT NULL
       AND accepted_invitation.revoked_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.orders AS active_order
     WHERE active_order.courier_worker_id = offer.courier_worker_id
       AND active_order.status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
  );

REVOKE ALL ON public.business_courier_offer_feed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_courier_offer_feed TO service_role;

-- Offers are durable rows written in the same transaction that accepts an
-- order. Repeated triggers do not duplicate open offers. Explicit retries can
-- reopen declined or withdrawn rows without replacing offers still pending.
CREATE OR REPLACE FUNCTION public.dispatch_business_courier_order(
  p_order_id uuid,
  p_reoffer boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_business_id uuid;
  v_open_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT o.business_id
    INTO v_business_id
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.fulfilment_type = 'delivery'
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.estimated_ready_at IS NOT NULL
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;

  IF v_business_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Repeated order edits and trigger invocations must not open another cohort
  -- while the current one still has time to respond. A manager retry explicitly
  -- reopens the current cohort below.
  IF COALESCE(p_reoffer, false) = false THEN
    SELECT count(*)::integer
      INTO v_open_count
      FROM public.business_courier_offers AS offer
     WHERE offer.order_id = p_order_id
       AND offer.business_id = v_business_id
       AND offer.status = 'offered'
       AND offer.expires_at > clock_timestamp();
    IF v_open_count > 0 THEN
      RETURN v_open_count;
    END IF;
  ELSE
    SELECT count(*)::integer
      INTO v_open_count
      FROM public.business_courier_offers AS offer
     WHERE offer.order_id = p_order_id
       AND offer.business_id = v_business_id
       AND offer.status = 'offered'
       AND offer.expires_at > clock_timestamp();
    IF v_open_count > 0 THEN
      RAISE EXCEPTION 'COURIER_DISPATCH_BATCH_STILL_OPEN';
    END IF;

    UPDATE public.business_courier_offers
       SET status = 'withdrawn',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = p_order_id
       AND business_id = v_business_id
       AND status = 'offered';
  END IF;

  INSERT INTO public.business_courier_offers AS existing_offer (
    order_id, business_id, courier_worker_id, status, expires_at
  )
  SELECT order_row.id, order_row.business_id, worker_row.id, 'offered'
    FROM public.business_workers AS worker_row
    JOIN public.orders AS order_row
      ON order_row.id = p_order_id AND order_row.business_id = worker_row.business_id
   WHERE worker_row.business_id = v_business_id
     AND worker_row.role = 'courier'
     AND worker_row.is_active = true
     AND worker_row.deactivated_at IS NULL
     AND worker_row.is_available = true
     AND EXISTS (
       SELECT 1
         FROM public.business_worker_invitations AS accepted_invitation
        WHERE accepted_invitation.worker_id = worker_row.id
          AND accepted_invitation.accepted_at IS NOT NULL
          AND accepted_invitation.revoked_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders AS active_order
        WHERE active_order.courier_worker_id = worker_row.id
          AND active_order.status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
     )
     AND (
       p_reoffer OR NOT EXISTS (
         SELECT 1 FROM public.business_courier_offers AS prior_offer
          WHERE prior_offer.order_id = order_row.id
            AND prior_offer.courier_worker_id = worker_row.id
            AND prior_offer.status <> 'withdrawn'
       )
     )
   ORDER BY worker_row.id
   LIMIT 5
   FOR UPDATE OF worker_row
  ON CONFLICT (order_id, courier_worker_id) DO UPDATE
    SET status = 'offered',
        offered_at = clock_timestamp(),
        expires_at = clock_timestamp() + public.courier_dispatch_offer_timeout(),
        accepted_at = NULL,
        declined_at = NULL,
        decline_message = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp()
  WHERE existing_offer.status = 'withdrawn'
     OR (p_reoffer AND existing_offer.status IN ('declined', 'expired'));

  SELECT count(*)::integer
    INTO v_open_count
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.status = 'offered'
     AND offer.expires_at > clock_timestamp();

  RETURN v_open_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_business_courier_order(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_business_courier_order(uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.advance_business_courier_dispatch()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_order_id uuid;
  v_open_count integer;
  v_advanced integer := 0;
BEGIN
  FOR v_order_id IN
    UPDATE public.business_courier_offers AS offer
       SET status = 'expired',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE offer.status = 'offered'
       AND offer.expires_at <= clock_timestamp()
     RETURNING offer.order_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.business_courier_offers AS still_open
       WHERE still_open.order_id = v_order_id
         AND still_open.status = 'offered'
         AND still_open.expires_at > clock_timestamp()
    ) THEN
      v_open_count := public.dispatch_business_courier_order(v_order_id, false);
      v_advanced := v_advanced + v_open_count;
    END IF;
  END LOOP;

  RETURN v_advanced;
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_business_courier_dispatch()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_business_courier_dispatch()
  TO service_role;

CREATE OR REPLACE FUNCTION public.offer_ready_delivery_couriers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.status IN ('accepted', 'preparing', 'ready')
     AND NEW.fulfilment_type = 'delivery'
     AND NEW.estimated_ready_at IS NOT NULL
     AND NEW.courier_worker_id IS NULL THEN
    PERFORM public.dispatch_business_courier_order(NEW.id, false);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_offer_ready_delivery_insert ON public.orders;
CREATE TRIGGER trg_offer_ready_delivery_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.offer_ready_delivery_couriers();

DROP TRIGGER IF EXISTS trg_offer_ready_delivery_update ON public.orders;
CREATE TRIGGER trg_offer_ready_delivery_update
AFTER UPDATE OF status, estimated_ready_at, fulfilment_type, courier_worker_id ON public.orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.estimated_ready_at IS DISTINCT FROM NEW.estimated_ready_at
  OR OLD.fulfilment_type IS DISTINCT FROM NEW.fulfilment_type
  OR OLD.courier_worker_id IS DISTINCT FROM NEW.courier_worker_id
)
EXECUTE FUNCTION public.offer_ready_delivery_couriers();

-- When a courier comes online, add offers for accepted/preparing deliveries as
-- well as ready ones. Availability-off and deactivation keep the existing
-- withdrawal behavior.
CREATE OR REPLACE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  IF TG_WHEN = 'BEFORE' THEN
    IF NEW.is_active = false OR NEW.deactivated_at IS NOT NULL THEN
      NEW.is_available := false;
      UPDATE public.business_courier_offers
         SET status = 'withdrawn', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE courier_worker_id = NEW.id AND status = 'offered';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE'
     OR NEW.role <> 'courier'
     OR OLD.is_available IS NOT DISTINCT FROM NEW.is_available THEN
    RETURN NEW;
  END IF;

  IF NEW.is_available = false THEN
    UPDATE public.business_courier_offers
       SET status = 'withdrawn', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE courier_worker_id = NEW.id AND status = 'offered';
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM true OR NEW.deactivated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_worker_invitations AS accepted_invitation
     WHERE accepted_invitation.worker_id = NEW.id
       AND accepted_invitation.accepted_at IS NOT NULL
       AND accepted_invitation.revoked_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_order_id IN
    SELECT order_row.id
      FROM public.orders AS order_row
     WHERE order_row.business_id = NEW.business_id
       AND order_row.status IN ('accepted', 'preparing', 'ready')
       AND order_row.fulfilment_type = 'delivery'
       AND order_row.estimated_ready_at IS NOT NULL
       AND order_row.courier_worker_id IS NULL
  LOOP
    PERFORM public.dispatch_business_courier_order(v_order_id, false);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- When a rider completes a delivery, make pending accepted/preparing jobs
-- eligible for a fresh cohort too. Migration 189's completion trigger already
-- covers ready orders.
CREATE OR REPLACE FUNCTION public.dispatch_pending_deliveries_after_courier_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  IF OLD.status NOT IN ('picked_up', 'out_for_delivery')
     OR NEW.status <> 'delivered'
     OR OLD.courier_worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_order_id IN
    SELECT pending_order.id
      FROM public.orders AS pending_order
     WHERE pending_order.business_id = NEW.business_id
       AND pending_order.status IN ('accepted', 'preparing')
       AND pending_order.fulfilment_type = 'delivery'
       AND pending_order.estimated_ready_at IS NOT NULL
       AND pending_order.courier_worker_id IS NULL
     ORDER BY pending_order.created_at, pending_order.id
  LOOP
    PERFORM public.dispatch_business_courier_order(v_order_id, false);
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_pending_deliveries_after_courier_completion()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_pending_deliveries_after_courier_completion()
  TO service_role;

DROP TRIGGER IF EXISTS trg_dispatch_pending_deliveries_after_courier_completion ON public.orders;
CREATE TRIGGER trg_dispatch_pending_deliveries_after_courier_completion
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (
  OLD.status IN ('picked_up', 'out_for_delivery')
  AND NEW.status = 'delivered'
  AND OLD.courier_worker_id IS NOT NULL
)
EXECUTE FUNCTION public.dispatch_pending_deliveries_after_courier_completion();

CREATE OR REPLACE FUNCTION public.claim_business_courier_offer(
  p_order_id uuid,
  p_worker_id uuid,
  p_history_entry jsonb
)
RETURNS TABLE (
  out_order_id uuid,
  out_business_id uuid,
  out_worker_id uuid,
  out_customer_name text,
  out_customer_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_business_id uuid;
  v_worker_business_id uuid;
  v_worker_name text;
  v_worker_phone text;
  v_order_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_offer_id uuid;
  v_current_status text;
BEGIN
  IF p_order_id IS NULL OR p_worker_id IS NULL
     OR p_history_entry IS DISTINCT FROM '{"type":"courier_assigned"}'::jsonb THEN
    RETURN;
  END IF;

  SELECT o.business_id, o.status
    INTO v_business_id, v_current_status
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.fulfilment_type = 'delivery'
     AND o.estimated_ready_at IS NOT NULL
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;
  IF v_business_id IS NULL THEN RETURN; END IF;

  SELECT w.business_id, w.full_name, w.phone
    INTO v_worker_business_id, v_worker_name, v_worker_phone
    FROM public.business_workers AS w
   WHERE w.id = p_worker_id
     AND w.business_id = v_business_id
     AND w.role = 'courier'
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND w.is_available = true
     AND EXISTS (
       SELECT 1 FROM public.business_worker_invitations AS i
        WHERE i.worker_id = w.id AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL
     )
   FOR UPDATE OF w;
  IF v_worker_business_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders AS active_order
     WHERE active_order.courier_worker_id = p_worker_id
       AND active_order.status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
  ) THEN RETURN; END IF;

  SELECT offer.id INTO v_offer_id
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.courier_worker_id = p_worker_id
     AND offer.status = 'offered'
     AND offer.expires_at > clock_timestamp()
   FOR UPDATE OF offer;
  IF v_offer_id IS NULL THEN RETURN; END IF;

  UPDATE public.orders AS o
     SET courier_worker_id = p_worker_id,
         rider_name = left(btrim(v_worker_name), 80),
         rider_phone = left(btrim(v_worker_phone), 32),
         updated_at = clock_timestamp()
   WHERE o.id = p_order_id
     AND o.business_id = v_business_id
     AND o.status = v_current_status
     AND o.courier_worker_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.business_courier_offers AS still_open
        WHERE still_open.order_id = o.id
          AND still_open.courier_worker_id = p_worker_id
          AND still_open.status = 'offered'
     )
  RETURNING o.id, o.business_id, o.customer_name, o.customer_phone
       INTO v_order_id, v_business_id, v_customer_name, v_customer_phone;
  IF v_order_id IS NULL THEN RETURN; END IF;

  UPDATE public.business_courier_offers
     SET status = 'taken', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE order_id = p_order_id AND status = 'offered';

  UPDATE public.business_courier_offers
     SET status = 'accepted', accepted_at = clock_timestamp(), resolved_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_offer_id AND status = 'taken';
  IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_CLAIM_OFFER_RESOLUTION_FAILED'; END IF;

  UPDATE public.business_courier_offers
     SET status = 'withdrawn', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE courier_worker_id = p_worker_id AND order_id <> p_order_id AND status = 'offered';

  RETURN QUERY
  SELECT o.id, o.business_id, p_worker_id, o.customer_name, o.customer_phone
    FROM public.orders AS o
   WHERE o.id = v_order_id
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.courier_worker_id = p_worker_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_business_courier_offer(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_business_courier_offer(uuid, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.decline_business_courier_offer(
  p_order_id uuid,
  p_worker_id uuid,
  p_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_business_id uuid;
BEGIN
  IF p_order_id IS NULL OR p_worker_id IS NULL
     OR char_length(btrim(COALESCE(p_message, ''))) > 300 THEN
    RETURN false;
  END IF;

  SELECT o.business_id INTO v_business_id
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.fulfilment_type = 'delivery'
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;
  IF v_business_id IS NULL THEN RETURN false; END IF;

  UPDATE public.business_courier_offers AS offer
     SET status = 'declined',
         decline_message = NULLIF(btrim(p_message), ''),
         declined_at = clock_timestamp(),
         resolved_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.courier_worker_id = p_worker_id
     AND offer.status = 'offered'
     AND offer.expires_at > clock_timestamp();
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.decline_business_courier_offer(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_business_courier_offer(uuid, uuid, text)
  TO service_role;

-- Keep the existing trigger attachments while replacing availability dispatch
-- behavior. Reinstalling the triggers makes this migration safe if the deployed
-- database has only the trigger definitions from 186/189.
DROP TRIGGER IF EXISTS trg_force_inactive_worker_offline ON public.business_workers;
CREATE TRIGGER trg_force_inactive_worker_offline
BEFORE UPDATE OF is_active, deactivated_at ON public.business_workers
FOR EACH ROW
EXECUTE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries();

DROP TRIGGER IF EXISTS trg_sync_courier_offers_on_availability ON public.business_workers;
CREATE TRIGGER trg_sync_courier_offers_on_availability
AFTER UPDATE OF is_available ON public.business_workers
FOR EACH ROW
WHEN (OLD.is_available IS DISTINCT FROM NEW.is_available)
EXECUTE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries();

NOTIFY pgrst, 'reload schema';
COMMIT;
