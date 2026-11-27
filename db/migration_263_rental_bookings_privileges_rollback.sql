-- Migration 263 ROLLBACK: restore the pre-263 privileges on public.rental_bookings
-- (anon and authenticated both held all seven privileges). Idempotent. No BEGIN/COMMIT.

-- ===== STATEMENT 0: PREFLIGHT =====
DO $$
BEGIN
  IF to_regclass('public.rental_bookings') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT failed: public.rental_bookings missing';
  END IF;
END $$;

-- ===== STATEMENT 1: restore anon =====
GRANT ALL ON public.rental_bookings TO anon;

-- ===== STATEMENT 2: restore authenticated =====
GRANT ALL ON public.rental_bookings TO authenticated;

-- ===== STATEMENT 3: HARD CHECK =====
DO $$
DECLARE bad text := '';
BEGIN
  IF NOT has_table_privilege('anon', 'public.rental_bookings',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    bad := bad || ' anon_not_restored';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.rental_bookings',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    bad := bad || ' authenticated_not_restored';
  END IF;
  IF bad <> '' THEN
    RAISE EXCEPTION 'ROLLBACK HARD CHECK failed:%', bad;
  END IF;
END $$;