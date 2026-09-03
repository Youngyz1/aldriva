-- migration_79b_ticket_checkins_unique_idx_rollback.sql
-- Rollback for migration_79b: restore the plain ticket_instance_id index.

BEGIN;

DROP INDEX IF EXISTS idx_ticket_checkins_instance_id_unique;

CREATE INDEX IF NOT EXISTS idx_ticket_checkins_instance_id
  ON ticket_checkins(ticket_instance_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
