-- migration_124_offline_sync_and_conflicts_rollback.sql
-- Rollback for Phase C offline write queue, sync endpoint & conflicts schema

BEGIN;

-- Drop conflicts table
DROP TABLE IF EXISTS offline_scan_conflicts CASCADE;

-- Revert columns on ticket_checkins
ALTER TABLE ticket_checkins DROP COLUMN IF EXISTS delegating_user_id;
ALTER TABLE ticket_checkins DROP COLUMN IF EXISTS offline_scanned_at;

-- Revert scan_source constraint to original
ALTER TABLE ticket_checkins DROP CONSTRAINT IF EXISTS ticket_checkins_scan_source_check;
ALTER TABLE ticket_checkins ADD CONSTRAINT ticket_checkins_scan_source_check CHECK (scan_source IN ('online', 'offline'));

COMMIT;

NOTIFY pgrst, 'reload schema';
