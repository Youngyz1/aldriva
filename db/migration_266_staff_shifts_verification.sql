-- Verification for migration 266 (read-only). Expect every row true.
SELECT 'table exists' AS check_name, to_regclass('public.staff_shifts') IS NOT NULL AS ok
UNION ALL SELECT 'RLS on', COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.staff_shifts')), false)
UNION ALL SELECT '4 policies', (SELECT count(*) FROM pg_policy WHERE polrelid = to_regclass('public.staff_shifts')) = 4
UNION ALL SELECT '2 triggers', (SELECT count(*) FROM pg_trigger WHERE tgrelid = to_regclass('public.staff_shifts') AND NOT tgisinternal) = 2
UNION ALL SELECT 'overlap constraint', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.staff_shifts') AND conname = 'staff_shifts_no_overlap')
UNION ALL SELECT 'validate function', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'staff_shifts_validate' AND pronamespace = 'public'::regnamespace AND prosecdef)
UNION ALL SELECT 'anon has nothing', NOT has_table_privilege('anon', 'public.staff_shifts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
UNION ALL SELECT 'authenticated has no TRUNCATE/REFERENCES/TRIGGER', NOT has_table_privilege('authenticated', 'public.staff_shifts', 'TRUNCATE,REFERENCES,TRIGGER');
