-- migration_103_organizer_grant_least_privilege_rollback.sql
--
-- EMERGENCY ROLLBACK ONLY. Restores the pre-103 GRANT ALL table-level baseline
-- on public.organizers and therefore RE-OPENS the F-03 grant gap (owner-writable
-- capability/lifecycle/registration columns via REST). Prefer forward-fixing.
--
-- NOTE: this restores table-level access only. The column-level SELECT list
-- from migration 101 remains granted explicitly (harmless redundancy), and any
-- column-level remnants that predated 103 are NOT reconstructed exactly — if a
-- revoked column write proves legitimately necessary, grant that single column
-- forward instead of rolling back.

BEGIN;

GRANT ALL ON TABLE public.organizers TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
