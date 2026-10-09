-- migration_163_unified_template_rpc_rollback.sql
-- Rollback for migration_163_unified_template_rpc.sql.
-- Drops the function. No data conversion is reversed: rows written through
-- the function keep their selected card/page values (selection state, not
-- derived state). Safe to re-run.

BEGIN;

DROP FUNCTION IF EXISTS public.set_unified_invitation_template(UUID, UUID, TEXT);

COMMIT;

NOTIFY pgrst, 'reload schema';
