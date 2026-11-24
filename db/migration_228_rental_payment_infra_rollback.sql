-- Migration 228 ROLLBACK: rental payment infrastructure
-- Staging use only, and only if 228 must be undone. NOT in supabase/migrations/.
-- If migration 229 is applied, roll 229 back FIRST.
-- Fails closed: if anything would be lost or broken, it stops and changes nothing.
--
-- Deliberately NOT restored: rental_bookings_status_check,
-- rental_bookings_payment_status_check and uq_rental_bookings_no_overlap.
-- Their wider lists (awaiting_payment, partially_paid) are harmless to older code,
-- and I will not rebuild them from a definition nobody has verified.

BEGIN;

-- ── 1. Fail-closed checks ───────────────────────────────────────────────────
DO $$
DECLARE
  v_n bigint;
  v_funcs text;
BEGIN
  -- 229 functions must not still reference the columns/tables this drops
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_funcs
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND (p.prosrc LIKE '%rental_payments%'
       OR p.prosrc LIKE '%rental_checkout_sessions%'
       OR p.prosrc LIKE '%rental_booking_events%'
       OR p.prosrc LIKE '%snapshot_payment_policy%'
       OR p.prosrc LIKE '%snapshot_confirmation_mode%'
       OR p.prosrc LIKE '%amount_due_online%'
       OR p.prosrc LIKE '%rental_payment_policy%'
       OR p.prosrc LIKE '%payment_due_at%');
  IF v_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK_BLOCKED: these functions still use 228 objects (roll back 229 first): %', v_funcs;
  END IF;

  IF to_regclass('public.rental_payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.rental_payments' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'ROLLBACK_BLOCKED: rental_payments has % rows (financial data).', v_n;
    END IF;
  END IF;

  IF to_regclass('public.rental_checkout_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.rental_checkout_sessions WHERE status = ''open''' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'ROLLBACK_BLOCKED: % open Stripe checkout sessions exist.', v_n;
    END IF;
  END IF;

  SELECT count(*) INTO v_n FROM public.recipient_ledger_entries
   WHERE source_type = 'rental_booking';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_BLOCKED: % ledger rows with source_type rental_booking.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.rental_bookings
   WHERE status = 'awaiting_payment' OR payment_status = 'partially_paid';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_BLOCKED: % bookings are awaiting_payment or partially_paid. Resolve them first.', v_n;
  END IF;

  IF to_regclass('public.rental_booking_events') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.rental_booking_events' INTO v_n;
    RAISE NOTICE 'Dropping rental_booking_events (% audit rows).', v_n;
  END IF;
END;
$$;

-- ── 2. Drop the new tables ──────────────────────────────────────────────────
DROP TABLE IF EXISTS public.rental_booking_events;
DROP TABLE IF EXISTS public.rental_checkout_sessions;
DROP TABLE IF EXISTS public.rental_payments;

-- ── 3. Ledger source_type back to the 7 pre-228 values ──────────────────────
-- (the live 8-value list minus 'rental_booking')
ALTER TABLE public.recipient_ledger_entries
  DROP CONSTRAINT IF EXISTS recipient_ledger_entries_source_type_check;
ALTER TABLE public.recipient_ledger_entries
  ADD CONSTRAINT recipient_ledger_entries_source_type_check
  CHECK (source_type = ANY (ARRAY['donation','manual','order','payout',
                                  'product_order','reservation_payment','ticket_order']));

-- ── 4. Drop the 228 columns on rental_bookings ──────────────────────────────
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_advance_requires_pct,
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_amount_due_online,
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_customer_locale,
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_advance_pct,
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_conf_mode,
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_payment_policy,
  DROP CONSTRAINT IF EXISTS rental_bookings_customer_locale_check,
  DROP CONSTRAINT IF EXISTS rental_bookings_snapshot_advance_pct_check,
  DROP CONSTRAINT IF EXISTS rental_bookings_amount_due_online_check,
  DROP COLUMN IF EXISTS payment_due_at,
  DROP COLUMN IF EXISTS customer_locale,
  DROP COLUMN IF EXISTS snapshot_confirmation_mode,
  DROP COLUMN IF EXISTS snapshot_payment_policy,
  DROP COLUMN IF EXISTS snapshot_advance_pct,
  DROP COLUMN IF EXISTS amount_due_online,
  DROP COLUMN IF EXISTS expired_at;

-- ── 5. Drop the 228 columns on businesses ───────────────────────────────────
-- Any owner's payment policy / advance % / link hours settings are lost here.
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS chk_businesses_advance_requires_pct,
  DROP CONSTRAINT IF EXISTS chk_businesses_rental_advance_pct_range,
  DROP CONSTRAINT IF EXISTS chk_businesses_rental_payment_link_hours,
  DROP CONSTRAINT IF EXISTS chk_businesses_rental_payment_policy,
  DROP CONSTRAINT IF EXISTS businesses_rental_advance_pct_check,
  DROP CONSTRAINT IF EXISTS businesses_rental_payment_link_hours_check,
  DROP CONSTRAINT IF EXISTS businesses_rental_payment_policy_check,
  DROP COLUMN IF EXISTS rental_payment_policy,
  DROP COLUMN IF EXISTS rental_advance_pct,
  DROP COLUMN IF EXISTS rental_payment_link_hours;

COMMIT;

NOTIFY pgrst, 'reload schema';