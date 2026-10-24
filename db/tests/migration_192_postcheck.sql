-- Read-only checks to run after the owner applies migration 192 on staging.
-- This script does not insert, update, or delete business data.

DO $check$
DECLARE
  v_constraint text;
  v_feed_definition text;
  v_dispatch_oid oid;
  v_claim_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'business_courier_offers'
       AND column_name = 'expires_at'
       AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: offer expiry column is missing or nullable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.courier_dispatch_settings
     WHERE id = 1 AND offer_timeout_seconds BETWEEN 60 AND 3600
  ) THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: bounded courier offer timeout setting is missing';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.business_courier_offers'::regclass
     AND conname = 'business_courier_offers_status_check';
  IF v_constraint IS NULL OR v_constraint NOT LIKE '%expired%' THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: expired offer state is not allowed';
  END IF;

  SELECT pg_get_viewdef('public.business_courier_offer_feed'::regclass, true)
    INTO v_feed_definition;
  IF v_feed_definition IS NULL
     OR v_feed_definition NOT LIKE '%NULL::text AS delivery_address%'
     OR v_feed_definition NOT LIKE '%estimated_ready_at%' THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: offer feed does not hide destination or expose ready estimate';
  END IF;

  v_dispatch_oid := to_regprocedure('public.dispatch_business_courier_order(uuid,boolean)');
  v_claim_oid := to_regprocedure('public.claim_business_courier_offer(uuid,uuid,jsonb)');
  IF v_dispatch_oid IS NULL OR v_claim_oid IS NULL THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: dispatch or claim function is missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_dispatch_oid)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_claim_oid) THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: dispatch/claim must run as security definer';
  END IF;
  IF to_regprocedure('public.dispatch_pending_deliveries_after_courier_completion()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.orders'::regclass
          AND tgname = 'trg_dispatch_pending_deliveries_after_courier_completion'
          AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: completion re-dispatch hook is missing';
  END IF;
  IF NOT has_function_privilege('service_role', v_dispatch_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_dispatch_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_dispatch_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_claim_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_claim_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_claim_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: RPC execute grants are not service-role-only';
  END IF;

  IF EXISTS (
    SELECT courier_worker_id FROM public.orders
     WHERE courier_worker_id IS NOT NULL
       AND status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
     GROUP BY courier_worker_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'migration 192 postcheck failed: a courier has multiple active delivery assignments';
  END IF;
END;
$check$;

SELECT
  'migration 192 postchecks passed' AS result,
  (SELECT count(*) FROM public.business_courier_offers WHERE status = 'offered' AND expires_at > clock_timestamp()) AS unexpired_offers,
  (SELECT count(*) FROM public.orders WHERE courier_worker_id IS NOT NULL AND status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')) AS active_courier_assignments;
