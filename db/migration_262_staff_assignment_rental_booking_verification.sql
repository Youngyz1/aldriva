-- Migration 262 VERIFICATION: one statement, one result set.
-- After the forward file all 11 rows must be true.
-- After the rollback all rows must be false except row 2 (four policies in total),
-- which is true in both states.
SELECT 1 AS n, 'four new policies exist'::text AS check_name,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_assignments'
      AND policyname IN ('staff_assignments_select','staff_assignments_insert',
                         'staff_assignments_update','staff_assignments_delete')) = 4 AS ok
UNION ALL SELECT 2, 'exactly four policies in total',
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_assignments') = 4
UNION ALL SELECT 3, 'validate trigger exists',
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.staff_assignments'::regclass
      AND tgname = 'trg_staff_assignments_validate' AND NOT tgisinternal)
UNION ALL SELECT 4, 'validate function is security definer',
  coalesce((SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.staff_assignments_validate()')), false)
UNION ALL SELECT 5, 'guard function knows workforce.assignments.manage',
  coalesce(position('workforce.assignments.manage' IN
    (SELECT prosrc FROM pg_proc
      WHERE oid = to_regprocedure('public.staff_assignments_guard_assignee_edit()'))) > 0, false)
UNION ALL SELECT 6, 'anon has no privileges on staff_assignments',
  NOT has_table_privilege('anon', 'public.staff_assignments',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
UNION ALL SELECT 7, 'authenticated has no truncate/trigger/references',
  NOT has_table_privilege('authenticated', 'public.staff_assignments',
    'TRUNCATE,REFERENCES,TRIGGER')
UNION ALL SELECT 8, 'read function exists',
  to_regprocedure('public.get_my_rental_assignments()') IS NOT NULL
UNION ALL SELECT 9, 'anon cannot execute read function',
  to_regprocedure('public.get_my_rental_assignments()') IS NOT NULL
  AND NOT has_function_privilege('anon', 'public.get_my_rental_assignments()', 'EXECUTE')
UNION ALL SELECT 10, 'authenticated can execute read function',
  to_regprocedure('public.get_my_rental_assignments()') IS NOT NULL
  AND has_function_privilege('authenticated', 'public.get_my_rental_assignments()', 'EXECUTE')
UNION ALL SELECT 11, 'read function never touches licence, dob, email, deposit or payment',
  coalesce((SELECT prosrc NOT ILIKE '%driver_%' AND prosrc NOT ILIKE '%customer_email%'
                   AND prosrc NOT ILIKE '%deposit%' AND prosrc NOT ILIKE '%payment%'
            FROM pg_proc WHERE oid = to_regprocedure('public.get_my_rental_assignments()')), false)
ORDER BY n;