-- migration_75_check_in_ticket_rpc_rollback.sql
--
-- Drops the check_in_ticket() RPC created by
-- migration_75_check_in_ticket_rpc.sql.
--
-- NOTE — application code revert:
-- This file covers the database object only. Two call sites in
-- application code were updated to call check_in_ticket():
--
--   app/api/verify-ticket/route.ts         (POST handler, action=checkin)
--   app/api/dashboard/attendees/bulk/route.ts   (action=check_in loop)
--
-- After running this rollback you MUST also revert those files via:
--
--   git revert <commit-that-introduced-migration-75>
--
-- or restore them manually. The application will crash with a PGRST202
-- "function not found" error on every check-in attempt until the code
-- is rolled back. This matches the pattern used by all prior rollbacks
-- in this codebase (schema only, code revert is a separate git step).
--
-- SAFE AT ANY TIME: nothing else in the schema references
-- check_in_ticket(), so dropping it has no cascade effects.

BEGIN;

DROP FUNCTION IF EXISTS check_in_ticket(UUID);

COMMIT;

NOTIFY pgrst, 'reload schema';
