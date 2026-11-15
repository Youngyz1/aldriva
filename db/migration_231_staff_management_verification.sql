-- ============================================================
-- Companion verification SQL for migration_231_staff_management.sql
-- Read-only queries to run AFTER the migration is applied.
-- Do NOT execute inside a transaction that modifies the schema.
-- ============================================================

-- 1. All ten tables exist.
SELECT t.name AS expected_table, to_regclass('public.' || t.name) IS NOT NULL AS exists
FROM unnest(ARRAY[
  'staff_roles', 'staff_members', 'staff_member_roles', 'staff_permissions',
  'staff_role_permissions', 'staff_availability', 'staff_time_off',
  'staff_skills', 'staff_invitations', 'staff_assignments'
]) AS t(name)
ORDER BY t.name;

-- 2. RLS is enabled on every staff_* table (expect rowsecurity = true for all).
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname LIKE 'staff_%'
ORDER BY relname;

-- 3. No staff_* table has RLS enabled with zero policies.
SELECT c.relname AS table_name, COUNT(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname LIKE 'staff_%'
  AND c.relrowsecurity = true
GROUP BY c.relname
HAVING COUNT(p.polname) = 0;
-- Expect ZERO rows returned.

-- 4. Helper functions exist (5 from the base migration, 5 from hardening).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'staff_resolve_business_organizer',
    'is_staff_branch_manager',
    'staff_is_active_member',
    'staff_touch_updated_at',
    'validate_staff_member_role_assignment',
    'staff_invitee_email_matches',
    'staff_members_guard_self_edit',
    'staff_invitations_validate',
    'staff_assignments_guard_assignee_edit',
    'staff_guard_privileged_role'
  )
ORDER BY p.proname;
-- Expect 10 rows.

-- 5. Platform role seed (expect exactly owner, admin, manager, viewer).
SELECT name, platform_role, business_id
FROM public.staff_roles
WHERE role_scope = 'platform'
ORDER BY name;

-- 5b. Confirm no occupation-specific role was accidentally seeded.
SELECT name FROM public.staff_roles
WHERE role_scope = 'platform'
  AND name IN ('cook', 'courier', 'chef', 'driver', 'scanner');
-- Expect ZERO rows returned.

-- 6. Permission registry seed.
SELECT key, domain, is_active FROM public.staff_permissions ORDER BY key;

-- 7. Platform role -> permission mapping counts.
SELECT sr.name, COUNT(srp.permission_id) AS permission_count
FROM public.staff_roles sr
LEFT JOIN public.staff_role_permissions srp ON srp.role_id = sr.id
WHERE sr.role_scope = 'platform'
GROUP BY sr.name
ORDER BY sr.name;

-- 8. business_workers is untouched: column set should be identical to
-- its pre-231 shape (manually diff against your own baseline -- this
-- query only lists the current columns for comparison).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'business_workers'
ORDER BY ordinal_position;

-- 9. business_branches gained exactly one new constraint from this
-- migration (the composite unique key) and nothing else structural.
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.business_branches'::regclass
ORDER BY conname;

-- 10. Composite tenant-safety foreign keys resolved correctly.
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid::regclass::text LIKE 'public.staff_%'
  AND contype = 'f'
ORDER BY conrelid::regclass::text, conname;

-- 11. Unique (business_id, auth_user_id) partial index exists on staff_members.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'staff_members'
  AND indexname = 'uq_staff_members_business_auth_user';

-- 12. Full policy listing for manual review (names, command, roles).
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'staff_%'
ORDER BY tablename, cmd, policyname;

-- 13. Hardening guard triggers exist on the expected tables.
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND t.tgname IN (
    'trg_staff_members_guard_self_edit',
    'trg_staff_member_roles_guard_privileged',
    'trg_staff_invitations_guard_privileged',
    'trg_staff_invitations_validate',
    'trg_staff_assignments_guard_assignee_edit'
  )
ORDER BY c.relname, t.tgname;
-- Expect 5 rows.
