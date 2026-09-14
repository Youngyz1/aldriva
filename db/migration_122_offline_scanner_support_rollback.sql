-- migration_122_offline_scanner_support_rollback.sql

BEGIN;

DROP INDEX IF EXISTS idx_ticket_checkins_offline_scan_id;
DROP INDEX IF EXISTS idx_ticket_checkins_entrance_id;

ALTER TABLE ticket_checkins DROP COLUMN IF EXISTS offline_scan_id;
ALTER TABLE ticket_checkins DROP COLUMN IF EXISTS device_id;
ALTER TABLE ticket_checkins DROP COLUMN IF EXISTS scan_source;
ALTER TABLE ticket_checkins DROP COLUMN IF EXISTS entrance_id;

COMMIT;

NOTIFY pgrst, 'reload schema';
