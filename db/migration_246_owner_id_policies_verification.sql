-- 1. expect 23 total
SELECT count(*) AS owner_policies FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Business owner can %';
-- 2. per table: staff_members 4, staff_member_roles 4, staff_invitations 4,
--    staff_member_branch_scopes 4, staff_roles 4, staff_role_permissions 1,
--    staff_audit_logs 1, staff_permission_check_logs 1
SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Business owner can %' GROUP BY 1 ORDER BY 1;
-- 3. old policies untouched: staff_members 4, staff_member_roles 4, staff_invitations 4,
--    staff_member_branch_scopes 4, staff_roles 4, staff_role_permissions 2,
--    staff_audit_logs 1, staff_permission_check_logs 1 (these counts are the totals minus the new ones)
SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public' AND policyname NOT LIKE 'Business owner can %'
  AND tablename IN ('staff_members','staff_member_roles','staff_invitations','staff_member_branch_scopes',
                    'staff_roles','staff_role_permissions','staff_audit_logs','staff_permission_check_logs')
GROUP BY 1 ORDER BY 1;
-- 4. longest name (expect <= 62)
SELECT max(octet_length(policyname)) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Business owner can %';