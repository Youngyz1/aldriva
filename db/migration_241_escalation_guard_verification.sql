-- ============================================================
-- Companion verification for migration_241_escalation_guard.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. Escalation function: SECURITY DEFINER, not executable by clients.
SELECT p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'staff_guard_permission_escalation';
-- Expect 1 row: true / false / false.

-- 2. The three escalation triggers exist, enabled, with the right column lists.
SELECT tgrelid::regclass AS tbl, tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgname IN ('trg_staff_role_permissions_guard_escalation',
                 'trg_staff_member_roles_guard_escalation',
                 'trg_staff_invitations_guard_escalation')
ORDER BY tgname;
-- Expect 3 rows, tgenabled 'O':
--   staff_role_permissions: INSERT OR UPDATE OF permission_id, role_id
--   staff_member_roles:     INSERT OR UPDATE OF role_id, is_active
--   staff_invitations:      INSERT OR UPDATE OF role_id

-- 3. Self-edit guard: replaced, still SECURITY INVOKER.
SELECT p.prosecdef,
       p.prosrc LIKE '%staff_has_permission%' AS uses_permission,
       p.prosrc LIKE '%staff_is_accepting_own_invitation%' AS uses_accept_bypass,
       p.prosrc LIKE '%all_branches%' AS protects_all_branches
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'staff_members_guard_self_edit';
-- Expect: false / true / true / true.

-- 4. Self-edit trigger unchanged and enabled.
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger WHERE tgname = 'trg_staff_members_guard_self_edit';
-- Expect 1 row, 'O', BEFORE UPDATE ON public.staff_members.

-- 5. Trigger counts per table (user triggers only).
SELECT tgrelid::regclass AS tbl, count(*) AS triggers
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('public.staff_role_permissions'::regclass,
                  'public.staff_member_roles'::regclass,
                  'public.staff_invitations'::regclass)
GROUP BY 1 ORDER BY 1;
-- Expect: staff_invitations 4, staff_member_roles 3, staff_role_permissions 1.