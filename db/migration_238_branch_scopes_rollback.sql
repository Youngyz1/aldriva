-- ============================================================
-- Rollback for migration_238_branch_scopes.sql.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- WARNING: step 5 drops staff_members.all_branches and step 4 drops the
-- scopes table, so any scope rows / all_branches values set after 238
-- was applied are lost.
-- ============================================================

-- 1. Drop triggers on staff_members.
DROP TRIGGER IF EXISTS trg_staff_sync_primary_branch_scope ON public.staff_members;
DROP TRIGGER IF EXISTS trg_staff_members_guard_all_branches_change ON public.staff_members;

-- 2. Drop the guard trigger on the scopes table (guarded: table may be gone).
DO $$
BEGIN
  IF to_regclass('public.staff_member_branch_scopes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_staff_member_branch_scopes_guard_primary_delete
      ON public.staff_member_branch_scopes;
  END IF;
END;
$$;

-- 3. Drop the functions.
DROP FUNCTION IF EXISTS public.staff_sync_primary_branch_scope();
DROP FUNCTION IF EXISTS public.staff_member_branch_scopes_guard_primary_delete();
DROP FUNCTION IF EXISTS public.staff_members_guard_all_branches_change();

-- 4. Drop the table (its policies and indexes go with it).
DROP TABLE IF EXISTS public.staff_member_branch_scopes;

-- 5. Drop the column.
ALTER TABLE public.staff_members DROP COLUMN IF EXISTS all_branches;