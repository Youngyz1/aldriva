-- Migration 263: tighten table privileges on public.rental_bookings
-- anon loses everything; authenticated keeps SELECT only.
-- service_role is untouched (all booking writes go through the admin client).
-- Apply statement by statement. Every statement is idempotent. No BEGIN/COMMIT.

-- ===== STATEMENT 0: PREFLIGHT =====
DO $$
BEGIN
  IF to_regclass('public.rental_bookings') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT failed: public.rental_bookings missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rental_bookings'::regclass) THEN
    RAISE EXCEPTION 'PREFLIGHT failed: RLS is not enabled on rental_bookings';
  END IF;
END $$;

-- ===== STATEMENT 1: anon loses all privileges =====
REVOKE ALL ON public.rental_bookings FROM anon;

-- ===== STATEMENT 2: authenticated keeps SELECT only =====
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.rental_bookings FROM authenticated;

-- ===== STATEMENT 3: HARD CHECK =====
DO $$
DECLARE bad text := '';
BEGIN
  IF has_table_privilege('anon', 'public.rental_bookings',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    bad := bad || ' anon_has_privileges';
  END IF;
  IF has_table_privilege('authenticated', 'public.rental_bookings',
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    bad := bad || ' authenticated_has_write_or_admin_privileges';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.rental_bookings', 'SELECT') THEN
    bad := bad || ' authenticated_lost_select';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.rental_bookings',
      'SELECT,INSERT,UPDATE,DELETE') THEN
    bad := bad || ' service_role_lost_privileges';
  END IF;
  IF bad <> '' THEN
    RAISE EXCEPTION 'HARD CHECK failed:%', bad;
  END IF;
END $$;