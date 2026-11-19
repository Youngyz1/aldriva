-- Rollback for migration_244_permission_check_log.sql.
-- WARNING: drops the table and every logged denial. Idempotent.
DROP FUNCTION IF EXISTS public.staff_log_permission_check(uuid,text,uuid,text);
DROP TRIGGER  IF EXISTS trg_prevent_staff_perm_check_log_mod ON public.staff_permission_check_logs;
DROP TABLE    IF EXISTS public.staff_permission_check_logs;
DROP FUNCTION IF EXISTS public.prevent_staff_permission_check_log_modification();