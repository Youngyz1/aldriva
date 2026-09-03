-- migration_79c_fix_checkins_constraint.sql
-- Fixes ON CONFLICT resolution for check_in_ticket RPC.
-- The partial unique index (WHERE ticket_instance_id IS NOT NULL) is not usable
-- in ON CONFLICT clauses for INSERT without a WHERE predicate. Replace with a
-- full UNIQUE CONSTRAINT on ticket_instance_id to allow ON CONFLICT (ticket_instance_id).

BEGIN;

-- Drop the partial unique index from migration_79b
DROP INDEX IF EXISTS idx_ticket_checkins_instance_id_unique;
DROP INDEX IF EXISTS idx_ticket_checkins_instance_id;

-- Add a true unique constraint (full column, not partial) so ON CONFLICT works
ALTER TABLE ticket_checkins
  DROP CONSTRAINT IF EXISTS uq_ticket_checkins_instance_id;

ALTER TABLE ticket_checkins
  ADD CONSTRAINT uq_ticket_checkins_instance_id UNIQUE (ticket_instance_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
