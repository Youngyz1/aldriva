-- Migration 186: courier availability, delivery offers, and atomic claims.
-- Files only. The owner applies SQL manually; this file never connects to a DB.
-- Requires migration 185 and migrations 171, 174, and 175.

BEGIN;

-- Availability belongs to a registered worker. Non-couriers cannot be marked
-- available; inactive/deactivated workers must always be offline.
ALTER TABLE public.business_workers
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT false;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_workers'::regclass
       AND conname = 'business_workers_courier_availability_check'
  ) THEN
    ALTER TABLE public.business_workers
      ADD CONSTRAINT business_workers_courier_availability_check
      CHECK (role = 'courier' OR is_available = false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_workers'::regclass
       AND conname = 'business_workers_inactive_offline_check'
  ) THEN
    ALTER TABLE public.business_workers
      ADD CONSTRAINT business_workers_inactive_offline_check
      CHECK ((is_active = true AND deactivated_at IS NULL) OR is_available = false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_workers'::regclass
       AND conname = 'business_workers_id_business_id_key'
  ) THEN
    ALTER TABLE public.business_workers
      ADD CONSTRAINT business_workers_id_business_id_key UNIQUE (id, business_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_id_business_id_key'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_id_business_id_key UNIQUE (id, business_id);
  END IF;
END;
$migration$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_worker_id uuid NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_courier_worker_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_courier_worker_id_fkey
      FOREIGN KEY (courier_worker_id)
      REFERENCES public.business_workers(id) ON DELETE SET NULL;
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.business_workers.is_available IS
  'Courier availability toggle. Display state is derived from this toggle and active assigned orders.';
COMMENT ON COLUMN public.orders.courier_worker_id IS
  'Registered courier assigned to this delivery; rider_name/rider_phone remain the order snapshots used by tracking and email.';

CREATE TABLE IF NOT EXISTS public.business_courier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  business_id uuid NOT NULL,
  courier_worker_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'declined', 'taken', 'cancelled', 'withdrawn')),
  decline_message text NULL
    CHECK (decline_message IS NULL OR char_length(btrim(decline_message)) <= 300),
  offered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at timestamptz NULL,
  declined_at timestamptz NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT business_courier_offers_order_business_fk
    FOREIGN KEY (order_id, business_id)
    REFERENCES public.orders(id, business_id) ON DELETE CASCADE,
  CONSTRAINT business_courier_offers_worker_business_fk
    FOREIGN KEY (courier_worker_id, business_id)
    REFERENCES public.business_workers(id, business_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_courier_offers_order_worker
  ON public.business_courier_offers(order_id, courier_worker_id);
CREATE INDEX IF NOT EXISTS idx_business_courier_offers_worker_status
  ON public.business_courier_offers(courier_worker_id, status, offered_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_courier_offers_business_status
  ON public.business_courier_offers(business_id, status, offered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_courier_worker_active
  ON public.orders(courier_worker_id, status)
  WHERE courier_worker_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_order_per_courier
  ON public.orders(courier_worker_id)
  WHERE courier_worker_id IS NOT NULL AND status = 'out_for_delivery';

ALTER TABLE public.business_courier_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_courier_offers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_courier_offers TO service_role;

COMMENT ON TABLE public.business_courier_offers IS
  'One row per courier/order offer. Contains no customer name, phone, address, or item data.';
COMMENT ON COLUMN public.business_courier_offers.decline_message IS
  'Optional courier-specific decline note, limited to 300 characters.';

-- The offer feed is a safe projection: it only contains pickup/delivery
-- addresses, items, and amount-to-collect. It requires status=ready and never
-- includes the customer's name or phone. Routes must additionally scope both
-- courier_worker_id and business_id to the validated courier session.
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
COMMENT ON VIEW public.business_courier_offer_feed IS
  'Courier offer projection. Includes order data only while the offer and order remain open/ready; excludes customer name and phone.';

-- Ready-order fanout. This function is attached to separate INSERT and
-- UPDATE triggers so the INSERT path never reads OLD.
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

-- Shared function for the BEFORE deactivation fix and AFTER availability
-- fanout. The BEFORE branch changes NEW before table CHECK constraints run.
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

-- Close open offers when the order is assigned/cancelled. When an assigned
-- courier completes a delivery, offer any still-ready delivery backlog to
-- that now-free courier if their availability toggle remains on.
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

DROP TRIGGER IF EXISTS trg_offer_ready_delivery_insert ON public.orders;
CREATE TRIGGER trg_offer_ready_delivery_insert
AFTER INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'ready')
EXECUTE FUNCTION public.offer_ready_delivery_couriers();

DROP TRIGGER IF EXISTS trg_offer_ready_delivery_update ON public.orders;
CREATE TRIGGER trg_offer_ready_delivery_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'ready' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.offer_ready_delivery_couriers();

DROP TRIGGER IF EXISTS trg_force_inactive_worker_offline ON public.business_workers;
CREATE TRIGGER trg_force_inactive_worker_offline
BEFORE UPDATE OF is_active, deactivated_at ON public.business_workers
FOR EACH ROW
WHEN (
  (OLD.is_active IS DISTINCT FROM NEW.is_active
   OR OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at)
  AND (NEW.is_active = false OR NEW.deactivated_at IS NOT NULL)
)
EXECUTE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries();

DROP TRIGGER IF EXISTS trg_sync_courier_offers_on_availability
  ON public.business_workers;
CREATE TRIGGER trg_sync_courier_offers_on_availability
AFTER UPDATE OF is_available ON public.business_workers
FOR EACH ROW
WHEN (
  NEW.role = 'courier'
  AND OLD.is_available IS DISTINCT FROM NEW.is_available
)
EXECUTE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries();

DROP TRIGGER IF EXISTS trg_resolve_courier_offers_on_order_status ON public.orders;
CREATE TRIGGER trg_resolve_courier_offers_on_order_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND (
    NEW.status IN ('out_for_delivery', 'cancelled')
    OR (OLD.status = 'out_for_delivery' AND NEW.status = 'delivered')
  )
)
EXECUTE FUNCTION public.resolve_courier_offers_on_order_status();

-- Seed offers for ready delivery orders that already exist at migration time.
INSERT INTO public.business_courier_offers AS existing_offer (
  order_id, business_id, courier_worker_id, status
)
SELECT o.id, o.business_id, w.id, 'offered'
  FROM public.orders AS o
  JOIN public.business_workers AS w ON w.business_id = o.business_id
 WHERE o.status = 'ready'
   AND o.fulfilment_type = 'delivery'
   AND o.business_id IS NOT NULL
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

-- Extend the Phase 1 invitation consumer for both worker roles. Cook callers
-- still receive their kitchen_id; courier callers receive NULL kitchen_id.
-- out_role is added to the returned row; the existing cook helper ignores
-- unknown fields, while the courier helper can fail closed on the role.
DROP FUNCTION public.consume_business_worker_invitation(text, text, text);
CREATE FUNCTION public.consume_business_worker_invitation(
  p_invitation_token_hash text,
  p_phone_last4 text,
  p_session_token_hash text
)
RETURNS TABLE (
  out_worker_id uuid,
  out_business_id uuid,
  out_kitchen_id uuid,
  out_role text,
  out_session_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation_id uuid;
  v_worker_id uuid;
  v_business_id uuid;
  v_kitchen_id uuid;
  v_role text;
  v_session_expires_at timestamptz;
BEGIN
  IF p_invitation_token_hash IS NULL
     OR p_invitation_token_hash !~ '^[0-9a-f]{64}$'
     OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$'
     OR p_phone_last4 IS NULL
     OR p_phone_last4 !~ '^[0-9]{4}$' THEN
    RETURN;
  END IF;

  SELECT i.id, w.id, w.business_id, w.kitchen_id, w.role
    INTO v_invitation_id, v_worker_id, v_business_id, v_kitchen_id, v_role
    FROM public.business_worker_invitations AS i
    JOIN public.business_workers AS w ON w.id = i.worker_id
   WHERE i.token_hash = p_invitation_token_hash
     AND i.expires_at > v_now
     AND i.token_consumed_at IS NULL
     AND i.revoked_at IS NULL
     AND w.role IN ('cook', 'courier')
     AND (w.role <> 'cook' OR w.kitchen_id IS NOT NULL)
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND char_length(regexp_replace(w.phone, '[^0-9]', '', 'g')) >= 4
     AND right(regexp_replace(w.phone, '[^0-9]', '', 'g'), 4) = p_phone_last4
   FOR UPDATE OF i, w;

  IF v_invitation_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.business_worker_invitations
     SET token_consumed_at = v_now,
         accepted_at = COALESCE(accepted_at, v_now),
         updated_at = v_now
   WHERE id = v_invitation_id
     AND token_consumed_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > v_now;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_session_expires_at := v_now + interval '30 days';

  INSERT INTO public.business_worker_sessions (
    worker_id, invitation_id, token_hash, created_at, expires_at,
    hard_expires_at, last_renewed_at, updated_at
  )
  VALUES (
    v_worker_id, v_invitation_id, p_session_token_hash, v_now,
    v_session_expires_at, v_now + interval '90 days', v_now, v_now
  );

  RETURN QUERY
  SELECT v_worker_id, v_business_id, v_kitchen_id, v_role, v_session_expires_at;
END;
$function$;

-- The order row is locked before the worker and offer rows. The conditional
-- UPDATE is the compare-and-set that makes one courier the winner. Its status,
-- assignment, rider snapshots, history append, and server timestamp commit as
-- one row update; the trigger resolves other offers in the same transaction.
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

  -- The status trigger first changes every still-open offer to taken. Mark
  -- this caller's offer accepted only after the conditional order update wins.
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

  -- Customer data is returned only for the winning, still-active assignment.
  RETURN QUERY
  SELECT o.id, o.business_id, p_worker_id, o.customer_name, o.customer_phone
    FROM public.orders AS o
   WHERE o.id = v_order_id
     AND o.status = 'out_for_delivery'
     AND o.courier_worker_id = p_worker_id;
END;
$function$;

-- A decline changes only this courier/order row. It is serialized on the
-- order row with claims and manager assignments; it returns no customer data.
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
  v_order_id uuid;
BEGIN
  IF p_order_id IS NULL
     OR p_worker_id IS NULL
     OR char_length(btrim(COALESCE(p_message, ''))) > 300 THEN
    RETURN false;
  END IF;

  SELECT o.id
    INTO v_order_id
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status = 'ready'
     AND o.fulfilment_type = 'delivery'
   FOR UPDATE OF o;

  IF v_order_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.business_courier_offers AS offer
     SET status = 'declined',
         decline_message = NULLIF(btrim(p_message), ''),
         declined_at = clock_timestamp(),
         resolved_at = clock_timestamp(),
         updated_at = clock_timestamp()
    FROM public.business_workers AS w
   WHERE offer.order_id = v_order_id
     AND offer.courier_worker_id = p_worker_id
     AND offer.status = 'offered'
     AND w.id = p_worker_id
     AND w.business_id = offer.business_id
     AND w.role = 'courier'
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.business_worker_invitations AS i
        WHERE i.worker_id = w.id
          AND i.accepted_at IS NOT NULL
          AND i.revoked_at IS NULL
     );

  RETURN FOUND;
END;
$function$;

-- Six callable functions: the three trigger functions plus invitation
-- consumption, claim, and decline. Runtime execution is service_role only;
-- PUBLIC/anon/authenticated receive no EXECUTE grant.
REVOKE ALL ON FUNCTION public.offer_ready_delivery_couriers()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_courier_availability_and_offer_ready_deliveries()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_courier_offers_on_order_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_business_worker_invitation(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_business_courier_offer(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decline_business_courier_offer(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.offer_ready_delivery_couriers() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_courier_availability_and_offer_ready_deliveries() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_courier_offers_on_order_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_business_worker_invitation(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_business_courier_offer(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_business_courier_offer(uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
