-- Rollback for migration 233 (rental handover).
-- NOT APPLIED. Owner runs manually if needed. Fails closed when handover data exists.

BEGIN;

DO $$
DECLARE
  v_n integer;
  v_deps text;
BEGIN
  -- Block if any dependent data exists (inspections or handover settlement/fee usage).
  IF to_regclass('public.rental_inspections') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.rental_inspections' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'ROLLBACK_BLOCKED: rental_inspections has % rows.', v_n;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rental_bookings' AND column_name = 'deposit_status'
  ) THEN
    SELECT count(*) INTO v_n
      FROM public.rental_bookings
     WHERE deposit_status IN ('returned_full', 'partially_retained', 'retained_full')
        OR COALESCE(late_fee_status, 'none') IN ('pending', 'collected', 'waived')
        OR COALESCE(late_fee_amount, 0) <> 0;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'ROLLBACK_BLOCKED: % booking(s) have handover deposit settlement or late-fee data.', v_n;
    END IF;
  END IF;


  -- Block if any function (other than the ones we drop) depends on the 233 RPC signatures.
  SELECT string_agg(DISTINCT n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname || '.' || p.proname)
    INTO v_deps
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT IN ('record_rental_pickup_handover', 'record_rental_return_handover', 'calculate_rental_late_fee')
     AND (
       pg_get_functiondef(p.oid) LIKE '%record_rental_pickup_handover%'
       OR pg_get_functiondef(p.oid) LIKE '%record_rental_return_handover%'
       OR pg_get_functiondef(p.oid) LIKE '%calculate_rental_late_fee%'
     );
  IF v_deps IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK_BLOCKED: dependent functions reference migration 233 objects: %', v_deps;
  END IF;
END $$;

-- Drop 233 functions (all overloads defensively).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'record_rental_pickup_handover',
        'record_rental_return_handover',
        'calculate_rental_late_fee'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- Drop inspection table.
DROP TABLE IF EXISTS public.rental_inspections CASCADE;

-- Remove 233 event rows, then restore previous rental_booking_events.event_type CHECK
-- (migration 228 values: exactly the six below).
DELETE FROM public.rental_booking_events
WHERE event_type IN (
  'inspection_recorded',
  'deposit_settled',
  'late_fee_applied',
  'late_fee_waived'
);

ALTER TABLE public.rental_booking_events
  DROP CONSTRAINT IF EXISTS rental_booking_events_event_type_check;
ALTER TABLE public.rental_booking_events
  ADD CONSTRAINT rental_booking_events_event_type_check CHECK (event_type IN (
  'status_change',
  'payment_link_sent',
  'deadline_extended',
  'payment_override',
  'email_sent',
  'email_failed'
));

-- Remove late-fee business settings.
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS chk_businesses_rental_late_fee_grace,
  DROP CONSTRAINT IF EXISTS chk_businesses_rental_late_fee_per_day,
  DROP COLUMN IF EXISTS rental_late_fee_grace_minutes,
  DROP COLUMN IF EXISTS rental_late_fee_per_day,
  DROP COLUMN IF EXISTS rental_late_fee_currency;

COMMIT;

NOTIFY pgrst, 'reload schema';
