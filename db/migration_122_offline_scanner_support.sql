-- migration_122_offline_scanner_support.sql
-- Offline scanner schema support on ticket_checkins table

BEGIN;

-- 1. Add offline scan attribution and idempotency columns
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS offline_scan_id UUID UNIQUE;
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS scan_source TEXT DEFAULT 'online' CHECK (scan_source IN ('online', 'offline'));
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS entrance_id UUID;

-- 2. Indexes for offline audit & fast lookup
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_offline_scan_id ON ticket_checkins(offline_scan_id) WHERE offline_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_entrance_id ON ticket_checkins(entrance_id) WHERE entrance_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
