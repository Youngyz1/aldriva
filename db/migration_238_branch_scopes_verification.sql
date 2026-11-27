-- ============================================================
-- Companion verification for migration_238_branch_scopes.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. all_branches column: boolean, NOT NULL, default false.
SELECT data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='staff_members' AND column_name='all_branches';
-- Expect: boolean | NO | false

-- 2. Scopes table exists with RLS on.
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_member_branch_scopes'::regclass;
-- Expect: true

-- 3. Exactly four policies with the right commands.
SELECT polname, polcmd FROM pg_policy
WHERE polrelid = 'public.staff_member_branch_scopes'::regclass
ORDER BY polcmd, polname;
-- Expect 4 rows: one each of r (SELECT), a (INSERT), w (UPDATE), d (DELETE).

-- 4. Constraints on the scopes table.
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.staff_member_branch_scopes'::regclass
ORDER BY conname;
-- Expect: pkey, created_by FK, unique (staff_member_id, branch_id),
-- member_fk (staff_member_id, business_id) -> staff_members, CASCADE,
-- branch_fk (branch_id, business_id) -> business_branches, CASCADE.

-- 5. All three triggers exist and are enabled (tgenabled = 'O').
SELECT tgrelid::regclass AS tbl, tgname, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN ('trg_staff_sync_primary_branch_scope',
                 'trg_staff_members_guard_all_branches_change',
                 'trg_staff_member_branch_scopes_guard_primary_delete')
ORDER BY tgname;
-- Expect 3 rows, all tgenabled = 'O'.

-- 6. The new functions are SECURITY DEFINER and not executable by authenticated/anon.
SELECT p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('staff_sync_primary_branch_scope',
                    'staff_member_branch_scopes_guard_primary_delete',
                    'staff_members_guard_all_branches_change');
-- Expect 3 rows: prosecdef true, both exec columns false.

-- 7. Backfill: members with a branch but no scope row.
SELECT sm.id FROM public.staff_members sm
WHERE sm.branch_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.staff_member_branch_scopes s
                  WHERE s.staff_member_id = sm.id AND s.branch_id = sm.branch_id);
-- Expect ZERO rows.

-- 8. Backfill count (staging expectation: 1 member with a branch).
SELECT count(*) AS scope_rows FROM public.staff_member_branch_scopes;
-- Expect 1 on staging as of today.

-- 9. NULL-branch members stay closed.
SELECT id, full_name, all_branches FROM public.staff_members WHERE branch_id IS NULL;
-- Expect 2 rows, all_branches = false for both.

-- 10. is_staff_branch_manager is still the untouched body.
SELECT md5(regexp_replace(lower(pg_get_functiondef('public.is_staff_branch_manager(uuid, uuid)'::regprocedure)), '\s+', ' ', 'g')) AS md5;
-- Expect 4fb89d6fea1a68ffe9ae1bf7a3be16d4