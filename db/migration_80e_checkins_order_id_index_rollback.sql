-- migration_80e_checkins_order_id_index_rollback.sql
-- Rollback for migration_80e: restore the legacy unique ticket_checkins(ticket_order_id) index.

BEGIN;

DROP INDEX IF EXISTS idx_ticket_checkins_order_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_checkins_order_id
  ON ticket_checkins(ticket_order_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
