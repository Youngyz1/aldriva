-- ============================================================
-- Companion verification for migration_242_staff_audit_log.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. Table columns.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='staff_audit_logs'
ORDER BY ordinal_position;
-- Expect 11 rows: id, business_id, actor_user_id, action, subject_type, subject_id,
-- related_role_id, related_permission_id, related_branch_id, changed_fields, created_at.

-- 2. RLS on, one SELECT policy.
SELECT c.relrowsecurity,
       (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS policies,
       (SELECT polcmd FROM pg_policy WHERE polrelid = c.oid LIMIT 1) AS cmd
FROM pg_class c WHERE c.oid = 'public.staff_audit_logs'::regclass;
-- Expect: true / 1 / r.

-- 3. Client privileges: SELECT only for authenticated, nothing for anon.
SELECT has_table_privilege('authenticated','public.staff_audit_logs','SELECT') AS auth_select,
       has_table_privilege('authenticated','public.staff_audit_logs','INSERT') AS auth_insert,
       has_table_privilege('authenticated','public.staff_audit_logs','UPDATE') AS auth_update,
       has_table_privilege('authenticated','public.staff_audit_logs','DELETE') AS auth_delete,
       has_table_privilege('anon','public.staff_audit_logs','SELECT') AS anon_select;
-- Expect: true / false / false / false / false.

-- 4. Six triggers, all enabled.
SELECT tgrelid::regclass AS tbl, tgname, tgenabled
FROM pg_trigger
WHERE tgname IN ('trg_prevent_staff_audit_log_mod',
                 'trg_staff_audit_log_staff_member_lifecycle',
                 'trg_staff_audit_log_staff_member_roles',
                 'trg_staff_audit_log_staff_role_permissions',
                 'trg_staff_audit_log_staff_invitations',
                 'trg_staff_audit_log_branch_scopes')
ORDER BY tgname;
-- Expect 6 rows, all 'O'.

-- 5. Writer functions: SECURITY DEFINER, no client execute.
SELECT p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('staff_audit_log_staff_member_lifecycle','staff_audit_log_staff_member_roles',
                    'staff_audit_log_staff_role_permissions','staff_audit_log_role_permission',
                    'staff_audit_log_staff_invitations','staff_audit_log_branch_scopes')
ORDER BY p.proname;
-- Expect 6 rows: true / false / false.

-- 6. log_branch_write: service_role only.
SELECT p.prosecdef,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'log_branch_write';
-- Expect: true / true / false / false.

-- 7. Log starts empty or holds only rows written since apply.
SELECT count(*) AS rows_so_far FROM public.staff_audit_logs;