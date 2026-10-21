-- needs owner-run SQL
-- Two-session race test, Tab A. Replace the three UUID literals in both tabs
-- with a real ready/unassigned delivery order and its two eligible couriers.
-- Both courier IDs must have an open offer for this order.
-- Run this entire file in Tab A as one execution; do not split the statements.

BEGIN;

SELECT *
  FROM public.claim_business_courier_offer(
    '00000000-0000-0000-0000-000000000186'::uuid,
    '00000000-0000-0000-0000-000000000187'::uuid,
    '{"status":"out_for_delivery","at":null,"by_user_id":null,"reason":null,"note":null,"estimated_ready_at":null,"rider_name":null,"rider_phone":null,"worker_id":"00000000-0000-0000-0000-000000000187","worker_name":"Race Test Courier A"}'::jsonb
  );

SELECT pg_sleep(30);

COMMIT;

-- Expected: claim returns exactly one row for courier 187. Tab A holds the
-- order lock during the 30-second sleep, allowing Tab B to block.
