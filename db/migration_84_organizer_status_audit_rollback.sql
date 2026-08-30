-- migration_84_organizer_status_audit_rollback.sql
-- Removes the organizer_status_audit table.

BEGIN;

DROP TABLE IF EXISTS organizer_status_audit;

COMMIT;

NOTIFY pgrst, 'reload schema';
