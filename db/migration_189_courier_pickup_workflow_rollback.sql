-- migration_189_courier_pickup_workflow_rollback.sql
-- Rollback for Phase 2 courier pickup workflow.
--
-- Safety guard: Aborts if any orders are currently in 'picked_up' status.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE status = 'picked_up'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION_189_ROLLBACK_BLOCKED: orders still use picked_up; review and resolve them before retrying';
  END IF;
END;
$$;

-- ── 1. Revert orders status CHECK constraint ────────────────────────────────
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

-- ── 2. Drop delivery_issue column ───────────────────────────────────────────
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS delivery_issue;

-- ── 3. Revert active delivery unique constraint ─────────────────────────────
DROP INDEX IF EXISTS public.idx_orders_one_active_order_per_courier;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_order_per_courier
  ON public.orders(courier_worker_id)
  WHERE courier_worker_id IS NOT NULL AND status = 'out_for_delivery';

-- ── 4. Revert business_courier_offer_feed view to migration 186 ─────────────
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
  o.delivery_address,
  o.items,
  CASE
    WHEN o.payment_method = 'on_fulfilment' AND o.payment_status = 'unpaid'
      THEN o.total_amount
    ELSE 0::numeric
  END AS amount_to_collect,
  o.currency
FROM public.business_courier_offers AS offer
JOIN public.orders AS o
  ON o.id = offer.order_id AND o.business_id = offer.business_id
JOIN public.business_workers AS w
  ON w.id = offer.courier_worker_id AND w.business_id = offer.business_id
JOIN public.businesses AS business ON business.id = offer.business_id
WHERE offer.status = 'offered'
  AND o.status = 'ready'
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
       AND active_order.status = 'out_for_delivery'
  );

REVOKE ALL ON public.business_courier_offer_feed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_courier_offer_feed TO service_role;

-- ── 5. Revert functions to migration 186 definitions ────────────────────────
CREATE OR REPLACE FUNCTION public.offer_ready_delivery_couriers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.status <> 'ready'
     OR NEW.fulfilment_type <> 'delivery'
     OR NEW.business_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.business_courier_offers AS existing_offer (
    order_id, business_id, courier_worker_id, status
  )
  SELECT NEW.id, NEW.business_id, w.id, 'offered'
    FROM public.business_workers AS w
   WHERE w.business_id = NEW.business_id
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
        WHERE active_order.courier_worker_id = w.id
          AND active_order.status = 'out_for_delivery'
     )
   FOR UPDATE OF w
  ON CONFLICT (order_id, courier_worker_id) DO UPDATE
    SET status = 'offered',
        offered_at = clock_timestamp(),
        accepted_at = NULL,
        declined_at = NULL,
        decline_message = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp()
  WHERE existing_offer.status = 'withdrawn';

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF TG_WHEN = 'BEFORE' THEN
    IF NEW.is_active = false OR NEW.deactivated_at IS NOT NULL THEN
      NEW.is_available := false;
      UPDATE public.business_courier_offers
         SET status = 'withdrawn',
             resolved_at = clock_timestamp(),
             updated_at = clock_timestamp()
       WHERE courier_worker_id = NEW.id
         AND status = 'offered';
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
       SET status = 'withdrawn',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE courier_worker_id = NEW.id
       AND status = 'offered';
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM true
     OR NEW.deactivated_at IS NOT NULL
     OR NEW.is_available IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.business_worker_invitations AS accepted_invitation
     WHERE accepted_invitation.worker_id = NEW.id
       AND accepted_invitation.accepted_at IS NOT NULL
       AND accepted_invitation.revoked_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.business_courier_offers AS existing_offer (
    order_id, business_id, courier_worker_id, status
  )
  SELECT ready_order.id, ready_order.business_id, NEW.id, 'offered'
    FROM public.orders AS ready_order
   WHERE ready_order.business_id = NEW.business_id
     AND ready_order.status = 'ready'
     AND ready_order.fulfilment_type = 'delivery'
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders AS active_order
        WHERE active_order.courier_worker_id = NEW.id
          AND active_order.status = 'out_for_delivery'
     )
  ON CONFLICT (order_id, courier_worker_id) DO UPDATE
    SET status = 'offered',
        offered_at = clock_timestamp(),
        accepted_at = NULL,
        declined_at = NULL,
        decline_message = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp()
  WHERE existing_offer.status = 'withdrawn';

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_courier_offers_on_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'out_for_delivery' THEN
    UPDATE public.business_courier_offers
       SET status = 'taken',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = NEW.id
       AND status = 'offered';

    IF NEW.courier_worker_id IS NOT NULL THEN
      UPDATE public.business_courier_offers
         SET status = 'withdrawn',
             resolved_at = clock_timestamp(),
             updated_at = clock_timestamp()
       WHERE courier_worker_id = NEW.courier_worker_id
         AND order_id <> NEW.id
         AND status = 'offered';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE public.business_courier_offers
       SET status = 'cancelled',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = NEW.id
       AND status = 'offered';
  END IF;

  IF OLD.status = 'out_for_delivery'
     AND NEW.status = 'delivered'
     AND OLD.courier_worker_id IS NOT NULL THEN
    INSERT INTO public.business_courier_offers AS existing_offer (
      order_id, business_id, courier_worker_id, status
    )
    SELECT ready_order.id, ready_order.business_id, w.id, 'offered'
      FROM public.business_workers AS w
      JOIN public.orders AS ready_order
        ON ready_order.business_id = w.business_id
     WHERE w.id = OLD.courier_worker_id
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
       AND ready_order.status = 'ready'
       AND ready_order.fulfilment_type = 'delivery'
       AND NOT EXISTS (
         SELECT 1
           FROM public.orders AS active_order
          WHERE active_order.courier_worker_id = w.id
            AND active_order.status = 'out_for_delivery'
       )
    FOR UPDATE OF w
    ON CONFLICT (order_id, courier_worker_id) DO UPDATE
      SET status = 'offered',
          offered_at = clock_timestamp(),
          accepted_at = NULL,
          declined_at = NULL,
          decline_message = NULL,
          resolved_at = NULL,
          updated_at = clock_timestamp()
    WHERE existing_offer.status = 'withdrawn';
  END IF;

  RETURN NEW;
