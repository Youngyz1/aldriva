-- migration_80e_checkins_order_id_index.sql
-- Replaces legacy UNIQUE index on ticket_checkins(ticket_order_id) with a non-unique index.
-- Multi-ticket orders contain N ticket_instances, each of which creates an audit row in ticket_checkins.
-- Uniqueness is enforced at the ticket_instance_id level (uq_ticket_checkins_instance_id).

BEGIN;

-- Drop legacy unique index on ticket_checkins(ticket_order_id)
DROP INDEX IF EXISTS idx_ticket_checkins_order_id;

-- Re-create as non-unique index
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_order_id ON ticket_checkins(ticket_order_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
