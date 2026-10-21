-- needs owner-run SQL
-- Run after both race-test tabs finish. Replace the UUID literals with the
-- same order and courier IDs used in Tabs A and B.

SELECT
  o.id AS order_id,
  o.status,
  o.courier_worker_id AS assigned_worker_id,
  o.rider_name,
  o.rider_phone,
  (o.status = 'out_for_delivery') AS status_is_out_for_delivery,
  (o.courier_worker_id = '00000000-0000-0000-0000-000000000187'::uuid) AS tab_a_won
FROM public.orders AS o
WHERE o.id = '00000000-0000-0000-0000-000000000186'::uuid;
-- Expected: exactly one row; status_is_out_for_delivery = true;
-- tab_a_won = true; assigned_worker_id is Tab A's courier UUID.

SELECT
  courier_worker_id,
  status,
  (courier_worker_id = '00000000-0000-0000-0000-000000000187'::uuid
   AND status = 'accepted') AS tab_a_offer_accepted,
  (courier_worker_id = '00000000-0000-0000-0000-000000000188'::uuid
   AND status = 'taken') AS tab_b_offer_taken
FROM public.business_courier_offers
WHERE order_id = '00000000-0000-0000-0000-000000000186'::uuid
  AND courier_worker_id IN (
    '00000000-0000-0000-0000-000000000187'::uuid,
    '00000000-0000-0000-0000-000000000188'::uuid
  )
ORDER BY courier_worker_id;
-- Expected: exactly two rows: Tab A accepted, Tab B taken; both derived
-- predicates are true on their respective rows.
