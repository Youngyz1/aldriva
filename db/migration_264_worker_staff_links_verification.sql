-- Verification for migration 264. ONE statement.
-- Migration APPLIED (forward state): all 9 rows ok = true.
-- Migration ROLLED BACK (pre-state): all 9 rows ok = false (every check requires the link table or the new objects to exist).
SELECT 1 AS n, 'link table exists' AS check_name,
  to_regclass('public.business_worker_staff_links') IS NOT NULL AS ok
UNION ALL
SELECT 2, 'row level security on',
  COALESCE((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.business_worker_staff_links')), false)
UNION ALL
SELECT 3, 'one link per worker (unique on worker_id)',
  EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.business_worker_staff_links') AND c.contype = 'u' AND pg_get_constraintdef(c.oid) = 'UNIQUE (worker_id)')
UNION ALL
SELECT 4, 'both foreign keys (worker and staff, same business)',
  EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.business_worker_staff_links') AND c.contype = 'f' AND pg_get_constraintdef(c.oid) ILIKE '%business_workers%')
  AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.business_worker_staff_links') AND c.contype = 'f' AND pg_get_constraintdef(c.oid) ILIKE '%staff_members%')
UNION ALL
SELECT 5, 'anon has nothing, authenticated has SELECT only',
  CASE WHEN to_regclass('public.business_worker_staff_links') IS NULL THEN false
       ELSE NOT has_table_privilege('anon', 'public.business_worker_staff_links', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND has_table_privilege('authenticated', 'public.business_worker_staff_links', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.business_worker_staff_links', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  END
UNION ALL
SELECT 6, 'select policy exists',
  EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = to_regclass('public.business_worker_staff_links') AND p.polname = 'business_worker_staff_links_select' AND p.polcmd = 'r')
UNION ALL
SELECT 7, 'trigger function exists and is SECURITY DEFINER',
  EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'staff_deactivate_linked_workers' AND p.pronamespace = 'public'::regnamespace AND p.prosecdef)
UNION ALL
SELECT 8, 'both staff_members triggers exist',
  (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.staff_members'::regclass AND t.tgname IN ('trg_staff_members_worker_links_deactivate_upd', 'trg_staff_members_worker_links_deactivate_del')) = 2
UNION ALL
SELECT 9, 'staff-side index exists',
  to_regclass('public.business_worker_staff_links_staff_idx') IS NOT NULL
ORDER BY n;