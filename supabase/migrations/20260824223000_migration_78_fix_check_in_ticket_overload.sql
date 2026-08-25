-- 20260824223000_migration_78_fix_check_in_ticket_overload.sql
-- Fixes PostgREST 300 Multiple Choices error (PGRST203) caused by ambiguous function signature overloading.

BEGIN;

DROP FUNCTION IF EXISTS check_in_ticket(UUID);

COMMIT;

NOTIFY pgrst, 'reload schema';
