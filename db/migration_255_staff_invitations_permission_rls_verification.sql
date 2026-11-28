-- 255 verification: plain SQL, ONE result set.
-- After apply every row is true. After rollback rows 2, 3, 4, 5, 6 are false; 1, 7, 8, 9, 10 stay true.
SELECT 1 AS n, 'RLS enabled on staff_invitations' AS check_name,
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_invitations'::regclass) AS ok
UNION ALL
SELECT 2, 'three new policies exist',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_invitations'
     AND policyname IN ('Staff permission can read staff invitations',
                        'Staff permission can create staff invitations',
                        'Staff permission can revoke staff invitations')) = 3
UNION ALL
SELECT 3, 'SELECT and DELETE policies: workforce.invite at the row branch',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_invitations'
     AND p.policyname IN ('Staff permission can read staff invitations',
                          'Staff permission can revoke staff invitations')
     AND p.cmd IN ('SELECT', 'DELETE')
     AND coalesce(p.qual, '') LIKE '%staff_has_permission(business_id, ''workforce.invite''::text, branch_id)%') = 2
UNION ALL
SELECT 4, 'INSERT policy: workforce.invite at the row branch, pending, accepted_by/at NULL',
  EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = 'staff_invitations'
            AND p.policyname = 'Staff permission can create staff invitations' AND p.cmd = 'INSERT'
            AND p.with_check LIKE '%staff_has_permission(business_id, ''workforce.invite''::text, branch_id)%'
            AND p.with_check LIKE '%pending%'
            AND p.with_check LIKE '%accepted_by IS NULL%'
            AND p.with_check LIKE '%accepted_at IS NULL%')
UNION ALL
SELECT 5, 'no write path beyond INSERT and DELETE: policy set is exactly SELECT, INSERT, DELETE',
  (SELECT count(DISTINCT p.cmd) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_invitations'
     AND p.policyname LIKE 'Staff permission can % staff invitations') = 3
UNION ALL
SELECT 6, 'all three new policies are for authenticated only',
  (SELECT count(*) FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'staff_invitations'
     AND p.policyname LIKE 'Staff permission can % staff invitations'
     AND p.roles = ARRAY['authenticated']::name[]) = 3
UNION ALL
SELECT 7, 'no Staff permission UPDATE policy',
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'staff_invitations'
                AND cmd = 'UPDATE' AND policyname LIKE 'Staff permission%')
UNION ALL
SELECT 8, 'eight pre-existing policies still present',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'staff_invitations'
     AND (policyname IN ('Business or branch managers can revoke staff invitations',
                         'Business owner can revoke staff invitations',
                         'Business or branch managers can create staff invitations',
                         'Business owner can create staff invitations',
                         'Business owner can read staff invitations',
                         'Business owner can update staff invitations',
                         'Managers can update staff invitations')
          OR policyname LIKE 'Staff invitations are readable by business, branch manager,%')) = 8
UNION ALL
SELECT 9, 'five invitation triggers still enabled',
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid = 'public.staff_invitations'::regclass
     AND tgname IN ('trg_staff_audit_log_staff_invitations',
                    'trg_staff_invitations_guard_accept_fields',
                    'trg_staff_invitations_guard_escalation',
                    'trg_staff_invitations_guard_privileged',
                    'trg_staff_invitations_validate')
     AND tgenabled = 'O') = 5
UNION ALL
SELECT 10, 'staff_has_permission(uuid,text,uuid) present',
  to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NOT NULL
ORDER BY n;