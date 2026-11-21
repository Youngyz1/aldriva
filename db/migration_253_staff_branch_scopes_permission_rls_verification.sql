-- 253 verification: plain SQL, ONE result set.
-- After apply every row is true. After rollback rows 2, 3, 4, 5 are false; 1, 6, 7, 8 stay true.
SELECT 1 AS n, 'RLS enabled on staff_member_branch_scopes' AS check_name,
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_member_branch_scopes'::regclass) AS ok
UNION ALL
SELECT 2, 'three new policies exist',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
     AND policyname IN ('Staff permission can read staff branch scopes',
                        'Staff permission can grant staff branch scopes',
                        'Staff permission can revoke staff branch scopes')) = 3
UNION ALL
SELECT 3, 'SELECT policy: workforce.view, scope-row branch, staff member in the row business',
  EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_branch_scopes'
            AND p.policyname = 'Staff permission can read staff branch scopes' AND p.cmd = 'SELECT'
            AND p.qual LIKE '%staff_has_permission%' AND p.qual LIKE '%workforce.view%'
            AND p.qual LIKE '%staff_member_branch_scopes.branch_id%'
            AND p.qual LIKE '%sm.business_id = staff_member_branch_scopes.business_id%')
UNION ALL
SELECT 4, 'INSERT and DELETE policies: workforce.update, scope-row branch, staff member in the row business',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_branch_scopes'
     AND p.policyname IN ('Staff permission can grant staff branch scopes',
                          'Staff permission can revoke staff branch scopes')
     AND p.cmd IN ('INSERT', 'DELETE')
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.update%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_member_branch_scopes.branch_id%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%sm.business_id = staff_member_branch_scopes.business_id%') = 2
UNION ALL
SELECT 5, 'all three new policies are for authenticated only',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_branch_scopes'
     AND p.policyname LIKE 'Staff permission can % staff branch scopes'
     AND p.roles = ARRAY['authenticated']::name[]) = 3
UNION ALL
SELECT 6, 'no Staff permission UPDATE policy',
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
                AND cmd = 'UPDATE' AND policyname LIKE 'Staff permission%')
UNION ALL
SELECT 7, 'eight pre-existing policies still present',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
     AND policyname IN ('Business owner can revoke staff branch scopes',
                        'Owner/admin or branch manager can revoke branch scopes',
                        'Business owner can grant staff branch scopes',
                        'Owner/admin or branch manager can grant branch scopes',
                        'Authorized users can view staff member branch scopes',
                        'Business owner can read staff branch scopes',
                        'Business owner can move staff branch scopes',
                        'Owner/admin or branch manager can move branch scopes')) = 8
UNION ALL
SELECT 8, 'staff_has_permission(uuid,text,uuid) present',
  to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NOT NULL
ORDER BY n;