END;
$function$;

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
  v_now timestamptz;
  v_estimated_ready_at timestamptz;
  v_history_entry jsonb;
BEGIN
  IF p_order_id IS NULL
     OR p_worker_id IS NULL
     OR p_history_entry IS NULL
     OR jsonb_typeof(p_history_entry) IS DISTINCT FROM 'object'
     OR p_history_entry ->> 'status' IS DISTINCT FROM 'out_for_delivery'
     OR (p_history_entry - ARRAY[
       'status', 'at', 'by_user_id', 'reason', 'note', 'estimated_ready_at',
       'rider_name', 'rider_phone', 'worker_id', 'worker_name'
     ]::text[]) <> '{}'::jsonb THEN
    RETURN;
  END IF;

  SELECT o.business_id, o.estimated_ready_at
    INTO v_business_id, v_estimated_ready_at
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status = 'ready'
     AND o.fulfilment_type = 'delivery'
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;

  IF v_business_id IS NULL THEN
    RETURN;
  END IF;

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
       SELECT 1
         FROM public.business_worker_invitations AS i
        WHERE i.worker_id = w.id
          AND i.accepted_at IS NOT NULL
          AND i.revoked_at IS NULL
     )
   FOR UPDATE OF w;

  IF v_worker_business_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.orders AS active_order
     WHERE active_order.courier_worker_id = p_worker_id
       AND active_order.status = 'out_for_delivery'
  ) THEN
    RETURN;
  END IF;

  SELECT offer.id
    INTO v_offer_id
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.courier_worker_id = p_worker_id
     AND offer.status = 'offered'
   FOR UPDATE OF offer;

  IF v_offer_id IS NULL THEN
    RETURN;
  END IF;

  v_now := clock_timestamp();
  v_history_entry := p_history_entry || jsonb_build_object(
    'status', 'out_for_delivery',
    'at', v_now,
    'by_user_id', NULL,
    'reason', NULL,
    'note', NULL,
    'estimated_ready_at', v_estimated_ready_at,
    'rider_name', left(btrim(v_worker_name), 80),
    'rider_phone', left(btrim(v_worker_phone), 32),
    'worker_id', p_worker_id,
    'worker_name', btrim(v_worker_name)
  );

  UPDATE public.orders AS o
     SET status = 'out_for_delivery',
         courier_worker_id = p_worker_id,
         rider_name = left(btrim(v_worker_name), 80),
         rider_phone = left(btrim(v_worker_phone), 32),
         updated_at = clock_timestamp(),
         status_history = COALESCE(o.status_history, '[]'::jsonb)
           || jsonb_build_array(v_history_entry)
   WHERE o.id = p_order_id
     AND o.business_id = v_business_id
     AND o.status = 'ready'
     AND o.fulfilment_type = 'delivery'
     AND o.courier_worker_id IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.business_courier_offers AS still_open
        WHERE still_open.order_id = o.id
          AND still_open.courier_worker_id = p_worker_id
          AND still_open.status = 'offered'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders AS active_order
        WHERE active_order.courier_worker_id = p_worker_id
          AND active_order.status = 'out_for_delivery'
     )
  RETURNING o.id, o.business_id, o.customer_name, o.customer_phone
       INTO v_order_id, v_business_id, v_customer_name, v_customer_phone;

  IF v_order_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.business_courier_offers
     SET status = 'accepted',
         accepted_at = clock_timestamp(),
         resolved_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_offer_id
     AND status = 'taken';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURIER_CLAIM_OFFER_RESOLUTION_FAILED';
  END IF;

  RETURN QUERY
  SELECT o.id, o.business_id, p_worker_id, o.customer_name, o.customer_phone
    FROM public.orders AS o
   WHERE o.id = v_order_id
     AND o.status = 'out_for_delivery'
     AND o.courier_worker_id = p_worker_id;
END;
$function$;

COMMIT;
