-- migration_93_extended_seating_rollback.sql
-- Rollback migration_93

BEGIN;

DROP INDEX IF EXISTS idx_seats_unique_assigned_invitation;
DROP INDEX IF EXISTS idx_seats_table_number;
DROP INDEX IF EXISTS idx_seats_is_vip;
DROP INDEX IF EXISTS idx_seats_assigned_invitation_id;

ALTER TABLE seats DROP CONSTRAINT IF EXISTS seats_assigned_invitation_event_fkey;
ALTER TABLE seats DROP CONSTRAINT IF EXISTS seats_assigned_invitation_id_fkey;

ALTER TABLE seats DROP COLUMN IF EXISTS assigned_invitation_id;
ALTER TABLE seats DROP COLUMN IF EXISTS is_vip;
ALTER TABLE seats DROP COLUMN IF EXISTS table_capacity;
ALTER TABLE seats DROP COLUMN IF EXISTS table_name;
ALTER TABLE seats DROP COLUMN IF EXISTS table_number;

ALTER TABLE event_invitations DROP CONSTRAINT IF EXISTS uq_event_invitations_id_event_id;

COMMIT;

NOTIFY pgrst, 'reload schema';
