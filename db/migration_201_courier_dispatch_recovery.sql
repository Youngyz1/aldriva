-- Migration 201: dispatch delivery offers on acceptance without requiring an
-- estimate, fan out to all eligible couriers, and refresh unclaimed offers at READY.
-- Owner applies SQL manually; do not run from an agent.

BEGIN;

-- ASAP offers do not expire before the kitchen marks them ready (or a courier
-- claims/declines them). Scheduled offers expire two hours after their pickup
-- time, with the response timeout as a floor for near/past schedule times.
ALTER TABLE public.business_courier_offers
  ALTER COLUMN expires_at DROP NOT NULL;

COMMENT ON COLUMN public.business_courier_offers.expires_at IS
  'NULL means an ASAP offer stays open until it is claimed, declined, or its order becomes ineligible. Scheduled offers use a bounded pickup window.';

CREATE OR REPLACE FUNCTION public.courier_dispatch_offer_expiry(
  p_scheduled_for timestamptz,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE
    WHEN p_scheduled_for IS NULL THEN NULL::timestamptz
    ELSE GREATEST(
      p_scheduled_for + interval '2 hours',
      p_now + public.courier_dispatch_offer_timeout()
    )
  END
$function$;

REVOKE ALL ON FUNCTION public.courier_dispatch_offer_expiry(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_dispatch_offer_expiry(timestamptz, timestamptz)
  TO service_role;

-- Migration 200 corrected the INSERT arity but retained an ETA gate and a
-- five-courier cap. Dispatch is now idempotent and has no fanout limit.
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
  v_scheduled_for timestamptz;
  v_open_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT o.business_id, o.scheduled_for
    INTO v_business_id, v_scheduled_for
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.fulfilment_type = 'delivery'
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;

  IF v_business_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Repeated triggers fill any newly eligible courier rows but conflict with
  -- existing offers without refreshing them. Explicit retries only reopen
  -- expired/withdrawn rows; a declined courier stays hidden for this order.
  IF COALESCE(p_reoffer, false) THEN
    SELECT count(*)::integer
      INTO v_open_count
      FROM public.business_courier_offers AS offer
     WHERE offer.order_id = p_order_id
       AND offer.business_id = v_business_id
       AND offer.status = 'offered'
        AND (offer.expires_at IS NULL OR offer.expires_at > clock_timestamp());
    IF v_open_count > 0 THEN
      RAISE EXCEPTION 'COURIER_DISPATCH_BATCH_STILL_OPEN';
    END IF;

    UPDATE public.business_courier_offers
       SET status = 'expired',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = p_order_id
       AND business_id = v_business_id
       AND status = 'offered'
       AND expires_at <= clock_timestamp();
  END IF;

  INSERT INTO public.business_courier_offers AS existing_offer (
    order_id, business_id, courier_worker_id, status, expires_at
  )
  SELECT order_row.id,
         order_row.business_id,
         worker_row.id,
         'offered',
         public.courier_dispatch_offer_expiry(order_row.scheduled_for)
    FROM public.business_workers AS worker_row
    JOIN public.orders AS order_row
      ON order_row.id = p_order_id
     AND order_row.business_id = worker_row.business_id
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
   ORDER BY worker_row.id
   FOR UPDATE OF worker_row
  ON CONFLICT (order_id, courier_worker_id) DO UPDATE
    SET status = 'offered',
        offered_at = clock_timestamp(),
        expires_at = public.courier_dispatch_offer_expiry(v_scheduled_for),
        accepted_at = NULL,
        declined_at = NULL,
        decline_message = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp()
  WHERE existing_offer.status IN ('withdrawn', 'expired');

  SELECT count(*)::integer
    INTO v_open_count
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.status = 'offered'
     AND (offer.expires_at IS NULL OR offer.expires_at > clock_timestamp());

  RETURN v_open_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_business_courier_order(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_business_courier_order(uuid, boolean)
  TO service_role;

-- Keep the courier feed service-only. The appended schedule/status fields let
-- /courier show an ASAP, scheduled, estimated, or ready-now message explicitly.
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
  o.estimated_ready_at,
  o.scheduled_for,
  o.status AS order_status
FROM public.business_courier_offers AS offer
JOIN public.orders AS o
  ON o.id = offer.order_id AND o.business_id = offer.business_id
JOIN public.business_workers AS w
  ON w.id = offer.courier_worker_id AND w.business_id = offer.business_id
JOIN public.businesses AS business ON business.id = offer.business_id
WHERE offer.status = 'offered'
  AND (offer.expires_at IS NULL OR offer.expires_at > clock_timestamp())
  AND o.status IN ('accepted', 'preparing', 'ready')
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
    SELECT 1
      FROM public.orders AS active_order
     WHERE active_order.courier_worker_id = offer.courier_worker_id
       AND active_order.status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
  );

REVOKE ALL ON public.business_courier_offer_feed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_courier_offer_feed TO service_role;

-- Preserve the row-lock claim protocol while removing the hard ETA dependency.
-- The order lock serializes contenders; only the first can set courier_worker_id.
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
     AND (offer.expires_at IS NULL OR offer.expires_at > clock_timestamp())
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
     AND (offer.expires_at IS NULL OR offer.expires_at > clock_timestamp());
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.decline_business_courier_offer(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_business_courier_offer(uuid, uuid, text)
  TO service_role;

-- READY is a new in-app alert point. Refresh active/expired/withdrawn offers
-- for still-eligible couriers, preserve declines, and include any new eligible
-- couriers. A claimed order is left to the winner's assigned-order feed.
CREATE OR REPLACE FUNCTION public.refresh_business_courier_offers_on_ready(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_business_id uuid;
  v_scheduled_for timestamptz;
  v_open_count integer := 0;
BEGIN
  SELECT o.business_id, o.scheduled_for
    INTO v_business_id, v_scheduled_for
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status = 'ready'
     AND o.fulfilment_type = 'delivery'
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;

  IF v_business_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.business_courier_offers AS existing_offer (
    order_id, business_id, courier_worker_id, status, expires_at
  )
  SELECT order_row.id,
         order_row.business_id,
         worker_row.id,
         'offered',
         public.courier_dispatch_offer_expiry(order_row.scheduled_for)
    FROM public.business_workers AS worker_row
    JOIN public.orders AS order_row
      ON order_row.id = p_order_id
     AND order_row.business_id = worker_row.business_id
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
     AND NOT EXISTS (
       SELECT 1
         FROM public.business_courier_offers AS prior_offer
        WHERE prior_offer.order_id = order_row.id
          AND prior_offer.courier_worker_id = worker_row.id
          AND prior_offer.status NOT IN ('offered', 'expired', 'withdrawn')
     )
   ORDER BY worker_row.id
   FOR UPDATE OF worker_row
  ON CONFLICT (order_id, courier_worker_id) DO UPDATE
    SET status = 'offered',
        offered_at = clock_timestamp(),
        expires_at = public.courier_dispatch_offer_expiry(v_scheduled_for),
        accepted_at = NULL,
        declined_at = NULL,
        decline_message = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp()
  WHERE existing_offer.status IN ('offered', 'expired', 'withdrawn');

  SELECT count(*)::integer
    INTO v_open_count
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.status = 'offered'
     AND (offer.expires_at IS NULL OR offer.expires_at > clock_timestamp());

  RETURN v_open_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_business_courier_offers_on_ready(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_business_courier_offers_on_ready(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_refresh_business_courier_offers_on_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.refresh_business_courier_offers_on_ready(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_refresh_business_courier_offers_on_ready()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_refresh_business_courier_offers_on_ready()
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
     AND NEW.courier_worker_id IS NULL THEN
    PERFORM public.dispatch_business_courier_order(NEW.id, false);
  END IF;
  RETURN NEW;
END;
$function$;

-- Expired cohorts reoffer only to currently eligible workers. DISTINCT order
-- ids ensure one order is processed once even when several offers expired.
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
    WITH expired_offers AS (
      UPDATE public.business_courier_offers AS offer
         SET status = 'expired',
             resolved_at = clock_timestamp(),
             updated_at = clock_timestamp()
       WHERE offer.status = 'offered'
         AND offer.expires_at IS NOT NULL
         AND offer.expires_at <= clock_timestamp()
       RETURNING offer.order_id
    )
    SELECT DISTINCT expired_offers.order_id
      FROM expired_offers
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.business_courier_offers AS still_open
       WHERE still_open.order_id = v_order_id
         AND still_open.status = 'offered'
         AND (still_open.expires_at IS NULL OR still_open.expires_at > clock_timestamp())
    ) THEN
      v_open_count := public.dispatch_business_courier_order(v_order_id, true);
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

-- An eligible courier coming online may receive any accepted/preparing/ready
-- delivery that has not been claimed, regardless of whether an ETA was set.
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
       AND order_row.courier_worker_id IS NULL
  LOOP
    PERFORM public.dispatch_business_courier_order(v_order_id, false);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- A completed delivery can free a courier for still-unclaimed orders. No ETA
-- field is required for these orders to receive dispatch offers.
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

DROP TRIGGER IF EXISTS trg_refresh_business_courier_offers_on_ready ON public.orders;
CREATE TRIGGER trg_refresh_business_courier_offers_on_ready
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ready')
EXECUTE FUNCTION public.trigger_refresh_business_courier_offers_on_ready();

NOTIFY pgrst, 'reload schema';
COMMIT;
