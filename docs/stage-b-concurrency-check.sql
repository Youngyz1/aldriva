-- docs/stage-b-concurrency-check.sql
-- Manual verification script for Stage B reservation capacity concurrency lock.
--
-- Scenario:
-- Venue seat_capacity = 30.
-- Existing confirmed reservations during 19:00 - 20:30 total 28 seats.
-- Two pending reservations (A and B), each requesting 2 seats at 19:30 for 90 minutes.
--
-- Run Session 1 and Session 2 in separate psql terminals.
-- Expected outcome:
-- Exactly ONE session confirms successfully (active_covers = 30).
-- The other session receives error code 'CAPACITY_EXCEEDED' and fails closed.
--
-- NOTE: THIS SCRIPT IS FOR MANUAL OPERATIONAL VERIFICATION ONLY AND IS NOT EXECUTED DURING BUILD/TEST.

-- ============================================================================
-- SETUP (Run once in a test database)
-- ============================================================================
-- 1. Identify or insert a test business:
-- INSERT INTO public.businesses (id, owner_id, name, slug, industry, category, seat_capacity, default_stay_minutes, max_stay_minutes)
-- VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Test Bistro', 'test-bistro', 'Food & Beverage', 'Restaurant', 30, 90, 120);

-- 2. Insert existing confirmed reservations totaling 28 seats:
-- INSERT INTO public.reservations (id, organizer_id, business_id, reservation_number, lookup_token, customer_name, customer_phone, party_size, starts_at, duration_minutes, status)
-- VALUES
--   ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'RES-TEST-28', 'token28', 'Party Existing', '+15555550100', 28, '2026-11-01 19:00:00+00', 90, 'confirmed');

-- 3. Insert two pending requests A and B:
-- INSERT INTO public.reservations (id, organizer_id, business_id, reservation_number, lookup_token, customer_name, customer_phone, party_size, starts_at, duration_minutes, status)
-- VALUES
--   ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'RES-TEST-A', 'tokenA', 'Guest A', '+15555550101', 2, '2026-11-01 19:30:00+00', 90, 'pending'),
--   ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'RES-TEST-B', 'tokenB', 'Guest B', '+15555550102', 2, '2026-11-01 19:30:00+00', 90, 'pending');

-- ============================================================================
-- SESSION 1 (Terminal 1)
-- ============================================================================
BEGIN;
-- Confirm Guest A
SELECT public.confirm_reservation_with_capacity(
  '22222222-2222-2222-2222-222222222222',
  'pending',
  '00000000-0000-0000-0000-000000000002',
  'Confirmed in Session 1'
);
-- Pause before COMMIT to simulate concurrent execution overlap
SELECT pg_sleep(3);
COMMIT;

-- ============================================================================
-- SESSION 2 (Terminal 2 - execute concurrently while Session 1 is in pg_sleep)
-- ============================================================================
BEGIN;
-- Confirm Guest B
-- Notice: This statement will wait until Session 1 completes due to pg_advisory_xact_lock.
-- Once Session 1 commits, Session 2 proceeds, computes active_covers = 30, and returns CAPACITY_EXCEEDED.
SELECT public.confirm_reservation_with_capacity(
  '33333333-3333-3333-3333-333333333333',
  'pending',
  '00000000-0000-0000-0000-000000000002',
  'Confirmed in Session 2'
);
COMMIT;

-- ============================================================================
-- VERIFY FINAL STATE
-- ============================================================================
-- Query status of A and B:
-- SELECT id, reservation_number, status, party_size FROM public.reservations WHERE id IN (
--   '22222222-2222-2222-2222-222222222222',
--   '33333333-3333-3333-3333-333333333333'
-- );
--
-- Verified expectation:
-- One row has status = 'confirmed'.
-- The other row remains status = 'pending'.
