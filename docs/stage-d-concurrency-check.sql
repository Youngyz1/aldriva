-- docs/stage-d-concurrency-check.sql
-- Manual two-session concurrency check for Stage D (approve_reservation_change_with_capacity).
-- DO NOT execute automatically. For manual verification via two psql / Supabase SQL editor sessions.
--
-- Scenario:
--   A restaurant with seat_capacity = 8.
--   Reservation A: 6 covers confirmed for window W (19:00 - 20:30).
--   Reservation B: 2 covers confirmed elsewhere (18:00 - 19:30).
--   Change Request for B: requests moving to window W (19:00 - 20:30) for 4 covers.
--   Reservation C: 2 covers pending for window W (19:00 - 20:30).
--
-- If Session 1 approves the change request (B moves to W with 4 covers; total 6+4=10 > 8),
-- it must fail with CAPACITY_EXCEEDED (or if B only requests 2 covers, total 6+2=8, but Session 1 and Session 2 race).
--
-- Clean up afterwards.

-- ── 0. Cleanup from any previous run ─────────────────────────────────────────
DELETE FROM public.reservation_change_requests WHERE guest_note = 'STAGE_D_CONCURRENCY_TEST';
DELETE FROM public.reservations WHERE customer_note = 'STAGE_D_CONCURRENCY_TEST';

-- ── 1. Setup fixture (Run once in either session) ────────────────────────────
DO $$
DECLARE
  v_org_id uuid;
  v_biz_id uuid;
  v_res_a uuid;
  v_res_b uuid;
  v_req_b uuid;
BEGIN
  -- Grab existing organizer and business with seat_capacity
  SELECT organizer_id, id INTO v_org_id, v_biz_id
  FROM public.businesses
  WHERE seat_capacity IS NOT NULL
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No business with seat_capacity found; test cannot run without a business fixture.';
    RETURN;
  END IF;

  -- Create confirmed reservation A (6 covers at 19:00)
  INSERT INTO public.reservations (
    id, organizer_id, reservation_number, customer_name, customer_phone,
    party_size, starts_at, duration_minutes, status, customer_note, lookup_token
  ) VALUES (
    gen_random_uuid(), v_org_id, 'RES-CONC-A', 'Party A', '+15555550101',
    6, '2026-11-15T19:00:00Z', 90, 'confirmed', 'STAGE_D_CONCURRENCY_TEST', 'tok_conc_a'
  ) RETURNING id INTO v_res_a;

  -- Create confirmed reservation B (2 covers at 12:00)
  INSERT INTO public.reservations (
    id, organizer_id, reservation_number, customer_name, customer_phone,
    party_size, starts_at, duration_minutes, status, customer_note, lookup_token
  ) VALUES (
    gen_random_uuid(), v_org_id, 'RES-CONC-B', 'Party B', '+15555550102',
    2, '2026-11-15T12:00:00Z', 90, 'confirmed', 'STAGE_D_CONCURRENCY_TEST', 'tok_conc_b'
  ) RETURNING id INTO v_res_b;

  -- Create change request for B requesting 19:00 (overlaps with A) with party size 4
  -- Total in window = 6 + 4 = 10 covers. If capacity is <= 8, this MUST fail CAPACITY_EXCEEDED.
  INSERT INTO public.reservation_change_requests (
    id, reservation_id, organizer_id, requested_starts_at, requested_party_size,
    guest_note, status
  ) VALUES (
    'd0000000-0000-0000-0000-000000000001'::uuid, v_res_b, v_org_id,
    '2026-11-15T19:00:00Z', 4, 'STAGE_D_CONCURRENCY_TEST', 'pending'
  );

  RAISE NOTICE 'Fixture setup complete. Request ID: d0000000-0000-0000-0000-000000000001';
END $$;

-- ── Session 1: Run approve_reservation_change_with_capacity ──────────────────
-- BEGIN;
-- SELECT public.approve_reservation_change_with_capacity(
--   'd0000000-0000-0000-0000-000000000001'::uuid,
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   'Approved concurrently'
-- );
-- -- Expected: {"error": "CAPACITY_EXCEEDED", "success": false, ...} if 6+4 > capacity
-- COMMIT;

-- ── 2. Teardown / Cleanup ───────────────────────────────────────────────────
-- DELETE FROM public.reservation_change_requests WHERE guest_note = 'STAGE_D_CONCURRENCY_TEST';
-- DELETE FROM public.reservations WHERE customer_note = 'STAGE_D_CONCURRENCY_TEST';
