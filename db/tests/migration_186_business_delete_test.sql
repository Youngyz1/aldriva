-- needs owner-run SQL
-- STAGING ONLY. NEVER run this test on production.
-- Replace this UUID with a disposable staging business that currently has at
-- least one open courier offer. This transaction always rolls back.

BEGIN;

DO $business_delete_test$
DECLARE
  v_business_id uuid := '00000000-0000-0000-0000-000000000186'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = v_business_id) THEN
    RAISE EXCEPTION 'Replace the staging business UUID placeholder before running this test';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.business_courier_offers AS offer
      JOIN public.orders AS order_row
        ON order_row.id = offer.order_id
       AND order_row.business_id = offer.business_id
     WHERE offer.business_id = v_business_id
       AND offer.status = 'offered'
       AND order_row.status = 'ready'
  ) THEN
    RAISE EXCEPTION 'The selected staging business must have a ready order with an open courier offer';
  END IF;

  DELETE FROM public.businesses WHERE id = v_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected staging business was not deleted';
  END IF;

  IF EXISTS (SELECT 1 FROM public.business_workers WHERE business_id = v_business_id) THEN
    RAISE EXCEPTION 'Business delete left courier or cook worker rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_courier_offers WHERE business_id = v_business_id) THEN
    RAISE EXCEPTION 'Business delete left courier offers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE business_id = v_business_id) THEN
    RAISE EXCEPTION 'Business delete left orders referencing the deleted business';
  END IF;
END;
$business_delete_test$;

-- Expected: the DO block succeeds, proving the business, workers, offers, and
-- business-scoped order references can be removed together. ROLLBACK restores
-- all rows because this test must never commit its delete.
ROLLBACK;
