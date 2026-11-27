-- 267 verify (read-only). Run after 267. Raises an exception on any failure.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'staff_availability','staff_member_branch_scopes','staff_member_roles',
    'staff_members','staff_permissions','staff_role_permissions',
    'staff_roles','staff_skills','staff_time_off'];
  n bigint;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF has_table_privilege('anon', 'public.' || t,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION '267 verify: anon still has a privilege on %', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION '267 verify: authenticated still has TRUNCATE/REFERENCES/TRIGGER on %', t;
    END IF;
    IF NOT (    has_table_privilege('authenticated', 'public.' || t, 'SELECT')
            AND has_table_privilege('authenticated', 'public.' || t, 'INSERT')
            AND has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
            AND has_table_privilege('authenticated', 'public.' || t, 'DELETE')) THEN
      RAISE EXCEPTION '267 verify: authenticated lost SELECT/INSERT/UPDATE/DELETE on %', t;
    END IF;
  END LOOP;

  -- Behaviour: anon must be denied (42501)
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.staff_permissions;
    RESET ROLE;
    RAISE EXCEPTION '267 verify: anon read of staff_permissions was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- Behaviour: authenticated must still be allowed (RLS decides the count)
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.staff_permissions;
  RESET ROLE;

  RAISE NOTICE '267 verify: PASS (authenticated sees % staff_permissions rows without a JWT)', n;
END $$;
