-- migration_100_event_operations_and_audit_rollback.sql
-- Rollback for Phase 7 Event Operations & Audit Trail.
-- WARNING: Destructive rollback. Dropping event_audit_logs will permanently delete the operational audit history.

BEGIN;

DROP TRIGGER IF EXISTS trg_prevent_event_audit_logs_mod ON event_audit_logs;
DROP FUNCTION IF EXISTS prevent_audit_log_modification();
DROP TABLE IF EXISTS event_audit_logs;

ALTER TABLE events
  DROP COLUMN IF EXISTS checkin_window_start,
  DROP COLUMN IF EXISTS checkin_window_end;

ALTER TABLE event_invitations
  DROP COLUMN IF EXISTS rsvp_deadline,
  DROP COLUMN IF EXISTS personal_message,
  DROP COLUMN IF EXISTS operational_notes;

COMMIT;
