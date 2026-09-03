-- migration_79c_fix_checkins_constraint_rollback.sql
-- Rollback for migration_79c: replace the full unique constraint with the partial unique index from migration_79b.

BEGIN;

ALTER TABLE ticket_checkins
  DROP CONSTRAINT IF EXISTS uq_ticket_checkins_instance_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_checkins_instance_id_unique
  ON ticket_checkins(ticket_instance_id)
  WHERE ticket_instance_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
