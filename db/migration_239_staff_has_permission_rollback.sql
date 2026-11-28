-- ============================================================
-- Rollback for migration_239_staff_has_permission.sql.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- If migration 240 or later is applied, roll those back FIRST: their
-- functions, triggers and policies depend on these. The DROPs below
-- have no CASCADE and will fail (safely) if anything still depends on them.
-- ============================================================

-- 1. Drop the guard trigger.
DROP TRIGGER IF EXISTS trg_staff_invitations_guard_accept_fields ON public.staff_invitations;

-- 2. Drop the guard function.
DROP FUNCTION IF EXISTS public.staff_invitations_guard_accept_fields();

-- 3. Drop staff_has_permission.
DROP FUNCTION IF EXISTS public.staff_has_permission(uuid, text, uuid);

-- 4. Drop the accept-bypass helper.
DROP FUNCTION IF EXISTS public.staff_is_accepting_own_invitation(uuid, uuid, uuid);