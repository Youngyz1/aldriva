-- Migration 202: include READY deliveries when a courier finishes an order.
-- Owner applies SQL manually; do not run from an agent.

BEGIN;

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
       AND pending_order.status IN ('accepted', 'preparing', 'ready')
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

NOTIFY pgrst, 'reload schema';
COMMIT;
