-- migration_99_guest_import_and_lifecycle_rollback.sql
-- Rollback for migration_99: removes guest import tables and new event_invitations columns.

BEGIN;

-- WARNING: This rollback DROPS data. import batches, import rows, and new invitation fields
-- (image_url, personal_message, rsvp_deadline, lifecycle_state, import_batch_id) will be lost.

DROP TABLE IF EXISTS guest_import_rows;
DROP TABLE IF EXISTS guest_import_batches;

DROP INDEX IF EXISTS idx_event_invitations_lifecycle;
DROP INDEX IF EXISTS idx_event_invitations_import_batch;

ALTER TABLE event_invitations DROP COLUMN IF EXISTS import_batch_id;
ALTER TABLE event_invitations DROP COLUMN IF EXISTS lifecycle_state;
ALTER TABLE event_invitations DROP COLUMN IF EXISTS rsvp_deadline;
ALTER TABLE event_invitations DROP COLUMN IF EXISTS personal_message;
ALTER TABLE event_invitations DROP COLUMN IF EXISTS image_url;

COMMIT;

NOTIFY pgrst, 'reload schema';
