-- Migration 263 VERIFICATION: one statement, one result set.
-- After the forward file: all 6 rows true.
-- After the rollback: rows 1, 2 and 4 false; rows 3, 5 and 6 true.
SELECT 1 AS n, 'anon has no privileges on rental_bookings'::text AS check_name,
  NOT has_table_privilege('anon', 'public.rental_bookings',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ok
UNION ALL SELECT 2, 'authenticated has no write/truncate/trigger/references',
  NOT has_table_privilege('authenticated', 'public.rental_bookings',
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
UNION ALL SELECT 3, 'authenticated can still select',
  has_table_privilege('authenticated', 'public.rental_bookings', 'SELECT')
UNION ALL SELECT 4, 'anon cannot select',
  NOT has_table_privilege('anon', 'public.rental_bookings', 'SELECT')
UNION ALL SELECT 5, 'service_role keeps its privileges',
  has_table_privilege('service_role', 'public.rental_bookings', 'SELECT,INSERT,UPDATE,DELETE')
UNION ALL SELECT 6, 'row level security still enabled',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rental_bookings'::regclass)
ORDER BY n;