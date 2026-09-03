-- migration_79b_ticket_checkins_unique_idx.sql
-- Fixup: add UNIQUE index on ticket_checkins(ticket_instance_id)
-- Required for ON CONFLICT (ticket_instance_id) in check_in_ticket RPC.
-- This was omitted from migration_79 which used a plain index instead.

BEGIN;

DROP INDEX IF EXISTS idx_ticket_checkins_instance_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_checkins_instance_id_unique
  ON ticket_checkins(ticket_instance_id)
  WHERE ticket_instance_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
