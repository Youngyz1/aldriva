-- Migration 200: fix acceptance-time courier offer creation.
-- Migration 192's dispatch insert named expires_at without supplying its value,
-- causing every eligible order update to fail inside the AFTER trigger.

BEGIN;

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
  -- while the current one still has time to respond. Explicit retries reopen it.
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
  SELECT order_row.id,
         order_row.business_id,
         worker_row.id,
         'offered',
         clock_timestamp() + public.courier_dispatch_offer_timeout()
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

COMMIT;

NOTIFY pgrst, 'reload schema';
