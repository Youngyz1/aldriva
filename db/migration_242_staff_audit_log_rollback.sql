-- ============================================================
-- Rollback for migration_242_staff_audit_log.sql.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- WARNING: step 4 drops staff_audit_logs and every audit row in it.
-- ============================================================

-- 1. Drop the five writer triggers.
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_member_lifecycle ON public.staff_members;
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_member_roles ON public.staff_member_roles;
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_role_permissions ON public.staff_role_permissions;
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_invitations ON public.staff_invitations;
DROP TRIGGER IF EXISTS trg_staff_audit_log_branch_scopes ON public.staff_member_branch_scopes;

-- 2. Drop the writer functions and log_branch_write.
DROP FUNCTION IF EXISTS public.staff_audit_log_staff_member_lifecycle();
DROP FUNCTION IF EXISTS public.staff_audit_log_staff_member_roles();
DROP FUNCTION IF EXISTS public.staff_audit_log_staff_role_permissions();
DROP FUNCTION IF EXISTS public.staff_audit_log_role_permission(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.staff_audit_log_staff_invitations();
DROP FUNCTION IF EXISTS public.staff_audit_log_branch_scopes();
DROP FUNCTION IF EXISTS public.log_branch_write(uuid, uuid, text, uuid, text[]);

-- 3. Drop the append-only trigger, then the table (policy and indexes go with it).
DROP TRIGGER IF EXISTS trg_prevent_staff_audit_log_mod ON public.staff_audit_logs;

-- 4. Drop the table.
DROP TABLE IF EXISTS public.staff_audit_logs;

-- 5. Drop the append-only guard function.
DROP FUNCTION IF EXISTS public.prevent_staff_audit_log_modification();