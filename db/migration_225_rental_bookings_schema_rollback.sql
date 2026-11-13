-- Rollback for Migration 225: rental_bookings + rental_blocks schema
-- FAIL-CLOSED: refuses to drop tables if rows exist.
-- DO NOT apply manually — the user applies rollbacks.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rental_bookings LIMIT 1) THEN
    RAISE EXCEPTION 'rental_bookings has data — rollback refused. Delete rows first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rental_blocks LIMIT 1) THEN
    RAISE EXCEPTION 'rental_blocks has data — rollback refused. Delete rows first.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_rental_bookings_updated_at ON public.rental_bookings;
DROP TRIGGER IF EXISTS trg_rental_blocks_updated_at ON public.rental_blocks;
DROP TRIGGER IF EXISTS trg_check_rental_booking_block_overlap ON public.rental_bookings;
DROP TRIGGER IF EXISTS trg_check_rental_block_booking_overlap ON public.rental_blocks;

DROP FUNCTION IF EXISTS public.check_rental_booking_block_overlap();
DROP FUNCTION IF EXISTS public.check_rental_block_booking_overlap();
DROP FUNCTION IF EXISTS public.create_rental_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric, uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.get_public_rental_booking(uuid);
DROP FUNCTION IF EXISTS public.reconcile_rental_overdue();

DROP TABLE IF EXISTS public.rental_blocks;
DROP TABLE IF EXISTS public.rental_bookings;
DROP SEQUENCE IF EXISTS public.rental_booking_number_seq;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS rental_allocation_mode;

COMMIT;

NOTIFY pgrst, 'reload schema';
