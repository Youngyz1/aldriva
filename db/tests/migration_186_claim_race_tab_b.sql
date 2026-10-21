-- needs owner-run SQL
-- Two-session race test, Tab B. Start this during Tab A's pg_sleep(30).
-- Use the same order UUID and the other eligible courier UUID from Tab A.

SELECT *
  FROM public.claim_business_courier_offer(
    '00000000-0000-0000-0000-000000000186'::uuid,
    '00000000-0000-0000-0000-000000000188'::uuid,
    '{"status":"out_for_delivery","at":null,"by_user_id":null,"reason":null,"note":null,"estimated_ready_at":null,"rider_name":null,"rider_phone":null,"worker_id":"00000000-0000-0000-0000-000000000188","worker_name":"Race Test Courier B"}'::jsonb
  );

-- Expected: this call blocks until Tab A commits, then returns zero rows.
-- The API maps zero rows to the friendly "taken" response; it receives no
-- customer name or phone for the losing courier.
